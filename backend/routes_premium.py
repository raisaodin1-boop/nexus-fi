"""Premium engines: identity profile, KYC, tontine status, scheduled jobs."""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from db import get_db
from deps import get_current_user, require_super_admin
from models import gen_id, now_utc
from identity_engine import (
    compute_identity_profile,
    list_identity_events,
    record_identity_event,
    POINTS,
)
from audit import log_event
from notifications_svc import create_notification


# ============== IDENTITY PROFILE ==============
identity_v2_router = APIRouter(prefix="/identity-profile", tags=["identity"])


@identity_v2_router.get("/me")
async def my_identity_profile(user=Depends(get_current_user)):
    profile = await compute_identity_profile(user["id"])
    events = await list_identity_events(user["id"], 20)
    return {"profile": profile, "recent_events": events, "points_rules": POINTS}


# ============== KYC ==============
kyc_router = APIRouter(prefix="/kyc", tags=["kyc"])


@kyc_router.get("/me")
async def my_kyc(user=Depends(get_current_user)):
    db = get_db()
    kyc = await db.kyc_records.find_one({"user_id": user["id"]}, {"_id": 0})
    return kyc or {"user_id": user["id"], "level": 0, "status": "none"}


@kyc_router.post("/level1")
async def submit_kyc_level1(payload: dict, user=Depends(get_current_user)):
    """Level 1: name, phone (E.164), email — verifies basic identity."""
    from sms import is_e164
    full_name = (payload.get("full_name") or "").strip()
    phone = (payload.get("phone") or "").strip()
    email = (payload.get("email") or user["email"]).strip()
    if len(full_name) < 3:
        raise HTTPException(400, "Nom complet requis (3+ caractères).")
    if not is_e164(phone):
        raise HTTPException(400, "Téléphone au format E.164 requis (ex: +237690123456).")

    db = get_db()
    now = now_utc()

    # Optional extended fields
    birth_date = (payload.get("birth_date") or "").strip() or None
    birth_place = (payload.get("birth_place") or "").strip() or None
    residence = (payload.get("residence") or "").strip() or None
    id_number = (payload.get("id_number") or "").strip() or None
    gender = (payload.get("gender") or "").strip() or None
    father_name = (payload.get("father_name") or "").strip() or None
    mother_name = (payload.get("mother_name") or "").strip() or None
    marital_status = (payload.get("marital_status") or "").strip() or None
    children_count_raw = payload.get("children_count")
    children_count: Optional[int] = None
    if children_count_raw is not None and children_count_raw != "":
        try:
            children_count = int(children_count_raw)
        except (ValueError, TypeError):
            pass

    record = {
        "user_id": user["id"],
        "level": 1,
        "status": "approved",
        "full_name": full_name,
        "phone": phone,
        "email": email,
        "submitted_at": now,
        "approved_at": now,
    }

    # Merge optional fields if provided
    for key, val in [
        ("birth_date", birth_date),
        ("birth_place", birth_place),
        ("residence", residence),
        ("id_number", id_number),
        ("gender", gender),
        ("father_name", father_name),
        ("mother_name", mother_name),
        ("marital_status", marital_status),
        ("children_count", children_count),
    ]:
        if val is not None:
            record[key] = val
    await db.kyc_records.update_one(
        {"user_id": user["id"]}, {"$set": record}, upsert=True
    )
    # Sync minimal info to user record
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"full_name": full_name, "phone": phone, "kyc_level": 1, "updated_at": now}}
    )
    # Award identity points (first-time only)
    existing_event = await db.identity_events.find_one({"user_id": user["id"], "event_type": "kyc_completed"})
    if not existing_event:
        await record_identity_event(user["id"], "kyc_completed", {"level": 1})
        await create_notification(
            user["id"], "KYC validé · Niveau 1",
            "Votre identité de base est vérifiée. +5 points d'identité ajoutés.",
            kind="success",
        )
    await log_event("kyc.level1_submitted", user_id=user["id"])
    return {**record, "submitted_at": record["submitted_at"].isoformat()}


