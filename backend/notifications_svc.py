"""Notifications service — DB writes + Expo Push API."""
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

import httpx

from db import get_db
from deps import get_current_user, require_super_admin
from models import gen_id, now_utc

logger = logging.getLogger(__name__)

# ─── Expo Push API ─────────────────────────────────────────────────────────────

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_EXPO_BATCH_SIZE = 100  # Expo max per request


async def _send_expo_batch(messages: list[dict]) -> None:
    """POST up to 100 Expo push messages in one request. Never raises."""
    if not messages:
        return
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={"Accept": "application/json", "Accept-Encoding": "gzip, deflate"},
            )
            if resp.status_code >= 400:
                logger.warning("Expo push batch returned %s: %s", resp.status_code, resp.text[:200])
            else:
                data = resp.json().get("data", [])
                errors = [d for d in data if d.get("status") == "error"]
                if errors:
                    logger.warning("Expo push batch errors: %s", errors[:5])
    except Exception as exc:
        logger.warning("_send_expo_batch failed: %s", exc)


async def send_push(user_id: str, title: str, body: str, data: dict | None = None) -> None:
    """Send a push notification to a single user. Never raises."""
    try:
        db = get_db()
        token_doc = await db.push_tokens.find_one({"user_id": user_id})
        if not token_doc:
            return
        token = token_doc.get("token", "")
        if not token or not token.startswith("ExponentPushToken["):
            return
        await _send_expo_batch([{
            "to": token,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": "default",
            "channelId": "default",
        }])
    except Exception as exc:
        logger.warning("send_push failed for user %s: %s", user_id, exc)


async def send_push_batch(user_ids: list[str], title: str, body: str, data: dict | None = None) -> dict:
    """
    Send the same push to many users efficiently using Expo batch API.
    Returns {"sent": int, "skipped": int}.
    """
    if not user_ids:
        return {"sent": 0, "skipped": 0}

    db = get_db()
    token_docs = await db.push_tokens.find(
        {"user_id": {"$in": user_ids}}, {"user_id": 1, "token": 1, "_id": 0}
    ).to_list(len(user_ids))

    valid_tokens = [
        d["token"] for d in token_docs
        if d.get("token", "").startswith("ExponentPushToken[")
    ]
    skipped = len(user_ids) - len(valid_tokens)

    messages = [
        {"to": token, "title": title, "body": body, "data": data or {}, "sound": "default", "channelId": "default"}
        for token in valid_tokens
    ]

    # Send in batches of 100
    tasks = [
        _send_expo_batch(messages[i : i + _EXPO_BATCH_SIZE])
        for i in range(0, len(messages), _EXPO_BATCH_SIZE)
    ]
    await asyncio.gather(*tasks, return_exceptions=True)

    return {"sent": len(valid_tokens), "skipped": skipped}


# ─── Notification creation (triggers push automatically) ───────────────────────

async def create_notification(
    user_id: str,
    title: str,
    body: str,
    kind: str = "info",
    action_url: Optional[str] = None,
    push: bool = True,
) -> dict:
    """
    Insert notification in DB, then fire Expo push if the user has a token.
    Analogous to a Supabase Edge Function triggered on INSERT INTO notifications.
    """
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

    # Push — fire-and-forget, never blocks the caller
    if push:
        asyncio.ensure_future(send_push(user_id, title, body, data={"kind": kind, "action_url": action_url or ""}))

    # WebSocket in-app badge update
    try:
        from routes_ws import manager  # noqa: PLC0415
        asyncio.ensure_future(
            manager.send_to_user(user_id, {"type": "notification", "data": {"title": title, "body": body}})
        )
    except Exception:
        pass

    return doc


# ─── Routes ────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/notifications", tags=["notifications"])


class PushTokenPayload(BaseModel):
    token: str


@router.post("/push-token")
async def register_push_token(payload: PushTokenPayload, user=Depends(get_current_user)):
    """Register or update the Expo push token for the authenticated user."""
    token = payload.token.strip()
    if not token.startswith("ExponentPushToken["):
        raise HTTPException(400, "Token Expo invalide.")
    db = get_db()
    await db.push_tokens.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "token": token, "updated_at": now_utc()}},
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
    items = await db.notifications.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    unread = sum(1 for n in items if not n.get("is_read"))
    return {"items": items, "unread_count": unread}


@router.post("/{notif_id}/read")
async def mark_read(notif_id: str, user=Depends(get_current_user)):
    db = get_db()
    res = await db.notifications.update_one(
        {"id": notif_id, "user_id": user["id"]},
        {"$set": {"is_read": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Notification introuvable.")
    return {"detail": "ok"}


@router.post("/read-all")
async def mark_all_read(user=Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_many(
        {"user_id": user["id"], "is_read": False},
        {"$set": {"is_read": True}},
    )
    return {"detail": "ok"}


@router.post("/admin/broadcast")
async def broadcast_notification(payload: dict, admin=Depends(require_super_admin)):
    """Send a notification + push to all / members / a list of user IDs."""
    title = (payload.get("title") or "").strip()
    body = (payload.get("body") or "").strip()
    kind = payload.get("kind", "info")
    target = payload.get("target", "all")

    if not title or not body:
        raise HTTPException(400, "title et body sont requis.")
    if kind not in ("info", "success", "warning"):
        kind = "info"

    db = get_db()
    query: dict
    if isinstance(target, list):
        query = {"id": {"$in": target}, "is_active": True}
    elif target == "members":
        query = {"role": "member", "is_active": True}
    else:
        query = {"is_active": True}

    users = await db.users.find(query, {"id": 1, "_id": 0}).to_list(10000)
    user_ids = [u["id"] for u in users]

    # Insert notifications in bulk (faster than one-by-one)
    now = now_utc()
    docs = [
        {"id": gen_id(), "user_id": uid, "title": title, "body": body,
         "kind": kind, "is_read": False, "created_at": now}
        for uid in user_ids
    ]
    if docs:
        await db.notifications.insert_many(docs)

    # Batch push via Expo
    result = await send_push_batch(user_ids, title, body, data={"kind": kind})

    return {"sent": result["sent"], "notified": len(user_ids), "skipped_push": result["skipped"]}
