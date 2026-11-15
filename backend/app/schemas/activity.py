import uuid
from datetime import datetime

from pydantic import BaseModel


class ActivityOut(BaseModel):
    id: uuid.UUID
    action: str
    summary: str
    target_type: str | None
    target_id: str | None
    workspace_id: uuid.UUID | None
    workspace_name: str | None
    actor_id: uuid.UUID | None
    actor_name: str | None
    details: dict
    created_at: datetime
