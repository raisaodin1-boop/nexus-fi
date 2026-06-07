"""Audit log helper."""
from datetime import datetime, timezone
from typing import Optional
from fastapi import Request
import uuid

from db import get_db


async def log_event(
    action: str,
    user_id: Optional[str] = None,
    request: Optional[Request] = None,
    metadata: Optional[dict] = None,
):
    db = get_db()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "action": action,
        "metadata": metadata or {},
        "ip_address": request.client.host if (request and request.client) else None,
        "user_agent": request.headers.get("user-agent") if request else None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.audit_logs.insert_one(doc)
