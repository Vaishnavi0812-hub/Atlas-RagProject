import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.permissions import Role
from app.schemas.common import ORMModel, clean_name


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return clean_name(v, "Organization name")


class OrganizationUpdate(OrganizationCreate):
    pass


class OrganizationOut(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    created_at: datetime


class OrganizationDetail(OrganizationOut):
    role: Role
    member_count: int
    workspace_count: int


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    role: Role
    joined_at: datetime
    is_you: bool


class MemberRoleUpdate(BaseModel):
    role: Role


class InvitationCreate(BaseModel):
    email: EmailStr
    role: Role = Role.VIEWER

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class InvitationOut(BaseModel):
    id: uuid.UUID
    email: str
    role: Role
    status: Literal["pending", "accepted", "revoked", "expired"]
    invited_by_name: str | None
    created_at: datetime
    expires_at: datetime


class InvitationCreated(InvitationOut):
    """Returned once at creation/regeneration — the only time the link exists."""

    invite_url: str
    token: str


class InvitationPreview(BaseModel):
    organization_name: str
    email: str
    role: Role
    invited_by_name: str | None
    status: Literal["pending", "accepted", "revoked", "expired"]
    expires_at: datetime
