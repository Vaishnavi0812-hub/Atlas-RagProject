"""Resolve which workspaces a member can access, and with what role."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Role, WorkspaceVisibility, has_role, lower_role
from app.models import Workspace, WorkspaceMember


def effective_workspace_role(
    workspace: Workspace, org_role: Role | str, grant_role: str | None
) -> Role | None:
    org_role = Role(org_role)
    if has_role(org_role, Role.ADMIN):
        return org_role
    if workspace.visibility == WorkspaceVisibility.ORGANIZATION:
        return org_role
    if grant_role is None:
        return None
    return lower_role(org_role, grant_role)


async def accessible_workspaces(
    db: AsyncSession, organization_id: uuid.UUID, user_id: uuid.UUID, org_role: Role | str
) -> list[tuple[Workspace, Role]]:
    rows = await db.execute(
        select(Workspace, WorkspaceMember.role)
        .outerjoin(
            WorkspaceMember,
            (WorkspaceMember.workspace_id == Workspace.id) & (WorkspaceMember.user_id == user_id),
        )
        .where(Workspace.organization_id == organization_id)
        .order_by(Workspace.created_at)
    )
    result = []
    for workspace, grant_role in rows.all():
        role = effective_workspace_role(workspace, org_role, grant_role)
        if role is not None:
            result.append((workspace, role))
    return result


async def resolve_workspace_role(
    db: AsyncSession, workspace: Workspace, user_id: uuid.UUID, org_role: Role | str
) -> Role | None:
    grant_role = await db.scalar(
        select(WorkspaceMember.role).where(
            WorkspaceMember.workspace_id == workspace.id, WorkspaceMember.user_id == user_id
        )
    )
    return effective_workspace_role(workspace, org_role, grant_role)
