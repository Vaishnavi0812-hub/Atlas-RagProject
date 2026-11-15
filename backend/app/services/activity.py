"""Activity (audit) log writer."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityEvent


def record_activity(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    action: str,
    summary: str,
    workspace_id: uuid.UUID | None = None,
    target_type: str | None = None,
    target_id: uuid.UUID | str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Add an event to the current transaction (committed with the change it
    describes, so the log never records actions that were rolled back)."""
    db.add(
        ActivityEvent(
            organization_id=organization_id,
            workspace_id=workspace_id,
            actor_id=actor_id,
            action=action,
            summary=summary[:300],
            target_type=target_type,
            target_id=str(target_id) if target_id else None,
            details=details or {},
        )
    )
