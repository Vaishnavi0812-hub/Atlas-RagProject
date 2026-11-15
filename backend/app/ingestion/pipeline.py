"""Document ingestion pipeline.

    validate → extract → clean → metadata → chunk → embed → index → complete

Each stage is timed and recorded on the ProcessingJob (`events`), and the
document's `stage`/`progress` are committed as work proceeds so the UI can show
real progress. Knowledge-graph stages (entity/relationship extraction, entity
resolution, graph construction) slot in after indexing.

Failure handling:
  * A failure marks the job and document `failed` with a user-presentable
    message; vectors from a partial run are removed so search never returns
    half-indexed documents.
  * If the document is deleted while processing, the job stops quietly and
    removes anything it wrote.
"""

import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from sqlalchemy import delete, select

from app.ai.embeddings import EmbeddingError, get_embedding_provider
from app.db.session import SessionLocal
from app.ingestion import storage
from app.ingestion.chunking import chunk_pages
from app.ingestion.cleaning import clean_text, plural, word_count
from app.ingestion.extraction import ExtractionError, Page, extract
from app.ingestion.validation import FileValidationError, sniff_content
from app.ingestion.vector_store import ChunkVector, delete_document_vectors, upsert_chunk_vectors
from app.models import Document, DocumentChunk, ProcessingJob, Workspace
from app.schemas.workspace import resolve_workspace_settings

logger = logging.getLogger(__name__)

STAGE_LABELS = {
    "queued": "Queued",
    "validating": "Validating file",
    "extracting": "Extracting text",
    "cleaning": "Cleaning text",
    "metadata": "Extracting metadata",
    "chunking": "Chunking",
    "embedding": "Generating embeddings",
    "indexing": "Storing vectors",
    "completed": "Completed",
    "failed": "Failed",
}

# Progress (0–100) at the *start* of each stage.
STAGE_PROGRESS = {
    "validating": 2,
    "extracting": 8,
    "cleaning": 22,
    "metadata": 26,
    "chunking": 30,
    "embedding": 36,
    "indexing": 88,
}
EMBED_PROGRESS_END = 86

USER_ERRORS = (FileValidationError, ExtractionError, EmbeddingError)


class DocumentGone(Exception):
    """The document was deleted while it was being processed."""


def _now() -> datetime:
    return datetime.now(UTC)


class Run:
    """State and bookkeeping for one pipeline run."""

    def __init__(self, db, job: ProcessingJob, doc: Document):
        self.db = db
        self.job = job
        self.doc = doc
        self.events: list[dict] = []
        # Plain copies: ORM attributes are expired after a rollback and can't
        # be lazily reloaded in async code.
        self.doc_id = doc.id
        self.org_id = doc.organization_id
        self.ws_id = doc.workspace_id
        self.current_stage = "queued"

    async def ensure_document(self) -> None:
        exists = await self.db.scalar(select(Document.id).where(Document.id == self.doc.id))
        if exists is None:
            raise DocumentGone()

    async def set_progress(self, stage: str, progress: int) -> None:
        self.current_stage = stage
        self.job.stage = self.doc.stage = stage
        self.job.progress = self.doc.progress = max(0, min(progress, 100))
        await self.db.commit()

    @asynccontextmanager
    async def stage(self, name: str):
        await self.ensure_document()
        await self.set_progress(name, STAGE_PROGRESS.get(name, self.doc.progress))
        event = {"stage": name, "label": STAGE_LABELS.get(name, name), "started_at": _now().isoformat()}
        started = time.perf_counter()
        try:
            yield event
        finally:
            event["finished_at"] = _now().isoformat()
            event["duration_ms"] = round((time.perf_counter() - started) * 1000)
            self.events.append(event)
            self.job.events = list(self.events)


