import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

DOCUMENT_STATUSES = ("queued", "processing", "completed", "failed")


class Document(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (
        # The same file can't be uploaded twice into one workspace.
        UniqueConstraint("workspace_id", "content_hash", name="uq_document_workspace_hash"),
        CheckConstraint(
            "status IN ('queued', 'processing', 'completed', 'failed')", name="valid_status"
        ),
        Index("ix_documents_workspace_created", "workspace_id", "created_at"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE")
    )
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    filename: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(16))  # pdf | docx | txt | markdown
    content_type: Mapped[str] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    content_hash: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(512))

    # Processing state (mirrors the latest job for cheap list queries).
    status: Mapped[str] = mapped_column(String(16), default="queued")
    stage: Mapped[str] = mapped_column(String(32), default="queued")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    processing_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    processing_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    processing_ms: Mapped[int | None] = mapped_column(Integer)

    # Extracted facts.
    page_count: Mapped[int | None] = mapped_column(Integer)
    char_count: Mapped[int | None] = mapped_column(Integer)
    word_count: Mapped[int | None] = mapped_column(Integer)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    entity_count: Mapped[int] = mapped_column(Integer, default=0)
    relationship_count: Mapped[int] = mapped_column(Integer, default=0)
    embedding_model: Mapped[str | None] = mapped_column(String(128))
    doc_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)


class DocumentChunk(UUIDPrimaryKeyMixin, Base):
    """A retrievable passage. Its id is also the Qdrant point id, linking the
    relational record, the vector and (from the graph stage) extracted facts."""

    __tablename__ = "document_chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_chunk_document_index"),
        Index("ix_chunks_workspace", "workspace_id"),
    )

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    chunk_index: Mapped[int] = mapped_column(Integer)
    page_number: Mapped[int | None] = mapped_column(Integer)
    page_end: Mapped[int | None] = mapped_column(Integer)
    char_start: Mapped[int] = mapped_column(Integer)
    char_end: Mapped[int] = mapped_column(Integer)
    token_estimate: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    chunk_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)


class ProcessingJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One run of the ingestion pipeline for a document (history + retries)."""

    __tablename__ = "processing_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'completed', 'failed')", name="valid_status"
        ),
    )

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    triggered_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(16), default="ingest")  # ingest | reprocess | retry
    status: Mapped[str] = mapped_column(String(16), default="queued")
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    stage: Mapped[str] = mapped_column(String(32), default="queued")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    # [{stage, label, started_at, finished_at, duration_ms, detail}]
    events: Mapped[list] = mapped_column(JSONB, default=list)
    settings_snapshot: Mapped[dict] = mapped_column(JSONB, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