@kyc_router.post("/level2")
async def submit_kyc_level2(payload: dict, user=Depends(get_current_user)):
    """Level 2: CNI photo + selfie + address (base64 images).

    In v1 we accept and store, status='pending' awaiting super-admin review.
    """
    db = get_db()
    cni_base64 = payload.get("cni_base64")
    selfie_base64 = payload.get("selfie_base64")
    address = (payload.get("address") or "").strip()
    if not cni_base64 or not selfie_base64 or not address:
        raise HTTPException(400, "CNI, selfie et adresse requis.")

    # Reject extremely large payloads (>4 MB base64) to keep MongoDB doc small.
    for label, data in (("cni", cni_base64), ("selfie", selfie_base64)):
        if len(data) > 4_000_000:
            raise HTTPException(400, f"L'image {label} est trop volumineuse (max ~3 Mo).")

    now = now_utc()
    update = {
        "user_id": user["id"],
        "level": 1,  # Stays at 1 until admin approves
        "status": "pending_review",
        "cni_base64": cni_base64,
        "selfie_base64": selfie_base64,
        "address": address,
        "level2_submitted_at": now,
    }
    await db.kyc_records.update_one({"user_id": user["id"]}, {"$set": update}, upsert=True)
    await log_event("kyc.level2_submitted", user_id=user["id"])
    await create_notification(
        user["id"], "KYC Niveau 2 soumis",
        "Votre dossier est en examen. Vous serez notifié de la décision.",
        kind="info",
    )
    return {"status": "pending_review"}


@kyc_router.get("/level2/pending")
async def kyc_pending(_admin=Depends(require_super_admin)):
    db = get_db()
    items = await db.kyc_records.find(
        {"status": "pending_review"}, {"_id": 0}
    ).to_list(200)
    return items


@kyc_router.get("/level2/{user_id}/documents")
async def kyc_documents(user_id: str, admin=Depends(require_super_admin)):
    """Return full KYC record including base64 documents for admin review."""
    db = get_db()
    record = await db.kyc_records.find_one({"user_id": user_id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Dossier KYC introuvable.")
    user = await db.users.find_one({"id": user_id}, {"full_name": 1, "email": 1, "phone": 1, "_id": 0})
    return {"kyc": record, "user": user}


@kyc_router.post("/level2/{user_id}/approve")
async def approve_kyc_level2(user_id: str, admin=Depends(require_super_admin)):
    db = get_db()
    record = await db.kyc_records.find_one({"user_id": user_id})
    if not record:
        raise HTTPException(404, "Dossier introuvable.")
    if record["status"] != "pending_review":
        raise HTTPException(400, "Dossier déjà traité.")
    await db.kyc_records.update_one(
        {"user_id": user_id},
        {"$set": {"status": "approved", "level": 2, "approved_at": now_utc()}}
    )
    await db.users.update_one({"id": user_id}, {"$set": {"kyc_level": 2, "updated_at": now_utc()}})
    await record_identity_event(user_id, "kyc_completed", {"level": 2})
    await create_notification(
        user_id, "KYC Niveau 2 approuvé",
        "Félicitations, votre identité complète est vérifiée. Vous accédez aux fonctionnalités premium.",
        kind="success",
    )
    await log_event("kyc.level2_approved", user_id=admin["id"], metadata={"target": user_id})
    return {"detail": "approved"}


@kyc_router.post("/level2/{user_id}/reject")
async def reject_kyc_level2(user_id: str, payload: Optional[dict] = None, admin=Depends(require_super_admin)):
    db = get_db()
    record = await db.kyc_records.find_one({"user_id": user_id})
    if not record:
        raise HTTPException(404, "Dossier introuvable.")
    note = (payload or {}).get("note") or "Documents non conformes."
    await db.kyc_records.update_one(
        {"user_id": user_id},
        {"$set": {"status": "rejected", "rejected_at": now_utc(), "decision_note": note}}
    )
    await create_notification(
        user_id, "KYC Niveau 2 refusé", note, kind="warning",
    )
    return {"detail": "rejected"}


# ============== TONTINE STATUS ENGINE ==============
def tontine_member_status(member: dict, tontine: dict) -> str:
    """Compute a member's tontine status: à_jour / en_retard / suspendu."""
    expected_cycles = max(1, tontine.get("current_cycle", 1) - 1)  # past cycles only
    paid = member.get("cycles_paid", 0)
    if paid >= expected_cycles:
        return "a_jour"
    missed = expected_cycles - paid
    if missed >= 3:
        return "suspendu"
    return "en_retard"