async def process_document(job_id: uuid.UUID) -> str:
    """Run one ingestion job. Returns the final job status."""
    async with SessionLocal() as db:
        job = await db.get(ProcessingJob, job_id)
        if job is None:
            logger.warning("Ingestion job %s not found", job_id)
            return "missing"
        doc = await db.get(Document, job.document_id)
        if doc is None:
            return "missing"
        if job.status in ("completed", "failed"):
            return job.status  # already handled (e.g. duplicate delivery)

        run = Run(db, job, doc)
        started = time.perf_counter()
        job.status = "running"
        job.started_at = _now()
        doc.status = "processing"
        doc.error = None
        doc.processing_started_at = job.started_at
        doc.processing_completed_at = None
        await db.commit()

        try:
            await _run_stages(run)
        except DocumentGone:
            logger.info("Document %s deleted during processing; stopping job %s", run.doc_id, job_id)
            await db.rollback()
            await _discard_vectors(run.org_id, run.ws_id, run.doc_id)
            return "cancelled"
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            stage_label = STAGE_LABELS.get(run.current_stage, "processing").lower()
            if isinstance(exc, USER_ERRORS):
                message = str(exc)
            else:
                logger.exception("Ingestion job %s failed", job_id)
                message = f"Unexpected error while {stage_label}."
            return await _mark_failed(db, run, job_id, message, started)

        elapsed = round((time.perf_counter() - started) * 1000)
        finished = _now()
        job.status = "completed"
        job.stage = doc.stage = "completed"
        job.progress = doc.progress = 100
        job.finished_at = doc.processing_completed_at = finished
        job.duration_ms = doc.processing_ms = elapsed
        job.events = run.events
        doc.status = "completed"
        await db.commit()
        logger.info("Ingested document %s (%s chunks) in %sms", doc.id, doc.chunk_count, elapsed)
        return "completed"


async def _run_stages(run: Run) -> None:
    db, doc, job = run.db, run.doc, run.job
    workspace = await db.get(Workspace, doc.workspace_id)
    config = resolve_workspace_settings(workspace.settings if workspace else {})
    job.settings_snapshot = {"chunk_size": config.chunk_size, "chunk_overlap": config.chunk_overlap}
    path = storage.path_for(doc.storage_key)

    async with run.stage("validating") as event:
        if not path.exists():
            raise FileValidationError("The original file is missing from storage. Upload it again.")
        await asyncio.to_thread(sniff_content, path, doc.file_type)
        event["detail"] = f"{doc.file_type.upper()} · {doc.size_bytes:,} bytes"

    async with run.stage("extracting") as event:
        extracted = await asyncio.to_thread(extract, path, doc.file_type)
        event["detail"] = (
            plural(len(extracted.pages), "page") if doc.file_type == "pdf" else "Single text body"
        )

    async with run.stage("cleaning") as event:
        reflow = doc.file_type == "pdf"
        pages = [Page(p.number, clean_text(p.text, reflow=reflow)) for p in extracted.pages]
        text_chars = sum(len(p.text) for p in pages)
        if text_chars == 0:
            raise ExtractionError("No text remained after cleaning.")
        event["detail"] = plural(text_chars, "character")

    async with run.stage("metadata") as event:
        full_text = "\n\n".join(p.text for p in pages if p.text)
        doc.page_count = len(pages) if doc.file_type == "pdf" else None
        doc.char_count = len(full_text)
        doc.word_count = word_count(full_text)
        doc.doc_metadata = extracted.metadata
        event["detail"] = plural(doc.word_count, "word") + (
            f" · title “{extracted.metadata['title']}”" if extracted.metadata.get("title") else ""
        )

    async with run.stage("chunking") as event:
        _, chunks = chunk_pages(pages, config.chunk_size, config.chunk_overlap)
        if not chunks:
            raise ExtractionError("The document produced no chunks.")
        # Replace any chunks/vectors from a previous run (reprocessing).
        await delete_document_vectors(doc.organization_id, doc.workspace_id, doc.id)
        await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))
        rows = [
            DocumentChunk(
                id=uuid.uuid4(),
                document_id=doc.id,
                organization_id=doc.organization_id,
                workspace_id=doc.workspace_id,
                chunk_index=c.index,
                page_number=c.page_start,
                page_end=c.page_end,
                char_start=c.start,
                char_end=c.end,
                token_estimate=c.token_estimate,
                content=c.text,
                chunk_metadata={},
            )
            for c in chunks
        ]
        db.add_all(rows)
        doc.chunk_count = len(rows)
        await db.flush()
        event["detail"] = (
            f"{plural(len(rows), 'chunk')} · size {config.chunk_size} · overlap {config.chunk_overlap}"
        )

    async with run.stage("embedding") as event:
        provider = get_embedding_provider()
        vectors: list[list[float]] = []
        tokens = 0
        batch = 32
        span = EMBED_PROGRESS_END - STAGE_PROGRESS["embedding"]
        for i in range(0, len(rows), batch):
            await run.ensure_document()
            result = await provider.embed_documents([r.content for r in rows[i : i + batch]])
            vectors.extend(result.vectors)
            tokens += result.token_count or 0
            done = min(i + batch, len(rows))
            await run.set_progress(
                "embedding", STAGE_PROGRESS["embedding"] + round(span * done / len(rows))
            )
        if len(vectors) != len(rows):
            raise EmbeddingError("The embedding provider returned an unexpected number of vectors.")
        doc.embedding_model = provider.identifier
        event["detail"] = f"{plural(len(vectors), 'vector')} · {provider.model}" + (
            f" · {tokens:,} tokens" if tokens else ""
        )

    async with run.stage("indexing") as event:
        await upsert_chunk_vectors(
            [
                ChunkVector(
                    chunk_id=row.id,
                    vector=vector,
                    payload={
                        "organization_id": str(doc.organization_id),
                        "workspace_id": str(doc.workspace_id),
                        "document_id": str(doc.id),
                        "chunk_id": str(row.id),
                        "chunk_index": row.chunk_index,
                        "page_number": row.page_number,
                        "filename": doc.filename,
                        "file_type": doc.file_type,
                        "content": row.content,
                    },
                )
                for row, vector in zip(rows, vectors)
            ]
        )
        # If the document was deleted while we were writing, clean up after ourselves.
        await run.ensure_document()
        event["detail"] = f"{plural(len(vectors), 'point')} in Qdrant"


