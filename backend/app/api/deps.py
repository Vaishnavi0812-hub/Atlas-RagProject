"""Authentication and authorization dependencies.

Every tenant-scoped route resolves its context through these dependencies:

    get_current_user  → valid, unrevoked session for an active user
    get_org_context   → user is a member of the organization in the path
    get_ws_context    → workspace belongs to that organization AND the user
                        can access it

Non-members receive 404 rather than 403 so the API never confirms that
another tenant's organization or workspace exists.
"""

import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Path, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.permissions import Role, has_role
from app.core.security import AccessToken, decode_access_token
from app.db.session import get_db
from app.models import Organization, OrganizationMember, User, Workspace
from app.services.sessions import is_token_revoked
from app.services.workspace_access import resolve_workspace_role

UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def _extract_token(request: Request) -> str | None:
    header = request.headers.get("Authorization")
    if header and header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.cookies.get(settings.session_cookie_name)


async def get_current_token(request: Request) -> AccessToken:
    raw = _extract_token(request)
    if not raw:
        raise UNAUTHENTICATED
    token = decode_access_token(raw)
    if token is None or await is_token_revoked(token.jti):
        raise UNAUTHENTICATED
    return token


async def get_current_user(
    token: AccessToken = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await db.get(User, token.user_id)
    if user is None or not user.is_active or user.token_version != token.version:
        raise UNAUTHENTICATED
    return user


@dataclass
class OrgContext:
    user: User
    organization: Organization
    membership: OrganizationMember

    @property
    def role(self) -> Role:
        return Role(self.membership.role)


async def get_org_context(
    organization_id: uuid.UUID = Path(),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrgContext:
    row = (
        await db.execute(
            select(Organization, OrganizationMember)
            .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
            .where(Organization.id == organization_id, OrganizationMember.user_id == user.id)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return OrgContext(user=user, organization=row[0], membership=row[1])


def require_org_role(minimum: Role):
    async def dependency(ctx: OrgContext = Depends(get_org_context)) -> OrgContext:
        if not has_role(ctx.role, minimum):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This action requires the {minimum.value} role or higher.",
            )
        return ctx

    return dependency


@dataclass
class WorkspaceContext:
    org: OrgContext
    workspace: Workspace
    role: Role

    @property
    def user(self) -> User:
        return self.org.user


async def get_ws_context(
    workspace_id: uuid.UUID = Path(),
    org: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceContext:
    workspace = await db.scalar(
        select(Workspace).where(
            Workspace.id == workspace_id, Workspace.organization_id == org.organization.id
        )
    )
    if workspace is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    role = await resolve_workspace_role(db, workspace, org.user.id, org.role)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    return WorkspaceContext(org=org, workspace=workspace, role=role)


def require_ws_role(minimum: Role):
    async def dependency(ctx: WorkspaceContext = Depends(get_ws_context)) -> WorkspaceContext:
        if not has_role(ctx.role, minimum):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This action requires the {minimum.value} role or higher in this workspace.",
            )
        return ctx

    return dependency
