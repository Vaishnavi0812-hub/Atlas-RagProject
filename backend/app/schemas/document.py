import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

DocumentStatus = Literal["queued", "processing", "completed", "failed"]


class DocumentOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    filename: str
    file_type: str
    content_type: str
    size_bytes: int
    status: DocumentStatus
    stage: str
    stage_label: str
    progress: int
    error: str | None
    page_count: int | None
    char_count: int | None
    word_count: int | None
    chunk_count: int
    entity_count: int
    relationship_count: int
    uploaded_by_name: str | None
    created_at: datetime
    processing_started_at: datetime | None
    processing_completed_at: datetime | None
    processing_ms: int | None
    metadata: dict[str, Any]


class ProcessingEvent(BaseModel):
    stage: str
    label: str
    started_at: str | None = None
    finished_at: str | None = None
    duration_ms: int | None = None
    detail: str | None = None


class ProcessingJobOut(BaseModel):
    id: uuid.UUID
    kind: str
    status: str
    attempt: int
    stage: str
    progress: int
    error: str | None
    events: list[ProcessingEvent]
    settings_snapshot: dict[str, Any]
    triggered_by_name: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    duration_ms: int | None


class DocumentDetail(DocumentOut):
    content_hash: str
    embedding_model: str | None
    jobs: list[ProcessingJobOut]
    can_download: bool


class ChunkOut(BaseModel):
    id: uuid.UUID
    chunk_index: int
    page_number: int | None
    page_end: int | None
    char_start: int
    char_end: int
    token_estimate: int
    content: str


class ChunkPage(BaseModel):
    items: list[ChunkOut]
    total: int
    offset: int
    limit: int


class UploadError(BaseModel):
    filename: str
    error: str
    existing_document_id: uuid.UUID | None = None


class UploadResult(BaseModel):
    documents: list[DocumentOut]
    errors: list[UploadError]


class DocumentStats(BaseModel):
    total: int
    completed: int
    in_progress: int
    failed: int
    chunks: int
    entities: int
    relationships: int
    size_bytes: int
    # Entity/relationship extraction is added with the knowledge graph.
    graph_extraction_enabled: bool