async def _discard_vectors(org_id: uuid.UUID, ws_id: uuid.UUID, doc_id: uuid.UUID) -> None:
    try:
        await delete_document_vectors(org_id, ws_id, doc_id)
    except Exception:  # noqa: BLE001
        logger.exception("Could not remove vectors for document %s", doc_id)


async def _mark_failed(db, run: Run, job_id: uuid.UUID, message: str, started: float) -> str:
    doc = await db.get(Document, run.doc_id, populate_existing=True)
    job = await db.get(ProcessingJob, job_id, populate_existing=True)
    if doc is None or job is None:
        await _discard_vectors(run.org_id, run.ws_id, run.doc_id)
        return "cancelled"
    # Don't leave a half-indexed document searchable.
    await _discard_vectors(run.org_id, run.ws_id, run.doc_id)
    await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == run.doc_id))
    finished = _now()
    elapsed = round((time.perf_counter() - started) * 1000)
    stage_label = STAGE_LABELS.get(run.current_stage, run.current_stage).lower()
    events = list(run.events)
    events.append(
        {
            "stage": "failed",
            "label": f"Failed during {stage_label}",
            "detail": message,
            "finished_at": finished.isoformat(),
        }
    )
    job.stage = doc.stage = run.current_stage
    job.status = "failed"
    job.error = message
    job.events = events
    job.finished_at = finished
    job.duration_ms = elapsed
    doc.status = "failed"
    doc.error = message
    doc.chunk_count = 0
    doc.processing_completed_at = finished
    doc.processing_ms = elapsed
    await db.commit()
    return "failed"


async def recover_interrupted_jobs(older_than_seconds: int) -> int:
    """Fail jobs left 'running' by a crashed worker so users can retry them."""
    cutoff = datetime.fromtimestamp(time.time() - older_than_seconds, tz=UTC)
    async with SessionLocal() as db:
        jobs = (
            await db.scalars(
                select(ProcessingJob).where(
                    ProcessingJob.status == "running", ProcessingJob.updated_at < cutoff
                )
            )
        ).all()
        for job in jobs:
            job.status = "failed"
            job.error = "Processing was interrupted. Retry to process the document again."
            job.finished_at = _now()
            doc = await db.get(Document, job.document_id)
            if doc and doc.status == "processing":
                doc.status = "failed"
                doc.error = job.error
        await db.commit()
        return len(jobs)
