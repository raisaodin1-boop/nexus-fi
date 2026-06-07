"""Savings goals & transactions."""
from fastapi import APIRouter, Depends, HTTPException

from db import get_db
from deps import get_current_user
from models import SavingsGoalCreate, SavingsTransactionCreate, gen_id, now_utc
from audit import log_event
from notifications_svc import create_notification

router = APIRouter(prefix="/savings", tags=["savings"])


def _proj():
    return {"_id": 0}


@router.get("/goals")
async def list_goals(user=Depends(get_current_user)):
    db = get_db()
    goals = await db.savings_goals.find({"user_id": user["id"]}, _proj()).sort("created_at", -1).to_list(200)
    return goals


@router.post("/goals")
async def create_goal(data: SavingsGoalCreate, user=Depends(get_current_user)):
    db = get_db()
    now = now_utc()
    doc = {
        "id": gen_id(),
        "user_id": user["id"],
        "name": data.name,
        "target_amount": data.target_amount,
        "current_amount": 0.0,
        "deadline": data.deadline,
        "savings_type": data.savings_type.value,
        "currency": data.currency,
        "note": data.note,
        "created_at": now,
        "updated_at": now,
    }
    await db.savings_goals.insert_one(doc)
    await log_event("savings.goal_created", user_id=user["id"], metadata={"goal_id": doc["id"]})
    await create_notification(user["id"], "Nouvel objectif d'épargne",
                              f"Vous avez créé l'objectif « {data.name} ». Bonne chance !", kind="success")
    doc.pop("_id", None)
    return doc


@router.get("/goals/{goal_id}")
async def get_goal(goal_id: str, user=Depends(get_current_user)):
    db = get_db()
    goal = await db.savings_goals.find_one({"id": goal_id, "user_id": user["id"]}, _proj())
    if not goal:
        raise HTTPException(404, "Objectif introuvable.")
    txs = await db.savings_transactions.find({"goal_id": goal_id}, _proj()).sort("created_at", -1).to_list(500)
    return {"goal": goal, "transactions": txs}


@router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str, user=Depends(get_current_user)):
    db = get_db()
    res = await db.savings_goals.delete_one({"id": goal_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Objectif introuvable.")
    await db.savings_transactions.delete_many({"goal_id": goal_id})
    return {"detail": "Objectif supprimé."}


@router.post("/goals/{goal_id}/transactions")
async def add_transaction(goal_id: str, data: SavingsTransactionCreate, user=Depends(get_current_user)):
    db = get_db()
    goal = await db.savings_goals.find_one({"id": goal_id, "user_id": user["id"]})
    if not goal:
        raise HTTPException(404, "Objectif introuvable.")

    if data.kind == "withdraw" and goal["current_amount"] < data.amount:
        raise HTTPException(400, "Solde insuffisant.")

    tx = {
        "id": gen_id(),
        "goal_id": goal_id,
        "user_id": user["id"],
        "amount": data.amount,
        "kind": data.kind,
        "note": data.note,
        "created_at": now_utc(),
    }
    await db.savings_transactions.insert_one(tx)

    delta = data.amount if data.kind == "deposit" else -data.amount
    new_amount = max(0, goal["current_amount"] + delta)
    await db.savings_goals.update_one({"id": goal_id}, {
        "$set": {"current_amount": new_amount, "updated_at": now_utc()}
    })

    if data.kind == "deposit":
        await create_notification(user["id"], "Dépôt enregistré",
                                  f"+{data.amount:,.0f} {goal['currency']} sur « {goal['name']} »",
                                  kind="success")
        target = goal.get("target_amount") or 0
        if target > 0:
            pct = (new_amount / target) * 100
            alert_80_sent = goal.get("alert_80_sent", False)
            alert_100_sent = goal.get("alert_100_sent", False)
            if pct >= 100 and not alert_100_sent:
                await create_notification(
                    user["id"],
                    "Objectif atteint ! 🎉",
                    "Félicitations, vous avez atteint votre objectif d'épargne !",
                    kind="success",
                )
                await db.savings_goals.update_one(
                    {"id": goal_id},
                    {"$set": {"alert_100_sent": True}},
                )
            elif pct >= 80 and pct < 100 and not alert_80_sent:
                await create_notification(
                    user["id"],
                    "Objectif presque atteint !",
                    f"Vous êtes à {pct:.0f}% de votre objectif d'épargne.",
                    kind="info",
                )
                await db.savings_goals.update_one(
                    {"id": goal_id},
                    {"$set": {"alert_80_sent": True}},
                )
    tx.pop("_id", None)
    return tx


@router.get("/summary")
async def summary(user=Depends(get_current_user)):
    db = get_db()
    goals = await db.savings_goals.find({"user_id": user["id"]}, _proj()).to_list(200)
    total_saved = sum(g.get("current_amount", 0) for g in goals)
    total_target = sum(g.get("target_amount", 0) for g in goals)
    active_goals = len(goals)
    return {
        "total_saved": total_saved,
        "total_target": total_target,
        "active_goals": active_goals,
        "progress_pct": round((total_saved / total_target * 100) if total_target else 0, 1),
        "currency": goals[0]["currency"] if goals else "XAF",
    }
