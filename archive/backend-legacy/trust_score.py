"""Hodix Identity Score — /1000 points, slow accumulation.

Points system:
  - Signup bonus            :   5 pts (stored in users.identity_bonus)
  - Transaction 1k–50k XAF :   0.5 pts each
  - Transaction 50k+ XAF   :   1 pt  each
  - 1-year regularity bonus :   5 pts (awarded once per year of regular activity)
  - Maximum                 : 1000 pts

Score is recomputed from all transactions each time; bonuses are persisted in
users.identity_bonus so they survive recomputes.
"""
from datetime import datetime, timezone, timedelta
from typing import Any

from db import get_db


def _level(score: float) -> dict[str, str]:
    if score >= 800:
        return {"level": "Elite", "risk": "Très faible", "color": "#10B981"}
    if score >= 500:
        return {"level": "Confirmé", "risk": "Faible", "color": "#1D4ED8"}
    if score >= 250:
        return {"level": "Actif", "risk": "Modéré", "color": "#F59E0B"}
    if score >= 80:
        return {"level": "Émergent", "risk": "Élevé", "color": "#F97316"}
    return {"level": "Nouveau", "risk": "Non évalué", "color": "#94A3B8"}


async def compute_trust_score(user_id: str) -> dict[str, Any]:
    db = get_db()
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        return {"score": 0, "score_max": 1000, **_level(0), "components": {}, "tips": [], "stats": {}}

    now = datetime.now(timezone.utc)
    created_at = user.get("created_at", now)
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    age_days = max(1, (now - created_at).days)

    # ── BONUS persisted in users doc ──────────────────────────────────────
    identity_bonus = float(user.get("identity_bonus", 5))   # 5 pts auto at signup

    # ── TRANSACTION POINTS ────────────────────────────────────────────────
    # Collect all deposits: savings + tontine contributions
    savings_txs = await db.savings_transactions.find(
        {"user_id": user_id, "kind": "deposit"}, {"amount": 1, "_id": 0}
    ).to_list(10000)
    tontine_txs = await db.tontine_contributions.find(
        {"user_id": user_id}, {"amount": 1, "_id": 0}
    ).to_list(10000)

    tx_points = 0.0
    for tx in savings_txs + tontine_txs:
        amt = float(tx.get("amount", 0))
        if amt >= 50_000:
            tx_points += 1.0
        elif amt >= 1_000:
            tx_points += 0.5

    # ── ANNUAL REGULARITY BONUS ───────────────────────────────────────────
    # Check if user has been active (≥1 transaction/month) for a full year
    yearly_bonus = 0.0
    if age_days >= 365:
        one_year_ago = now - timedelta(days=365)
        # Count distinct months with at least one transaction
        pipeline = [
            {"$match": {"user_id": user_id, "kind": "deposit", "created_at": {"$gte": one_year_ago}}},
            {"$group": {"_id": {"y": {"$year": "$created_at"}, "m": {"$month": "$created_at"}}}},
            {"$count": "months"},
        ]
        agg = await db.savings_transactions.aggregate(pipeline).to_list(1)
        months_active = agg[0]["months"] if agg else 0
        if months_active >= 10:   # active at least 10 out of 12 months
            yearly_bonus = 5.0 * (age_days // 365)   # 5pts per completed year
            yearly_bonus = min(yearly_bonus, 50.0)    # cap at 50 total from this source

    # ── INFRACTION PENALTY ────────────────────────────────────────────────
    infraction_penalty = await db.infractions.aggregate([
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": None, "total": {"$sum": "$penalty_points"}}}
    ]).to_list(1)
    penalty = infraction_penalty[0]["total"] if infraction_penalty else 0
    infractions_count = await db.infractions.count_documents({"user_id": user_id})

    # ── TOTAL ─────────────────────────────────────────────────────────────
    raw = identity_bonus + tx_points + yearly_bonus
    score = round(min(1000.0, max(0.0, raw - penalty)), 1)

    components = {
        "signup_bonus": identity_bonus,
        "transaction_points": round(tx_points, 1),
        "yearly_bonus": yearly_bonus,
        "infraction_penalty": penalty,
    }

    # ── TIPS ──────────────────────────────────────────────────────────────
    tips = []
    if score < 80:
        tips.append("Effectuez vos premières transactions pour commencer à accumuler des points.")
    elif score < 250:
        tips.append("Continuez à épargner régulièrement. Les dépôts ≥ 50 000 XAF rapportent 1 point chacun.")
    elif score < 500:
        tips.append("Vous progressez bien ! Rejoignez des tontines pour multiplier vos transactions.")
    elif score < 800:
        tips.append("Score solide. Maintenez une activité mensuelle régulière pour atteindre le niveau Elite.")
    else:
        tips.append("Profil Elite ! Votre historique inspire confiance à tous les partenaires Hodix.")

    if age_days >= 300 and age_days < 365:
        tips.append(f"Plus que {365 - age_days} jours pour débloquer le bonus annuel de 5 points.")

    # ── STATS ─────────────────────────────────────────────────────────────
    total_txs = len(savings_txs) + len(tontine_txs)
    total_saved = sum(float(t.get("amount", 0)) for t in savings_txs)

    return {
        "score": score,
        "score_max": 1000,
        "infractions_count": infractions_count,
        "has_infractions": infractions_count > 0,
        **_level(score),
        "components": components,
        "tips": tips,
        "stats": {
            "total_saved": round(total_saved, 2),
            "total_transactions": total_txs,
            "tx_points_earned": round(tx_points, 1),
            "account_age_days": age_days,
            "account_age_months": round(age_days / 30.0, 1),
            "yearly_bonus_earned": yearly_bonus,
        }
    }


async def store_trust_score(user_id: str) -> dict[str, Any]:
    db = get_db()
    result = await compute_trust_score(user_id)
    await db.trust_scores.update_one(
        {"user_id": user_id},
        {"$set": {**result, "user_id": user_id, "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    return result


async def award_signup_bonus(user_id: str) -> None:
    """Give 5 identity points on registration. Called from register endpoint."""
    db = get_db()
    await db.users.update_one(
        {"id": user_id},
        {"$setOnInsert": {"identity_bonus": 5}},
        upsert=False
    )
    # Use $set only if field not already set
    user = await db.users.find_one({"id": user_id}, {"identity_bonus": 1})
    if user and "identity_bonus" not in user:
        await db.users.update_one({"id": user_id}, {"$set": {"identity_bonus": 5}})
