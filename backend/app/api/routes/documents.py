"""Document library API (workspace-scoped).

Viewers can list, inspect and read chunks. Editors upload, reprocess and
delete. Downloading the original file needs editor rights unless the workspace
allows viewers to download.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_ws_context, require_ws_role
from app.core.config import settings
from app.core.permissions import Role, has_role
from app.db.session import get_db
from app.ingestion import storage
from app.ingestion.pipeline import STAGE_LABELS
from app.ingestion.queue import JobQueue, get_job_queue
from app.ingestion.validation import FileValidationError, receive_upload
from app.ingestion.vector_store import delete_document_vectors
from app.models import Document, DocumentChunk, ProcessingJob, User
from app.schemas.document import (
    ChunkOut,
    ChunkPage,
    DocumentDetail,
    DocumentOut,
    DocumentStats,
    ProcessingJobOut,
    UploadError,
    UploadResult,
)
from app.schemas.workspace import resolve_workspace_settings
from app.services.activity import record_activity

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/organizations/{organization_id}/workspaces/{workspace_id}/documents",
    tags=["documents"],
)


def _out(doc: Document, uploader: str | None) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        workspace_id=doc.workspace_id,
        filename=doc.filename,
        file_type=doc.file_type,
        content_type=doc.content_type,
        size_bytes=doc.size_bytes,
        status=doc.status,
        stage=doc.stage,
        stage_label=STAGE_LABELS.get(doc.stage, doc.stage),
        progress=doc.progress,
        error=doc.error,
        page_count=doc.page_count,
        char_count=doc.char_count,
        word_count=doc.word_count,
        chunk_count=doc.chunk_count,
        entity_count=doc.entity_count,
        relationship_count=doc.relationship_count,
        uploaded_by_name=uploader,
        created_at=doc.created_at,
        processing_started_at=doc.processing_started_at,
        processing_completed_at=doc.processing_completed_at,
        processing_ms=doc.processing_ms,
        metadata=doc.doc_metadata or {},
    )


def _can_download(ctx: WorkspaceContext) -> bool:
    return has_role(ctx.role, Role.EDITOR) or resolve_workspace_settings(ctx.workspace.settings).viewers_can_download


async def _get_document(db: AsyncSession, ctx: WorkspaceContext, document_id: uuid.UUID) -> Document:
    doc = await db.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.workspace_id == ctx.workspace.id,
            Document.organization_id == ctx.workspace.organization_id,
        )
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return doc


async def _enqueue(db: AsyncSession, queue: JobQueue, job: ProcessingJob, doc: Document) -> None:
    try:
        await queue.enqueue_ingestion(job.id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Could not enqueue job %s", job.id)
        message = "The processing queue is unavailable. Try again shortly."
        job.status, job.error = "failed", message
        doc.status, doc.error = "failed", message
        await db.commit()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, message) from exc


# --------------------------------------------------------------------------
# Upload
# --------------------------------------------------------------------------


@router.post("", response_model=UploadResult, status_code=status.HTTP_201_CREATED)
async def upload_documents(
    files: list[UploadFile] = File(...),
    ctx: WorkspaceContext = Depends(require_ws_role(Role.EDITOR)),
    db: AsyncSession = Depends(get_db),
    queue: JobQueue = Depends(get_job_queue),
) -> UploadResult:
    if len(files) > settings.max_files_per_upload:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Upload at most {settings.max_files_per_upload} files at a time.",
        )
    ws = ctx.workspace
    created: list[tuple[Document, ProcessingJob]] = []
    errors: list[UploadError] = []

    for upload in files:
        try:
            received = await receive_upload(upload)
        except FileValidationError as exc:
            errors.append(UploadError(filename=upload.filename or "untitled", error=str(exc)))
            continue

        existing = await db.scalar(
            select(Document).where(
                Document.workspace_id == ws.id, Document.content_hash == received.sha256
            )
        )
        if existing is not None:
            received.temp_path.unlink(missing_ok=True)
            errors.append(
                UploadError(
                    filename=received.filename,
                    error=f"Already in this workspace as “{existing.filename}”.",
                    existing_document_id=existing.id,
                )
            )
            continue

        doc_id = uuid.uuid4()
        key = storage.document_key(ws.organization_id, ws.id, doc_id, received.extension)
        storage.store_from_temp(received.temp_path, key)
        doc = Document(
            id=doc_id,
            organization_id=ws.organization_id,
            workspace_id=ws.id,
            uploaded_by_id=ctx.user.id,
            filename=received.filename,
            file_type=received.file_type,
            content_type=received.content_type,
            size_bytes=received.size_bytes,
            content_hash=received.sha256,
            storage_key=key,
            status="queued",
            stage="queued",
            progress=0,
            chunk_count=0,
            entity_count=0,
            relationship_count=0,
            doc_metadata={},
        )
        job = ProcessingJob(
            document_id=doc_id,
            organization_id=ws.organization_id,
            workspace_id=ws.id,
            triggered_by_id=ctx.user.id,
            kind="ingest",
            status="queued",
            attempt=1,
            stage="queued",
            progress=0,
            events=[],
            settings_snapshot={},
        )
        db.add_all([doc, job])
        created.append((doc, job))

    if created:
        names = [d.filename for d, _ in created]
        record_activity(
            db,
            organization_id=ws.organization_id,
            workspace_id=ws.id,
            actor_id=ctx.user.id,
            action="document.uploaded",
            summary=(
                f"uploaded {names[0]}" if len(names) == 1 else f"uploaded {len(names)} documents"
            ),
            target_type="document",
            target_id=created[0][0].id if len(created) == 1 else None,
            details={"filenames": names[:20]},
        )
        await db.commit()
        for doc, job in created:
            await _enqueue(db, queue, job, doc)
        for doc, _ in created:
            await db.refresh(doc)

    return UploadResult(
        documents=[_out(doc, ctx.user.full_name) for doc, _ in created], errors=errors
    )


# --------------------------------------------------------------------------
# Read
# --------------------------------------------------------------------------


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    ctx: WorkspaceContext = Depends(get_ws_context),
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, max_length=200),
    status_filter: str | None = Query(default=None, alias="status"),
    file_type: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[DocumentOut]:
    query = (
        select(Document, User.full_name)
        .outerjoin(User, User.id == Document.uploaded_by_id)
        .where(
            Document.workspace_id == ctx.workspace.id,
            Document.organization_id == ctx.workspace.organization_id,
        )
    )
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.where(Document.filename.ilike(f"%{escaped}%", escape="\\"))
    if status_filter == "in_progress":
        query = query.where(Document.status.in_(("queued", "processing")))
    elif status_filter:
        query = query.where(Document.status == status_filter)
    if file_type:
        query = query.where(Document.file_type == file_type)
    rows = await db.execute(query.order_by(Document.created_at.desc()).limit(limit))
    return [_out(doc, name) for doc, name in rows.all()]


@router.get("/stats", response_model=DocumentStats)
async def document_stats(
    ctx: WorkspaceContext = Depends(get_ws_context), db: AsyncSession = Depends(get_db)
) -> DocumentStats:
    row = (
        await db.execute(
            select(
                func.count(),
                func.count().filter(Document.status == "completed"),
                func.count().filter(Document.status.in_(("queued", "processing"))),
                func.count().filter(Document.status == "failed"),
                func.coalesce(func.sum(Document.chunk_count), 0),
                func.coalesce(func.sum(Document.entity_count), 0),
                func.coalesce(func.sum(Document.relationship_count), 0),
                func.coalesce(func.sum(Document.size_bytes), 0),
            ).where(Document.workspace_id == ctx.workspace.id)
        )
    ).one()
    return DocumentStats(
        total=row[0],
        completed=row[1],
        in_progress=row[2],
        failed=row[3],
        chunks=row[4],
        entities=row[5],
        relationships=row[6],
        size_bytes=row[7],
        graph_extraction_enabled=False,
    )


@router.get("/{document_id}", response_model=DocumentDetail)
async def get_document(
    document_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_ws_context),
    db: AsyncSession = Depends(get_db),
) -> DocumentDetail:
    doc = await _get_document(db, ctx, document_id)
    uploader = await db.get(User, doc.uploaded_by_id) if doc.uploaded_by_id else None
    jobs = await db.execute(
        select(ProcessingJob, User.full_name)
        .outerjoin(User, User.id == ProcessingJob.triggered_by_id)
        .where(ProcessingJob.document_id == doc.id)
        .order_by(ProcessingJob.created_at.desc())
        .limit(20)
    )
    return DocumentDetail(
        **_out(doc, uploader.full_name if uploader else None).model_dump(),
        content_hash=doc.content_hash,
        embedding_model=doc.embedding_model,
        can_download=_can_download(ctx),
        jobs=[
            ProcessingJobOut(
                id=job.id,
                kind=job.kind,
                status=job.status,
                attempt=job.attempt,
                stage=job.stage,
                progress=job.progress,
                error=job.error,
                events=job.events or [],
                settings_snapshot=job.settings_snapshot or {},
                triggered_by_name=name,
                created_at=job.created_at,
                started_at=job.started_at,
                finished_at=job.finished_at,
                duration_ms=job.duration_ms,
            )
            for job, name in jobs.all()
        ],
    )


@router.get("/{document_id}/chunks", response_model=ChunkPage)
async def list_chunks(
    document_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_ws_context),
    db: AsyncSession = Depends(get_db),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    page: int | None = Query(default=None, ge=1),
) -> ChunkPage:
    doc = await _get_document(db, ctx, document_id)
    base = select(DocumentChunk).where(DocumentChunk.document_id == doc.id)
    if page is not None:
        base = base.where(DocumentChunk.page_number <= page, func.coalesce(DocumentChunk.page_end, DocumentChunk.page_number) >= page)
    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    rows = await db.scalars(base.order_by(DocumentChunk.chunk_index).offset(offset).limit(limit))
    return ChunkPage(
        items=[
            ChunkOut(
                id=c.id,
                chunk_index=c.chunk_index,
                page_number=c.page_number,
                page_end=c.page_end,
                char_start=c.char_start,
                char_end=c.char_end,
                token_estimate=c.token_estimate,
                content=c.content,
            )
            for c in rows
        ],
        total=total or 0,
        offset=offset,
        limit=limit,
    )


def _file_response(doc: Document, disposition: str) -> FileResponse:
    path = storage.path_for(doc.storage_key)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The original file is no longer available.")
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"}
    media_type = doc.content_type
    if disposition == "inline" and doc.file_type != "pdf":
        # Text and Markdown are always shown as inert plain text, never rendered as HTML.
        media_type = "text/plain; charset=utf-8"
        headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'self'"
    return FileResponse(
        path,
        media_type=media_type,
        filename=doc.filename,
        content_disposition_type=disposition,
        headers=headers,
    )


@router.get("/{document_id}/file")
async def view_file(
    document_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_ws_context),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """Inline view of the original (PDF/text) for the preview pane."""
    if not _can_download(ctx):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Viewing originals is disabled for viewers in this workspace.")
    doc = await _get_document(db, ctx, document_id)
    if doc.file_type == "docx":
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Word documents can't be previewed inline; use the extracted text.")
    return _file_response(doc, "inline")


@router.get("/{document_id}/download")
async def download_file(
    document_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_ws_context),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    if not _can_download(ctx):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Downloads are disabled for viewers in this workspace.")
    doc = await _get_document(db, ctx, document_id)
    return _file_response(doc, "attachment")


# --------------------------------------------------------------------------
# Write
# --------------------------------------------------------------------------


@router.post("/{document_id}/reprocess", response_model=DocumentOut)
async def reprocess_document(
    document_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_ws_role(Role.EDITOR)),
    db: AsyncSession = Depends(get_db),
    queue: JobQueue = Depends(get_job_queue),
) -> DocumentOut:
    """Re-run the pipeline (retry after failure, or rebuild with new settings)."""
    doc = await _get_document(db, ctx, document_id)
    if doc.status in ("queued", "processing"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This document is already being processed.")
    last_attempt = await db.scalar(
        select(func.max(ProcessingJob.attempt)).where(ProcessingJob.document_id == doc.id)
    )
    kind = "retry" if doc.status == "failed" else "reprocess"
    job = ProcessingJob(
        document_id=doc.id,
        organization_id=doc.organization_id,
        workspace_id=doc.workspace_id,
        triggered_by_id=ctx.user.id,
        kind=kind,
        status="queued",
        attempt=(last_attempt or 0) + 1,
        stage="queued",
        progress=0,
        events=[],
        settings_snapshot={},
    )
    doc.status, doc.stage, doc.progress, doc.error = "queued", "queued", 0, None
    db.add(job)
    record_activity(
        db,
        organization_id=doc.organization_id,
        workspace_id=doc.workspace_id,
        actor_id=ctx.user.id,
        action=f"document.{kind}",
        summary=f"{'retried' if kind == 'retry' else 'reprocessed'} {doc.filename}",
        target_type="document",
        target_id=doc.id,
    )
    await db.commit()
    await _enqueue(db, queue, job, doc)
    await db.refresh(doc)
    uploader = await db.get(User, doc.uploaded_by_id) if doc.uploaded_by_id else None
    return _out(doc, uploader.full_name if uploader else None)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_ws_role(Role.EDITOR)),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Removes vectors first (so search never returns a deleted document), then
    the original file and the database rows (chunks and jobs cascade)."""
    doc = await _get_document(db, ctx, document_id)
    try:
        await delete_document_vectors(doc.organization_id, doc.workspace_id, doc.id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Vector delete failed for document %s", doc.id)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Could not remove the document's vectors. Try again."
        ) from exc
    storage.delete_document_files(doc.storage_key)
    record_activity(
        db,
        organization_id=doc.organization_id,
        workspace_id=doc.workspace_id,
        actor_id=ctx.user.id,
        action="document.deleted",
        summary=f"deleted {doc.filename}",
        target_type="document",
        target_id=doc.id,
    )
    await db.delete(doc)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
