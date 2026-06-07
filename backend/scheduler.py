"""APScheduler background jobs for HODIX.

Currently:
  - Daily 09:00 UTC: send SMS reminders to tontine members whose next contribution
    is due within 48 hours (works only if member has E.164 phone + Twilio allowed region).
"""
import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from db import get_db
from sms import send_sms, is_e164

log = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def _next_due_at(tontine: dict) -> datetime | None:
    """Approximate next contribution due date based on creation + frequency + current_cycle."""
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


async def daily_tontine_reminders():
    """Iterate all active tontines and SMS members for contributions due in 48h."""
    db = get_db()
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(hours=48)
    sent = 0
    skipped = 0
    failed = 0

    tontines = await db.tontines.find({"is_active": True}, {"_id": 0}).to_list(1000)
    for t in tontines:
        due_at = _next_due_at(t)
        if not due_at or due_at < now or due_at > window_end:
            continue
        members = await db.tontine_members.find({"tontine_id": t["id"]}, {"_id": 0}).to_list(500)
        for m in members:
            u = await db.users.find_one({"id": m["user_id"]}, {"_id": 0, "phone": 1, "full_name": 1})
            if not u or not is_e164(u.get("phone") or ""):
                skipped += 1
                continue
            body = (
                f"Hodix · Rappel : votre cotisation de {t['contribution_amount']:,.0f} XAF "
                f"pour « {t['name']} » est attendue d'ici 48h. Merci de votre engagement !"
            )
            res = await send_sms(u["phone"], body, user_id=m["user_id"])
            if res.get("ok"):
                sent += 1
            else:
                failed += 1
    log.info("[cron] tontine reminders: sent=%s skipped=%s failed=%s", sent, skipped, failed)
    await db.cron_runs.insert_one({
        "job": "daily_tontine_reminders",
        "sent": sent, "skipped": skipped, "failed": failed,
        "ran_at": now,
    })


def start_scheduler():
    """Start the AsyncIO scheduler. Idempotent."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        daily_tontine_reminders,
        CronTrigger(hour=9, minute=0),
        id="daily_tontine_reminders",
        replace_existing=True,
    )
    _scheduler.start()
    log.info("[cron] APScheduler started (daily tontine reminders @ 09:00 UTC)")
    return _scheduler


def shutdown_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
