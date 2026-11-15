import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    OrgContext,
    WorkspaceContext,
    get_org_context,
    get_ws_context,
    require_org_role,
    require_ws_role,
)
from app.core.permissions import ROLE_RANK, Role, has_role, workspace_capabilities
from app.db.session import get_db
from app.models import OrganizationMember, User, Workspace, WorkspaceMember
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceMemberGrant,
    WorkspaceMemberOut,
    WorkspaceOut,
    WorkspacePermissions,
    WorkspaceUpdate,
)
from app.services.activity import record_activity
from app.services.slugs import unique_slug
from app.services.tenant_cleanup import TenantCleanupError, purge_tenant_data
from app.services.workspace_access import accessible_workspaces, effective_workspace_role

router = APIRouter(prefix="/organizations/{organization_id}/workspaces", tags=["workspaces"])


def _out(ws: Workspace, role: Role) -> WorkspaceOut:
    return WorkspaceOut(
        id=ws.id,
        organization_id=ws.organization_id,
        name=ws.name,
        slug=ws.slug,
        description=ws.description,
        visibility=ws.visibility,
        color=ws.color,
        created_at=ws.created_at,
        role=role,
        permissions=WorkspacePermissions(**workspace_capabilities(role)),
    )


async def _slug_for(db: AsyncSession, org_id: uuid.UUID, name: str, exclude: uuid.UUID | None = None):
    async def taken(slug: str) -> bool:
        query = select(Workspace.id).where(Workspace.organization_id == org_id, Workspace.slug == slug)
        if exclude:
            query = query.where(Workspace.id != exclude)
        return bool(await db.scalar(query))

    return await unique_slug(name, taken)


@router.get("", response_model=list[WorkspaceOut])
async def list_workspaces(
    ctx: OrgContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)
) -> list[WorkspaceOut]:
    pairs = await accessible_workspaces(db, ctx.organization.id, ctx.user.id, ctx.role)
    return [_out(ws, role) for ws, role in pairs]


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    payload: WorkspaceCreate,
    ctx: OrgContext = Depends(require_org_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceOut:
    ws = Workspace(
        organization_id=ctx.organization.id,
        name=payload.name,
        slug=await _slug_for(db, ctx.organization.id, payload.name),
        description=payload.description,
        visibility=payload.visibility,
        color=payload.color,
        created_by_id=ctx.user.id,
    )
    db.add(ws)
    await db.flush()
    record_activity(
        db,
        organization_id=ctx.organization.id,
        workspace_id=ws.id,
        actor_id=ctx.user.id,
        action="workspace.created",
        summary=f"created the workspace {ws.name}",
        target_type="workspace",
        target_id=ws.id,
    )
    await db.commit()
    await db.refresh(ws)
    return _out(ws, ctx.role)


@router.get("/{workspace_id}", response_model=WorkspaceOut)
async def get_workspace(ctx: WorkspaceContext = Depends(get_ws_context)) -> WorkspaceOut:
    return _out(ctx.workspace, ctx.role)


@router.patch("/{workspace_id}", response_model=WorkspaceOut)
async def update_workspace(
    payload: WorkspaceUpdate,
    ctx: WorkspaceContext = Depends(require_ws_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceOut:
    ws = ctx.workspace
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] and changes["name"] != ws.name:
        ws.slug = await _slug_for(db, ws.organization_id, changes["name"], exclude=ws.id)
    for field, value in changes.items():
        if field == "name" and value is None:
            continue
        setattr(ws, field, value)
    if changes:
        record_activity(
            db,
            organization_id=ws.organization_id,
            workspace_id=ws.id,
            actor_id=ctx.user.id,
            action="workspace.updated",
            summary=f"updated the workspace {ws.name}",
            target_type="workspace",
            target_id=ws.id,
            details={"fields": sorted(changes.keys())},
        )
    await db.commit()
    await db.refresh(ws)
    return _out(ws, ctx.role)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    ctx: WorkspaceContext = Depends(require_ws_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> Response:
    ws = ctx.workspace
    remaining = await db.scalar(
        select(func.count()).where(Workspace.organization_id == ws.organization_id)
    )
    if (remaining or 0) <= 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An organization needs at least one workspace."
        )
    try:
        await purge_tenant_data(organization_id=ws.organization_id, workspace_id=ws.id)
    except TenantCleanupError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    record_activity(
        db,
        organization_id=ws.organization_id,
        actor_id=ctx.user.id,
        action="workspace.deleted",
        summary=f"deleted the workspace {ws.name}",
        target_type="workspace",
        target_id=ws.id,
    )
    await db.delete(ws)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------
# Workspace access
# --------------------------------------------------------------------------


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberOut])
async def list_workspace_members(
    ctx: WorkspaceContext = Depends(get_ws_context), db: AsyncSession = Depends(get_db)
) -> list[WorkspaceMemberOut]:
    """Everyone in the organization who can access this workspace."""
    rows = await db.execute(
        select(User, OrganizationMember.role, WorkspaceMember.role)
        .join(OrganizationMember, OrganizationMember.user_id == User.id)
        .outerjoin(
            WorkspaceMember,
            (WorkspaceMember.user_id == User.id)
            & (WorkspaceMember.workspace_id == ctx.workspace.id),
        )
        .where(OrganizationMember.organization_id == ctx.workspace.organization_id)
    )
    result = []
    for user, org_role, grant_role in rows.all():
        effective = effective_workspace_role(ctx.workspace, org_role, grant_role)
        if effective is None:
            continue
        if has_role(org_role, Role.ADMIN):
            access = "organization_admin"
        elif ctx.workspace.visibility == "organization":
            access = "organization_wide"
        else:
            access = "granted"
        result.append(
            WorkspaceMemberOut(
                user_id=user.id,
                email=user.email,
                full_name=user.full_name,
                organization_role=Role(org_role),
                workspace_role=Role(grant_role) if grant_role else None,
                effective_role=effective,
                access=access,
            )
        )
    result.sort(key=lambda m: (-ROLE_RANK[m.effective_role], m.full_name.lower()))
    return result


