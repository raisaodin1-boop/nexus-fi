"""Fraud and infraction tracking — affects trust score and documents."""
from fastapi import APIRouter, Depends, HTTPException

from db import get_db
from deps import get_current_user, require_super_admin
from models import gen_id, now_utc
from audit import log_event
from notifications_svc import create_notification

fraud_router = APIRouter(tags=["fraud"])

VALID_KINDS = ("fraud", "late_payment", "misconduct", "other")


@fraud_router.post("/admin/fraud/{user_id}")
async def record_infraction(user_id: str, payload: dict, admin=Depends(require_super_admin)):
    """Record an infraction for a user."""
    db = get_db()
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not target:
        raise HTTPException(404, "Utilisateur introuvable.")

    kind = payload.get("kind", "other")
    if kind not in VALID_KINDS:
        raise HTTPException(400, f"kind doit être parmi : {', '.join(VALID_KINDS)}.")
    description = (payload.get("description") or "").strip()
    penalty_points = int(payload.get("penalty_points", 10))
    if penalty_points < 0:
        raise HTTPException(400, "penalty_points doit être positif.")

    infraction = {
        "id": gen_id(),
        "user_id": user_id,
        "kind": kind,
        "description": description,
        "penalty_points": penalty_points,
        "recorded_by": admin["id"],
        "created_at": now_utc(),
    }
    await db.infractions.insert_one(infraction)

    # Update trust_score: subtract penalty_points (minimum 0)
    score_doc = await db.trust_scores.find_one({"user_id": user_id})
    if score_doc:
        new_score = max(0, float(score_doc.get("score", 0)) - penalty_points)
        await db.trust_scores.update_one(
            {"user_id": user_id}, {"$set": {"score": new_score, "updated_at": now_utc()}}
        )

    await create_notification(
        user_id, "Infraction enregistrée",
        "Une infraction a été enregistrée sur votre profil Hodix.",
        kind="warning",
    )
    await log_event("user.infraction_recorded", user_id=admin["id"], metadata={"target": user_id, "kind": kind, "points": -penalty_points})

    try:
        from identity_engine import record_identity_event
        await record_identity_event(user_id, "infraction", {"kind": kind, "points": -penalty_points})
    except Exception:
        pass

    infraction.pop("_id", None)
    return infraction


@fraud_router.get("/admin/fraud")
async def list_all_infractions(admin=Depends(require_super_admin)):
    """List all infractions with user email."""
    db = get_db()
    infractions = await db.infractions.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    result = []
    for inf in infractions:
        u = await db.users.find_one({"id": inf["user_id"]}, {"email": 1, "full_name": 1, "_id": 0})
        result.append({
            **inf,
            "user_email": u.get("email") if u else None,
            "user_full_name": u.get("full_name") if u else None,
        })
    return result


@fraud_router.get("/admin/fraud/{user_id}")
async def list_user_infractions(user_id: str, admin=Depends(require_super_admin)):
    """List infractions for a specific user."""
    db = get_db()
    infractions = await db.infractions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return infractions


@fraud_router.get("/users/me/infractions")
async def my_infractions(user=Depends(get_current_user)):
    """User can see their own infractions (no penalty_points, just kind/description/date)."""
    db = get_db()
    infractions = await db.infractions.find(
        {"user_id": user["id"]},
        {"_id": 0, "penalty_points": 0, "recorded_by": 0}
    ).sort("created_at", -1).to_list(500)
    return infractions
