"""APScheduler background jobs for HODIX.

Jobs:
  08:00 UTC — push_reminders_j1   : Expo push to members with contribution due in 24 h
  09:00 UTC — sms_reminders_j2    : SMS to members with contribution due in 48 h
  00:05 UTC — cleanup_push_tokens : Remove stale / invalid Expo tokens flagged by receipts
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from db import get_db
from models import gen_id, now_utc

log = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None

# ─── Helpers ───────────────────────────────────────────────────────────────────

def _next_due_at(tontine: dict) -> datetime | None:
    """Return the next contribution due date for a tontine based on its frequency."""
    created = tontine.get("created_at")
    if isinstance(created, str):
        created = datetime.fromisoformat(created.replace("Z", "+00:00"))
    if not created:
        return None
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    freq = tontine.get("frequency", "monthly")
    cycle = tontine.get("current_cycle", 1)
    step_days = {"daily": 1, "weekly": 7, "biweekly": 14, "monthly": 30}.get(freq, 30)
    return created + timedelta(days=step_days * cycle)


def _dedup_key(tontine_id: str, user_id: str, cycle: int, job: str) -> str:
    return f"reminder:{job}:{tontine_id}:{user_id}:{cycle}"


async def _already_sent(db, key: str) -> bool:
    return bool(await db.reminder_dedup.find_one({"key": key}))


async def _mark_sent(db, key: str, ttl_hours: int = 30) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=ttl_hours)
    await db.reminder_dedup.update_one(
        {"key": key},
        {"$set": {"key": key, "expires_at": expires_at}},
        upsert=True,
    )


# ─── Job 1: J-1 Push notifications ────────────────────────────────────────────

async def push_reminders_j1() -> None:
    """
    Runs daily at 08:00 UTC.
    Sends an Expo push notification to every tontine member whose next contribution
    is due within the next 24 hours and who hasn't paid for the current cycle.
    Uses deduplication so a member only receives one push per cycle.
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    window_start = now
    window_end = now + timedelta(hours=24)

    tontines = await db.tontines.find({"is_active": True}, {"_id": 0}).to_list(2000)

    total_sent = 0
    total_skipped = 0

    for t in tontines:
        due_at = _next_due_at(t)
        if not due_at or due_at < window_start or due_at > window_end:
            continue

        tontine_id = t["id"]
        cycle = t.get("current_cycle", 1)
        amount = t.get("contribution_amount", 0)
        name = t.get("name", "votre tontine")

        # Find members who haven't paid this cycle
        members = await db.tontine_members.find(
            {"tontine_id": tontine_id}, {"user_id": 1, "_id": 0}
        ).to_list(500)

        paid_user_ids = {
            doc["user_id"]
            for doc in await db.tontine_contributions.find(
                {"tontine_id": tontine_id, "cycle": cycle}, {"user_id": 1, "_id": 0}
            ).to_list(500)
        }

        for m in members:
            uid = m["user_id"]
            if uid in paid_user_ids:
                total_skipped += 1
                continue

            key = _dedup_key(tontine_id, uid, cycle, "push_j1")
            if await _already_sent(db, key):
                total_skipped += 1
                continue

            token_doc = await db.push_tokens.find_one({"user_id": uid})
            token = (token_doc or {}).get("token", "")
            if not token.startswith("ExponentPushToken["):
                total_skipped += 1
                continue

            # Insert in-app notification
            notif_doc = {
                "id": gen_id(),
                "user_id": uid,
                "title": f"⏰ Cotisation due demain — {name}",
                "body": f"Votre cotisation de {amount:,.0f} XAF est attendue demain. Payez maintenant pour rester à jour.",
                "kind": "warning",
                "is_read": False,
                "action_url": f"/tontines/{tontine_id}",
                "created_at": now_utc(),
            }
            await db.notifications.insert_one(notif_doc)

            # Send push
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post(
                        "https://exp.host/--/api/v2/push/send",
                        json={
                            "to": token,
                            "title": f"⏰ Cotisation due demain — {name}",
                            "body": f"Votre cotisation de {amount:,.0f} XAF est attendue demain.",
                            "data": {
                                "tontine_id": tontine_id,
                                "action_url": f"/tontines/{tontine_id}",
                                "kind": "warning",
                            },
                            "sound": "default",
                            "channelId": "reminders",
                            "priority": "high",
                        },
                        headers={"Accept": "application/json"},
                    )
                await _mark_sent(db, key)
                total_sent += 1
            except Exception as exc:
                log.warning("push_j1 failed for user %s / tontine %s: %s", uid, tontine_id, exc)

    log.info("[cron] push_reminders_j1: sent=%s skipped=%s", total_sent, total_skipped)
    await db.cron_runs.insert_one({
        "job": "push_reminders_j1",
        "sent": total_sent,
        "skipped": total_skipped,
        "ran_at": now,
    })


