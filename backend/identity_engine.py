"""HODIX Identity Engine.

Point-based event system that drives the user's financial identity over time.
Each significant action records an event with a point delta. Levels are computed
from cumulative points (Bronze / Silver / Gold / Platinum).

Point rules (configurable):
  contribution_on_time     : +2
  contribution_late        : -1
  participation_active     : +1   (e.g. login streak, member action)
  membership_anniversary   : +5   (yearly bonus)
  savings_milestone        : +3   (10k, 50k, 100k, etc.)
  account_created          : +5   (kickstart)
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from db import get_db
from models import gen_id, now_utc


POINTS = {
    "contribution_on_time": 2,
    "contribution_late": -1,
    "participation_active": 1,
    "membership_anniversary": 5,
    "savings_milestone": 3,
    "account_created": 5,
    "kyc_completed": 5,
    "group_created": 3,
    "group_joined": 2,
}


def level_for(points: int) -> dict:
    """Map cumulative points to a tier level."""
    if points >= 81:
        return {"key": "platinum", "label": "Platinum", "min": 81, "max": 100,
                "color": "#8B5CF6", "next": None, "icon": "platinum"}
    if points >= 61:
        return {"key": "gold", "label": "Gold", "min": 61, "max": 80,
                "color": "#D4AF37", "next": "Platinum", "icon": "gold"}
    if points >= 31:
        return {"key": "silver", "label": "Silver", "min": 31, "max": 60,
                "color": "#C0C0C0", "next": "Gold", "icon": "silver"}
    return {"key": "bronze", "label": "Bronze", "min": 0, "max": 30,
            "color": "#CD7F32", "next": "Silver", "icon": "bronze"}


async def record_identity_event(
    user_id: str,
    event_type: str,
    metadata: Optional[dict] = None,
    points: Optional[int] = None,
) -> dict:
    """Append a points-bearing event for a user."""
    if event_type not in POINTS and points is None:
        raise ValueError(f"Unknown identity event: {event_type}")
    delta = points if points is not None else POINTS[event_type]
    db = get_db()
    doc = {
        "id": gen_id(),
        "user_id": user_id,
        "event_type": event_type,
        "points_delta": delta,
        "metadata": metadata or {},
        "created_at": now_utc(),
    }
    await db.identity_events.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def compute_identity_profile(user_id: str) -> dict:
    """Aggregate the user's lifetime points and compute level/progress."""
    db = get_db()
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": None, "total": {"$sum": "$points_delta"}, "count": {"$sum": 1}}},
    ]
    agg = await db.identity_events.aggregate(pipeline).to_list(1)
    total = max(0, agg[0]["total"] if agg else 0)
    events_count = agg[0]["count"] if agg else 0

    # Cap visual at 100 for display while keeping the raw total.
    cap = 100
    capped = min(total, cap)
    level = level_for(capped)
    progress_within = 0.0
    if level["max"] > level["min"]:
        progress_within = round(((capped - level["min"]) / (level["max"] - level["min"])) * 100, 1)
        progress_within = max(0.0, min(100.0, progress_within))
    points_to_next = max(0, (level["max"] + 1) - capped) if level["next"] else 0

    return {
        "points": total,
        "display_points": capped,
        "level": level["label"],
        "level_key": level["key"],
        "level_color": level["color"],
        "next_level": level["next"],
        "points_to_next": points_to_next,
        "progress_within_level_pct": progress_within,
        "events_recorded": events_count,
    }


async def list_identity_events(user_id: str, limit: int = 50) -> list[dict]:
    db = get_db()
    return await db.identity_events.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
