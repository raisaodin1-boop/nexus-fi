"""Twilio SMS + Verify OTP helper for HODIX.

Two separate features:
  1. send_sms()      — standard Messages API (reminders, notifications)
  2. send_otp()      — Twilio Verify API (phone verification at registration)
  3. check_otp()     — Verify OTP code entered by user

The Verify service is OPTIONAL — if credentials are missing or Twilio is
unreachable, all functions return ok=False without raising. Registration
is NOT blocked when Twilio is unavailable.
"""
import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional

from db import get_db
from models import gen_id

log = logging.getLogger(__name__)

_E164 = re.compile(r"^\+[1-9]\d{6,14}$")


def is_e164(phone: str) -> bool:
    if not phone:
        return False
    return bool(_E164.match(phone.strip()))


def _client():
    """Return a Twilio Client, or None if credentials are missing."""
    try:
        from twilio.rest import Client
        sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
        tok = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
        if not sid or not tok:
            return None
        return Client(sid, tok)
    except Exception:
        return None


def _verify_service_sid() -> str:
    return os.environ.get("TWILIO_VERIFY_SERVICE_SID", "").strip()


# ─── Twilio Verify OTP ────────────────────────────────────────────────────────

async def send_otp(phone: str, user_id: Optional[str] = None) -> dict:
    """
    Send an OTP to `phone` via Twilio Verify SMS channel.
    Returns {"ok": True, "sid": "..."} on success, {"ok": False, "detail": "..."} on failure.
    Never raises — failures are silently logged.
    """
    db = get_db()
    log_doc = {
        "id": gen_id(),
        "user_id": user_id,
        "phone": phone,
        "kind": "verify_send",
        "status": "queued",
        "sid": None,
        "error": None,
        "created_at": datetime.now(timezone.utc),
    }

    if not is_e164(phone):
        log_doc["status"] = "invalid_phone"
        log_doc["error"] = f"Format invalide: {phone}"
        await db.sms_logs.insert_one(log_doc)
        return {"ok": False, "detail": "Numéro de téléphone invalide. Format attendu: +237XXXXXXXXX"}

    client = _client()
    service_sid = _verify_service_sid()

    if not client or not service_sid:
        log_doc["status"] = "unconfigured"
        log_doc["error"] = "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN ou TWILIO_VERIFY_SERVICE_SID manquant"
        await db.sms_logs.insert_one(log_doc)
        log.warning("[verify] Twilio Verify non configuré — OTP non envoyé")
        return {"ok": False, "detail": "Service de vérification non disponible", "bypass": True}

    try:
        verification = await asyncio.to_thread(
            lambda: client.verify.v2
                .services(service_sid)
                .verifications
                .create(to=phone, channel="sms")
        )
        log_doc["status"] = verification.status   # "pending"
        log_doc["sid"] = verification.sid
        await db.sms_logs.insert_one(log_doc)
        log.info("[verify] OTP envoyé à %s — sid=%s", phone, verification.sid)
        return {"ok": True, "sid": verification.sid, "status": verification.status}
    except Exception as e:
        err = str(e)
        log.warning("[verify] send_otp failed for %s: %s", phone, err)
        log_doc["status"] = "failed"
        log_doc["error"] = err
        await db.sms_logs.insert_one(log_doc)
        return {"ok": False, "detail": "Échec de l'envoi du code. Vérifiez le numéro et réessayez."}


async def check_otp(phone: str, code: str, user_id: Optional[str] = None) -> dict:
    """
    Verify an OTP code via Twilio Verify.
    Returns {"ok": True, "verified": True} on success.
    Returns {"ok": False, "verified": False, "detail": "..."} on failure.
    Never raises.
    """
    db = get_db()
    log_doc = {
        "id": gen_id(),
        "user_id": user_id,
        "phone": phone,
        "kind": "verify_check",
        "status": "queued",
        "sid": None,
        "error": None,
        "created_at": datetime.now(timezone.utc),
    }

    client = _client()
    service_sid = _verify_service_sid()

    if not client or not service_sid:
        log_doc["status"] = "unconfigured"
        await db.sms_logs.insert_one(log_doc)
        # If Twilio is not configured, let it pass (don't block registration)
        return {"ok": True, "verified": True, "bypass": True}

    if not code or len(code.strip()) < 4:
        log_doc["status"] = "invalid_code"
        log_doc["error"] = "Code vide ou trop court"
        await db.sms_logs.insert_one(log_doc)
        return {"ok": False, "verified": False, "detail": "Code de vérification invalide."}

    try:
        result = await asyncio.to_thread(
            lambda: client.verify.v2
                .services(service_sid)
                .verification_checks
                .create(to=phone, code=code.strip())
        )
        verified = result.status == "approved"
        log_doc["status"] = result.status
        log_doc["sid"] = result.sid if hasattr(result, "sid") else None
        await db.sms_logs.insert_one(log_doc)
        if verified:
            log.info("[verify] OTP approuvé pour %s", phone)
            return {"ok": True, "verified": True}
        else:
            return {"ok": False, "verified": False, "detail": "Code incorrect ou expiré. Réessayez."}
    except Exception as e:
        err = str(e)
        log.warning("[verify] check_otp failed for %s: %s", phone, err)
        log_doc["status"] = "failed"
        log_doc["error"] = err
        await db.sms_logs.insert_one(log_doc)
        return {"ok": False, "verified": False, "detail": "Erreur de vérification. Réessayez ou passez cette étape."}


# ─── Standard SMS (notifications, reminders) ─────────────────────────────────

async def send_sms(to_phone: str, body: str, user_id: Optional[str] = None) -> dict:
    """Send a standard SMS via Twilio Messages API."""
    db = get_db()
    record = {
        "id": gen_id(),
        "user_id": user_id,
        "to": to_phone,
        "body": body[:1500],
        "status": "queued",
        "sid": None,
        "error": None,
        "created_at": datetime.now(timezone.utc),
    }

    if not is_e164(to_phone):
        record["status"] = "invalid_phone"
        record["error"] = "Numéro non au format E.164"
        await db.sms_logs.insert_one(record)
        return {"ok": False, "detail": record["error"]}

    client = _client()
    if client is None:
        record["status"] = "unconfigured"
        record["error"] = "Twilio non configuré"
        await db.sms_logs.insert_one(record)
        return {"ok": False, "detail": record["error"]}

    from_number = os.environ.get("TWILIO_FROM_NUMBER", "").strip()
    try:
        from twilio.base.exceptions import TwilioRestException
        msg = await asyncio.to_thread(
            client.messages.create,
            from_=from_number,
            to=to_phone,
            body=body,
        )
        record["status"] = msg.status
        record["sid"] = msg.sid
        await db.sms_logs.insert_one(record)
        return {"ok": True, "sid": msg.sid, "status": msg.status}
    except Exception as e:
        log.warning("[sms] send failed to %s: %s", to_phone, e)
        record["status"] = "failed"
        record["error"] = str(e)
        await db.sms_logs.insert_one(record)
        return {"ok": False, "detail": str(e)}
