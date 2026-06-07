"""Notifications service & routes."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

import httpx

from db import get_db
from deps import get_current_user, require_super_admin
from models import gen_id, now_utc

logger = logging.getLogger(__name__)


async def send_push(user_id: str, title: str, body: str, data: dict = {}):
    """Look up push token for user and send Expo push notification. Never raises."""
    try:
        db = get_db()
        token_doc = await db.push_tokens.find_one({"user_id": user_id})
        if not token_doc:
            return
        token = token_doc.get("token")
        if not token:
            return
        payload = {
            "to": token,
            "title": title,
            "body": body,
            "data": data,
        }
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post("https://exp.host/--/api/v2/push/send", json=payload)
    except Exception as e:
        logger.warning("send_push failed for user %s: %s", user_id, e)


async def create_notification(
    user_id: str, title: str, body: str,
    kind: str = "info", action_url: Optional[str] = None
):
    db = get_db()
    doc = {
        "id": gen_id(),
        "user_id": user_id,
        "title": title,
        "body": body,
        "kind": kind,
        "is_read": False,
        "action_url": action_url,
        "created_at": now_utc(),
    }
    await db.notifications.insert_one(doc)
    # Fire-and-forget push notification (non-blocking)
    await send_push(user_id, title, body)
    try:
        from routes_ws import manager
        await manager.send_to_user(str(user_id), {"type": "notification", "data": {"title": title, "body": body}})
    except Exception:
        pass
    return doc


router = APIRouter(prefix="/notifications", tags=["notifications"])


class PushTokenPayload(BaseModel):
    token: str


@router.post("/push-token")
async def register_push_token(payload: PushTokenPayload, user=Depends(get_current_user)):
    db = get_db()
    await db.push_tokens.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "token": payload.token, "updated_at": now_utc()}},
        upsert=True,
    )
    return {"detail": "ok"}


@router.delete("/push-token")
async def unregister_push_token(user=Depends(get_current_user)):
    db = get_db()
    await db.push_tokens.delete_one({"user_id": user["id"]})
    return {"detail": "ok"}


@router.get("")
async def list_notifications(user=Depends(get_current_user)):
    db = get_db()
    items = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    unread = sum(1 for n in items if not n.get("is_read"))
    return {"items": items, "unread_count": unread}


@router.post("/{notif_id}/read")
async def mark_read(notif_id: str, user=Depends(get_current_user)):
    db = get_db()
    res = await db.notifications.update_one(
        {"id": notif_id, "user_id": user["id"]},
        {"$set": {"is_read": True}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Notification introuvable.")
    return {"detail": "ok"}


@router.post("/read-all")
async def mark_all_read(user=Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_many({"user_id": user["id"], "is_read": False}, {"$set": {"is_read": True}})
    return {"detail": "ok"}


@router.post("/admin/broadcast")
async def broadcast_notification(payload: dict, admin=Depends(require_super_admin)):
    """Send a promotion/announcement to all active users or specific users."""
    title = (payload.get("title") or "").strip()
    body = (payload.get("body") or "").strip()
    kind = payload.get("kind", "info")
    target = payload.get("target", "all")

    if not title or not body:
        raise HTTPException(400, "title et body sont requis.")
    if kind not in ("info", "success", "warning"):
        kind = "info"

    db = get_db()
    if isinstance(target, list):
        users = await db.users.find({"id": {"$in": target}, "is_active": True}, {"id": 1, "_id": 0}).to_list(10000)
    elif target == "members":
        users = await db.users.find({"role": "member", "is_active": True}, {"id": 1, "_id": 0}).to_list(10000)
    else:
        # "all" — every active user
        users = await db.users.find({"is_active": True}, {"id": 1, "_id": 0}).to_list(10000)

    count = 0
    for u in users:
        await create_notification(u["id"], title, body, kind=kind)
        count += 1

    return {"sent": count}
