import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.config import settings as app_settings
from app.core.permissions import Role, WorkspaceVisibility
from app.schemas.common import clean_name

WorkspaceColor = Literal["persimmon", "cobalt", "gold", "graphite", "sand"]


class WorkspaceSettings(BaseModel):
    """Per-workspace ingestion and access preferences."""

    chunk_size: int = Field(default_factory=lambda: app_settings.default_chunk_size, ge=300, le=4000)
    chunk_overlap: int = Field(default_factory=lambda: app_settings.default_chunk_overlap, ge=0, le=1000)
    viewers_can_download: bool = True

    @model_validator(mode="after")
    def _overlap_below_half(self) -> "WorkspaceSettings":
        if self.chunk_overlap * 2 > self.chunk_size:
            raise ValueError("Chunk overlap must be at most half the chunk size.")
        return self


def resolve_workspace_settings(raw: dict | None) -> WorkspaceSettings:
    """Stored settings merged over defaults; invalid stored values fall back."""
    try:
        return WorkspaceSettings(**(raw or {}))
    except ValueError:
        return WorkspaceSettings()


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    visibility: WorkspaceVisibility = WorkspaceVisibility.ORGANIZATION
    color: WorkspaceColor = "persimmon"

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return clean_name(v, "Workspace name")

    @field_validator("description")
    @classmethod
    def _desc(cls, v: str | None) -> str | None:
        return v.strip() or None if v else None


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    visibility: WorkspaceVisibility | None = None
    color: WorkspaceColor | None = None
    settings: WorkspaceSettings | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return clean_name(v, "Workspace name") if v is not None else None


class WorkspacePermissions(BaseModel):
    can_view: bool
    can_edit: bool
    can_manage: bool


class WorkspaceOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    slug: str
    description: str | None
    visibility: WorkspaceVisibility
    color: str
    created_at: datetime
    role: Role
    permissions: WorkspacePermissions
    settings: WorkspaceSettings


class WorkspaceMemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    organization_role: Role
    workspace_role: Role | None
    effective_role: Role
    access: Literal["organization_admin", "organization_wide", "granted"]


class WorkspaceMemberGrant(BaseModel):
    role: Literal["editor", "viewer"]