# ─── Job 2: J-2 SMS reminders (unchanged logic, just renamed) ─────────────────

async def sms_reminders_j2() -> None:
    """
    Runs daily at 09:00 UTC.
    Sends an SMS to tontine members with contribution due within 48 hours.
    Requires E.164 phone number + Twilio / allowed region.
    """
    try:
        from sms import send_sms, is_e164  # noqa: PLC0415
    except ImportError:
        log.warning("[cron] sms module not available, skipping sms_reminders_j2")
        return

    db = get_db()
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(hours=48)
    sent = skipped = failed = 0

    tontines = await db.tontines.find({"is_active": True}, {"_id": 0}).to_list(2000)
    for t in tontines:
        due_at = _next_due_at(t)
        if not due_at or due_at < now or due_at > window_end:
            continue

        tontine_id = t["id"]
        cycle = t.get("current_cycle", 1)
        amount = t.get("contribution_amount", 0)
        name = t.get("name", "votre tontine")

        paid_user_ids = {
            doc["user_id"]
            for doc in await db.tontine_contributions.find(
                {"tontine_id": tontine_id, "cycle": cycle}, {"user_id": 1, "_id": 0}
            ).to_list(500)
        }

        members = await db.tontine_members.find(
            {"tontine_id": tontine_id}, {"user_id": 1, "_id": 0}
        ).to_list(500)

        for m in members:
            uid = m["user_id"]
            if uid in paid_user_ids:
                skipped += 1
                continue

            key = _dedup_key(tontine_id, uid, cycle, "sms_j2")
            if await _already_sent(db, key):
                skipped += 1
                continue

            u = await db.users.find_one(
                {"id": uid}, {"_id": 0, "phone": 1, "full_name": 1}
            )
            if not u or not is_e164(u.get("phone") or ""):
                skipped += 1
                continue

            body = (
                f"Hodix · Rappel : votre cotisation de {amount:,.0f} XAF "
                f"pour « {name} » est attendue dans moins de 48h. Merci !"
            )
            res = await send_sms(u["phone"], body, user_id=uid)
            if res.get("ok"):
                await _mark_sent(db, key)
                sent += 1
            else:
                failed += 1

    log.info("[cron] sms_reminders_j2: sent=%s skipped=%s failed=%s", sent, skipped, failed)
    await db.cron_runs.insert_one({
        "job": "sms_reminders_j2",
        "sent": sent, "skipped": skipped, "failed": failed,
        "ran_at": now,
    })


# ─── Job 3: cleanup stale dedup records ───────────────────────────────────────

async def cleanup_dedup() -> None:
    """Runs daily at 00:05 UTC. Removes expired reminder_dedup records."""
    db = get_db()
    now = datetime.now(timezone.utc)
    res = await db.reminder_dedup.delete_many({"expires_at": {"$lt": now}})
    log.info("[cron] cleanup_dedup: deleted=%s stale records", res.deleted_count)


# ─── Scheduler lifecycle ───────────────────────────────────────────────────────

def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    _scheduler = AsyncIOScheduler(timezone="UTC")

    _scheduler.add_job(
        push_reminders_j1,
        CronTrigger(hour=8, minute=0),
        id="push_reminders_j1",
        replace_existing=True,
    )
    _scheduler.add_job(
        sms_reminders_j2,
        CronTrigger(hour=9, minute=0),
        id="sms_reminders_j2",
        replace_existing=True,
    )
    _scheduler.add_job(
        cleanup_dedup,
        CronTrigger(hour=0, minute=5),
        id="cleanup_dedup",
        replace_existing=True,
    )

    _scheduler.start()
    log.info(
        "[cron] APScheduler started — "
        "push_j1@08:00 UTC · sms_j2@09:00 UTC · cleanup@00:05 UTC"
    )
    return _scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
