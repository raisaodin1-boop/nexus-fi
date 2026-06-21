"""Referral system routes."""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel

from db import get_db
from deps import get_current_user
from models import gen_id, now_utc
from notifications_svc import create_notification

router = APIRouter(prefix="/users", tags=["referral"])

REFERRAL_BONUS_POINTS = 50


def _get_or_gen_invite_code(user: dict) -> str:
    """Return existing invite_code or generate one from user_id."""
    if user.get("invite_code"):
        return user["invite_code"]
    return "HODIX-" + user["id"][:8].upper()


@router.get("/me/referral")
async def get_my_referral(user=Depends(get_current_user)):
    db = get_db()

    # Ensure the user has an invite_code saved
    invite_code = user.get("invite_code")
    if not invite_code:
        invite_code = "HODIX-" + user["id"][:8].upper()
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"invite_code": invite_code, "updated_at": now_utc()}},
        )

    # Find all users referred by this user
    referrals_cursor = db.users.find(
        {"referred_by": user["id"]},
        {"full_name": 1, "created_at": 1, "_id": 0},
    )
    referrals = []
    async for doc in referrals_cursor:
        referrals.append({
            "full_name": doc.get("full_name", ""),
            "joined_at": doc.get("created_at", "").isoformat() if hasattr(doc.get("created_at", ""), "isoformat") else str(doc.get("created_at", "")),
        })

    referral_count = len(referrals)
    bonus_points = referral_count * REFERRAL_BONUS_POINTS

    return {
        "invite_code": invite_code,
        "referral_count": referral_count,
        "bonus_points": bonus_points,
        "referrals": referrals,
    }
