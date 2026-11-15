import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import OrgContext, get_current_user, get_org_context, require_org_role
from app.core.config import settings
from app.core.permissions import ROLE_RANK, Role, WorkspaceVisibility
from app.core.security import generate_opaque_token, hash_opaque_token
from app.db.session import get_db
from app.models import (
    ActivityEvent,
    Invitation,
    Organization,
    OrganizationMember,
    User,
    Workspace,
    WorkspaceMember,
)
from app.schemas.activity import ActivityOut
from app.schemas.organization import (
    InvitationCreate,
    InvitationCreated,
    InvitationOut,
    MemberOut,
    MemberRoleUpdate,
    OrganizationCreate,
    OrganizationDetail,
    OrganizationOut,
    OrganizationUpdate,
)
from app.services.activity import record_activity
from app.services.slugs import unique_slug
from app.services.tenant_cleanup import TenantCleanupError, purge_tenant_data
from app.services.workspace_access import accessible_workspaces

router = APIRouter(prefix="/organizations", tags=["organizations"])


# --------------------------------------------------------------------------
# Organizations
# --------------------------------------------------------------------------


async def _org_detail(db: AsyncSession, org: Organization, role: Role) -> OrganizationDetail:
    member_count = await db.scalar(
        select(func.count()).where(OrganizationMember.organization_id == org.id)
    )
    workspace_count = await db.scalar(
        select(func.count()).where(Workspace.organization_id == org.id)
    )
    return OrganizationDetail(
        id=org.id,
        name=org.name,
        slug=org.slug,
        created_at=org.created_at,
        role=role,
        member_count=member_count or 0,
        workspace_count=workspace_count or 0,
    )