@router.put("/{workspace_id}/members/{user_id}", response_model=WorkspaceMemberOut)
async def grant_workspace_access(
    user_id: uuid.UUID,
    payload: WorkspaceMemberGrant,
    ctx: WorkspaceContext = Depends(require_ws_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceMemberOut:
    row = (
        await db.execute(
            select(User, OrganizationMember.role)
            .join(OrganizationMember, OrganizationMember.user_id == User.id)
            .where(
                OrganizationMember.organization_id == ctx.workspace.organization_id,
                User.id == user_id,
            )
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    user, org_role = row
    if has_role(org_role, Role.ADMIN):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Owners and admins already have access to every workspace.",
        )

    grant = await db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == ctx.workspace.id, WorkspaceMember.user_id == user_id
        )
    )
    if grant is None:
        grant = WorkspaceMember(workspace_id=ctx.workspace.id, user_id=user_id, role=payload.role)
        db.add(grant)
    else:
        grant.role = payload.role
    record_activity(
        db,
        organization_id=ctx.workspace.organization_id,
        workspace_id=ctx.workspace.id,
        actor_id=ctx.user.id,
        action="workspace.access_granted",
        summary=f"gave {user.full_name} {payload.role} access to {ctx.workspace.name}",
        target_type="user",
        target_id=user.id,
    )
    await db.commit()
    effective = effective_workspace_role(ctx.workspace, org_role, payload.role)
    return WorkspaceMemberOut(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        organization_role=Role(org_role),
        workspace_role=Role(payload.role),
        effective_role=effective or Role(org_role),
        access="organization_wide" if ctx.workspace.visibility == "organization" else "granted",
    )


@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_workspace_access(
    user_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_ws_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> Response:
    grant = await db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == ctx.workspace.id, WorkspaceMember.user_id == user_id
        )
    )
    if grant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No explicit access to revoke.")
    user = await db.get(User, user_id)
    await db.delete(grant)
    record_activity(
        db,
        organization_id=ctx.workspace.organization_id,
        workspace_id=ctx.workspace.id,
        actor_id=ctx.user.id,
        action="workspace.access_revoked",
        summary=f"removed {user.full_name if user else 'a member'}'s access to {ctx.workspace.name}",
        target_type="user",
        target_id=user_id,
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
