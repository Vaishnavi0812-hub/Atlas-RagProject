"""Invitation lookup and acceptance by token (the invitee's side)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.permissions import Role
from app.core.rate_limit import enforce_rate_limit
from app.core.security import hash_opaque_token
from app.db.session import get_db
from app.models import Invitation, Organization, OrganizationMember, User
from app.schemas.auth import MembershipSummary
from app.schemas.organization import InvitationPreview
from app.services.activity import record_activity

router = APIRouter(prefix="/invitations", tags=["invitations"])


async def _find(db: AsyncSession, token: str):
    row = (
        await db.execute(
            select(Invitation, Organization)
            .join(Organization, Organization.id == Invitation.organization_id)
            .where(Invitation.token_hash == hash_opaque_token(token))
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This invitation link is not valid.")
    return row[0], row[1]


@router.get("/{token}", response_model=InvitationPreview)
async def preview_invitation(
    token: str, request: Request, db: AsyncSession = Depends(get_db)
) -> InvitationPreview:
    """Public, so the invitee can see what they are joining before signing in.
    Rate-limited to make token guessing impractical."""
    client = request.client.host if request.client else "unknown"
    await enforce_rate_limit(f"invite-preview:{client}", 60, 15 * 60)
    inv, org = await _find(db, token)
    inviter = await db.get(User, inv.invited_by_id) if inv.invited_by_id else None
    return InvitationPreview(
        organization_name=org.name,
        email=inv.email,
        role=Role(inv.role),
        invited_by_name=inviter.full_name if inviter else None,
        status=inv.status_at(datetime.now(UTC)),
        expires_at=inv.expires_at,
    )


@router.post("/{token}/accept", response_model=MembershipSummary)
async def accept_invitation(
    token: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MembershipSummary:
    inv, org = await _find(db, token)
    now = datetime.now(UTC)
    status_now = inv.status_at(now)
    if status_now != "pending":
        raise HTTPException(status.HTTP_410_GONE, f"This invitation has {status_now}.")
    # Invitations are bound to the invited address: a forwarded link cannot be
    # used by someone else.
    if user.email != inv.email:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"This invitation was sent to {inv.email}. Sign in with that address to accept it.",
        )
    existing = await db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org.id, OrganizationMember.user_id == user.id
        )
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "You are already a member.")

    db.add(OrganizationMember(organization_id=org.id, user_id=user.id, role=inv.role))
    inv.accepted_at = now
    inv.accepted_by_id = user.id
    record_activity(
        db,
        organization_id=org.id,
        actor_id=user.id,
        action="member.joined",
        summary=f"joined as {inv.role}",
        target_type="user",
        target_id=user.id,
    )
    await db.commit()
    return MembershipSummary(
        organization_id=org.id,
        organization_name=org.name,
        organization_slug=org.slug,
        role=Role(inv.role),
    )