@router.get("", response_model=list[OrganizationDetail])
async def list_organizations(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[OrganizationDetail]:
    rows = await db.execute(
        select(Organization, OrganizationMember.role)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(OrganizationMember.user_id == user.id)
        .order_by(Organization.name)
    )
    return [await _org_detail(db, org, Role(role)) for org, role in rows.all()]


@router.post("", response_model=OrganizationDetail, status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: OrganizationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganizationDetail:
    async def slug_taken(slug: str) -> bool:
        return bool(await db.scalar(select(Organization.id).where(Organization.slug == slug)))

    org = Organization(
        name=payload.name, slug=await unique_slug(payload.name, slug_taken), created_by_id=user.id
    )
    db.add(org)
    await db.flush()
    db.add(OrganizationMember(organization_id=org.id, user_id=user.id, role=Role.OWNER))

    # Every organization starts with one open workspace so it is usable at once.
    workspace = Workspace(
        organization_id=org.id,
        name="General",
        slug="general",
        description="Default workspace shared with every member of the organization.",
        visibility=WorkspaceVisibility.ORGANIZATION,
        color="persimmon",
        created_by_id=user.id,
    )
    db.add(workspace)
    await db.flush()
    record_activity(
        db,
        organization_id=org.id,
        actor_id=user.id,
        action="organization.created",
        summary=f"created the organization {org.name}",
        target_type="organization",
        target_id=org.id,
    )
    record_activity(
        db,
        organization_id=org.id,
        workspace_id=workspace.id,
        actor_id=user.id,
        action="workspace.created",
        summary=f"created the workspace {workspace.name}",
        target_type="workspace",
        target_id=workspace.id,
    )
    await db.commit()
    await db.refresh(org)
    return await _org_detail(db, org, Role.OWNER)


@router.get("/{organization_id}", response_model=OrganizationDetail)
async def get_organization(
    ctx: OrgContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)
) -> OrganizationDetail:
    return await _org_detail(db, ctx.organization, ctx.role)


@router.patch("/{organization_id}", response_model=OrganizationDetail)
async def update_organization(
    payload: OrganizationUpdate,
    ctx: OrgContext = Depends(require_org_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> OrganizationDetail:
    old_name = ctx.organization.name
    ctx.organization.name = payload.name
    if old_name != payload.name:
        record_activity(
            db,
            organization_id=ctx.organization.id,
            actor_id=ctx.user.id,
            action="organization.renamed",
            summary=f"renamed the organization from {old_name} to {payload.name}",
            target_type="organization",
            target_id=ctx.organization.id,
        )
    await db.commit()
    await db.refresh(ctx.organization)
    return await _org_detail(db, ctx.organization, ctx.role)


@router.delete("/{organization_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    ctx: OrgContext = Depends(require_org_role(Role.OWNER)),
    db: AsyncSession = Depends(get_db),
) -> Response:
    try:
        await purge_tenant_data(organization_id=ctx.organization.id)
    except TenantCleanupError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    await db.delete(ctx.organization)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------
# Members
# --------------------------------------------------------------------------


@router.get("/{organization_id}/members", response_model=list[MemberOut])
async def list_members(
    ctx: OrgContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)
) -> list[MemberOut]:
    rows = await db.execute(
        select(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .where(OrganizationMember.organization_id == ctx.organization.id)
    )
    members = [
        MemberOut(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=Role(m.role),
            joined_at=m.created_at,
            is_you=user.id == ctx.user.id,
        )
        for m, user in rows.all()
    ]
    members.sort(key=lambda m: (-ROLE_RANK[m.role], m.full_name.lower()))
    return members


async def _get_member(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID):
    row = (
        await db.execute(
            select(OrganizationMember, User)
            .join(User, User.id == OrganizationMember.user_id)
            .where(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.user_id == user_id,
            )
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    return row[0], row[1]


async def _owner_count(db: AsyncSession, org_id: uuid.UUID) -> int:
    return (
        await db.scalar(
            select(func.count()).where(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.role == Role.OWNER,
            )
        )
        or 0
    )


def _assert_can_manage(actor_role: Role, target_role: Role) -> None:
    """Members can only manage members at or below their own rank."""
    if ROLE_RANK[actor_role] < ROLE_RANK[target_role]:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You cannot manage a member with a higher role than yours."
        )


@router.patch("/{organization_id}/members/{user_id}", response_model=MemberOut)
async def update_member_role(
    user_id: uuid.UUID,
    payload: MemberRoleUpdate,
    ctx: OrgContext = Depends(require_org_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> MemberOut:
    membership, user = await _get_member(db, ctx.organization.id, user_id)
    current, new = Role(membership.role), payload.role
    _assert_can_manage(ctx.role, current)
    _assert_can_manage(ctx.role, new)
    if current == Role.OWNER and new != Role.OWNER:
        if await _owner_count(db, ctx.organization.id) <= 1:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "An organization must keep at least one owner. Promote another member first.",
            )
    if current != new:
        membership.role = new
        record_activity(
            db,
            organization_id=ctx.organization.id,
            actor_id=ctx.user.id,
            action="member.role_changed",
            summary=f"changed {user.full_name}'s role from {current.value} to {new.value}",
            target_type="user",
            target_id=user.id,
            details={"from": current.value, "to": new.value},
        )
        await db.commit()
    return MemberOut(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=new,
        joined_at=membership.created_at,
        is_you=user.id == ctx.user.id,
    )


@router.delete("/{organization_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    user_id: uuid.UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Admins remove members at or below their rank; anyone may leave."""
    membership, user = await _get_member(db, ctx.organization.id, user_id)
    leaving = user.id == ctx.user.id
    target_role = Role(membership.role)
    if not leaving:
        if ROLE_RANK[ctx.role] < ROLE_RANK[Role.ADMIN]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can remove members.")
        _assert_can_manage(ctx.role, target_role)
    if target_role == Role.OWNER and await _owner_count(db, ctx.organization.id) <= 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The last owner cannot leave. Transfer ownership or delete the organization.",
        )

    # Drop any workspace grants in this organization along with the membership.
    ws_ids = select(Workspace.id).where(Workspace.organization_id == ctx.organization.id)
    grants = await db.scalars(
        select(WorkspaceMember).where(
            WorkspaceMember.user_id == user.id, WorkspaceMember.workspace_id.in_(ws_ids)
        )
    )
    for grant in grants:
        await db.delete(grant)
    await db.delete(membership)
    record_activity(
        db,
        organization_id=ctx.organization.id,
        actor_id=ctx.user.id,
        action="member.left" if leaving else "member.removed",
        summary="left the organization" if leaving else f"removed {user.full_name}",
        target_type="user",
        target_id=user.id,
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------
# Invitations
# --------------------------------------------------------------------------


def _invitation_out(inv: Invitation, inviter_name: str | None) -> InvitationOut:
    return InvitationOut(
        id=inv.id,
        email=inv.email,
        role=Role(inv.role),
        status=inv.status_at(datetime.now(UTC)),
        invited_by_name=inviter_name,
        created_at=inv.created_at,
        expires_at=inv.expires_at,
    )


def _invite_url(token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/invite/{token}"


@router.get("/{organization_id}/invitations", response_model=list[InvitationOut])
async def list_invitations(
    ctx: OrgContext = Depends(require_org_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[InvitationOut]:
    rows = await db.execute(
        select(Invitation, User.full_name)
        .outerjoin(User, User.id == Invitation.invited_by_id)
        .where(Invitation.organization_id == ctx.organization.id)
        .order_by(Invitation.created_at.desc())
        .limit(100)
    )
    return [_invitation_out(inv, name) for inv, name in rows.all()]


@router.post(
    "/{organization_id}/invitations",
    response_model=InvitationCreated,
    status_code=status.HTTP_201_CREATED,
)
async def create_invitation(
    payload: InvitationCreate,
    ctx: OrgContext = Depends(require_org_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> InvitationCreated:
    _assert_can_manage(ctx.role, payload.role)

    already_member = await db.scalar(
        select(OrganizationMember.id)
        .join(User, User.id == OrganizationMember.user_id)
        .where(
            OrganizationMember.organization_id == ctx.organization.id,
            User.email == payload.email,
        )
    )
    if already_member:
        raise HTTPException(status.HTTP_409_CONFLICT, "This person is already a member.")

    now = datetime.now(UTC)
    # Supersede any outstanding invitation for the same email.
    pending = await db.scalars(
        select(Invitation).where(
            Invitation.organization_id == ctx.organization.id,
            Invitation.email == payload.email,
            Invitation.accepted_at.is_(None),
            Invitation.revoked_at.is_(None),
        )
    )
    for inv in pending:
        inv.revoked_at = now

    token = generate_opaque_token()
    invitation = Invitation(
        organization_id=ctx.organization.id,
        email=payload.email,
        role=payload.role,
        token_hash=hash_opaque_token(token),
        invited_by_id=ctx.user.id,
        expires_at=now + timedelta(days=settings.invitation_expire_days),
    )
    db.add(invitation)
    await db.flush()
    record_activity(
        db,
        organization_id=ctx.organization.id,
        actor_id=ctx.user.id,
        action="invitation.created",
        summary=f"invited {payload.email} as {payload.role.value}",
        target_type="invitation",
        target_id=invitation.id,
    )
    await db.commit()
    await db.refresh(invitation)
    return InvitationCreated(
        **_invitation_out(invitation, ctx.user.full_name).model_dump(),
        invite_url=_invite_url(token),
        token=token,
    )


async def _get_invitation(db: AsyncSession, org_id: uuid.UUID, invitation_id: uuid.UUID):
    inv = await db.scalar(
        select(Invitation).where(
            Invitation.id == invitation_id, Invitation.organization_id == org_id
        )
    )
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    return inv


@router.post(
    "/{organization_id}/invitations/{invitation_id}/regenerate",
    response_model=InvitationCreated,
)
async def regenerate_invitation(
    invitation_id: uuid.UUID,
    ctx: OrgContext = Depends(require_org_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> InvitationCreated:
    """Issue a fresh link (the old one stops working) and extend the expiry."""
    inv = await _get_invitation(db, ctx.organization.id, invitation_id)
    if inv.accepted_at or inv.revoked_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "This invitation is no longer active.")
    _assert_can_manage(ctx.role, Role(inv.role))
    token = generate_opaque_token()
    inv.token_hash = hash_opaque_token(token)
    inv.expires_at = datetime.now(UTC) + timedelta(days=settings.invitation_expire_days)
    await db.commit()
    await db.refresh(inv)
    inviter = await db.get(User, inv.invited_by_id) if inv.invited_by_id else None
    return InvitationCreated(
        **_invitation_out(inv, inviter.full_name if inviter else None).model_dump(),
        invite_url=_invite_url(token),
        token=token,
    )


@router.delete(
    "/{organization_id}/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def revoke_invitation(
    invitation_id: uuid.UUID,
    ctx: OrgContext = Depends(require_org_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> Response:
    inv = await _get_invitation(db, ctx.organization.id, invitation_id)
    if inv.accepted_at is None and inv.revoked_at is None:
        inv.revoked_at = datetime.now(UTC)
        record_activity(
            db,
            organization_id=ctx.organization.id,
            actor_id=ctx.user.id,
            action="invitation.revoked",
            summary=f"revoked the invitation for {inv.email}",
            target_type="invitation",
            target_id=inv.id,
        )
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------
# Activity
# --------------------------------------------------------------------------


@router.get("/{organization_id}/activity", response_model=list[ActivityOut])
async def list_activity(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    workspace_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    before: datetime | None = Query(default=None),
) -> list[ActivityOut]:
    """Events are filtered to workspaces the caller can access, so restricted
    workspace activity never leaks to members without access."""
    accessible = {
        ws.id: ws.name
        for ws, _ in await accessible_workspaces(
            db, ctx.organization.id, ctx.user.id, ctx.role
        )
    }
    if workspace_id is not None and workspace_id not in accessible:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")

    query = (
        select(ActivityEvent, User.full_name)
        .outerjoin(User, User.id == ActivityEvent.actor_id)
        .where(ActivityEvent.organization_id == ctx.organization.id)
    )
    if workspace_id is not None:
        query = query.where(ActivityEvent.workspace_id == workspace_id)
    else:
        query = query.where(
            ActivityEvent.workspace_id.is_(None)
            | ActivityEvent.workspace_id.in_(list(accessible.keys()))
        )
    if before is not None:
        query = query.where(ActivityEvent.created_at < before)
    rows = await db.execute(query.order_by(ActivityEvent.created_at.desc()).limit(limit))
    return [
        ActivityOut(
            id=event.id,
            action=event.action,
            summary=event.summary,
            target_type=event.target_type,
            target_id=event.target_id,
            workspace_id=event.workspace_id,
            workspace_name=accessible.get(event.workspace_id) if event.workspace_id else None,
            actor_id=event.actor_id,
            actor_name=actor_name,
            details=event.details or {},
            created_at=event.created_at,
        )
        for event, actor_name in rows.all()
    ]
