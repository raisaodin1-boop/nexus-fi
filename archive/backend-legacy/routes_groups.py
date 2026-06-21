"""Associations, Cooperatives and Community Funds routes."""
import secrets
from fastapi import APIRouter, Depends, HTTPException

from db import get_db
from deps import get_current_user
from models import GroupCreate, GroupContribution, CommunityFundCreate, FundTransactionCreate, gen_id, now_utc
from audit import log_event
from notifications_svc import create_notification

router = APIRouter(tags=["groups"])


def _proj():
    return {"_id": 0}


def _gen_code() -> str:
    return secrets.token_urlsafe(4).upper().replace("_", "X").replace("-", "Y")[:8]


# ============ ASSOCIATIONS ============
@router.get("/associations")
async def list_associations(user=Depends(get_current_user)):
    db = get_db()
    memberships = await db.association_members.find({"user_id": user["id"]}, _proj()).to_list(200)
    ids = [m["association_id"] for m in memberships]
    items = await db.associations.find({"id": {"$in": ids}}, _proj()).to_list(200)
    return items


@router.post("/associations")
async def create_association(data: GroupCreate, user=Depends(get_current_user)):
    db = get_db()
    for _ in range(5):
        code = _gen_code()
        if not await db.associations.find_one({"invite_code": code}):
            break

    now = now_utc()
    item = {
        "id": gen_id(),
        "name": data.name,
        "description": data.description,
        "admin_id": user["id"],
        "membership_fee": data.membership_fee,
        "currency": data.currency,
        "invite_code": code,
        "members_count": 1,
        "total_collected": 0.0,
        "created_at": now,
    }
    await db.associations.insert_one(item)
    await db.association_members.insert_one({
        "id": gen_id(),
        "association_id": item["id"],
        "user_id": user["id"],
        "full_name": user["full_name"],
        "role": "admin",
        "joined_at": now,
    })
    if user["role"] == "member":
        # Members can only create associations of <=5 members initially; otherwise must upgrade.
        # We do not promote them anymore.
        pass
    await log_event("association.created", user_id=user["id"], metadata={"id": item["id"]})
    item.pop("_id", None)
    return item


@router.post("/associations/join")
async def join_association(payload: dict, user=Depends(get_current_user)):
    code = (payload.get("invite_code") or "").upper().strip()
    db = get_db()
    item = await db.associations.find_one({"invite_code": code}, _proj())
    if not item:
        raise HTTPException(404, "Association introuvable.")
    existing = await db.association_members.find_one({"association_id": item["id"], "user_id": user["id"]})
    if existing:
        raise HTTPException(400, "Déjà membre.")
    await db.association_members.insert_one({
        "id": gen_id(),
        "association_id": item["id"],
        "user_id": user["id"],
        "full_name": user["full_name"],
        "role": "member",
        "joined_at": now_utc(),
    })
    await db.associations.update_one({"id": item["id"]}, {"$inc": {"members_count": 1}})
    await create_notification(user["id"], "Bienvenue !", f"Vous avez rejoint « {item['name']} ».", kind="success")
    return {"detail": "ok", "association_id": item["id"]}


@router.get("/associations/{aid}")
async def get_association(aid: str, user=Depends(get_current_user)):
    db = get_db()
    item = await db.associations.find_one({"id": aid}, _proj())
    if not item:
        raise HTTPException(404, "Association introuvable.")
    membership = await db.association_members.find_one({"association_id": aid, "user_id": user["id"]}, _proj())
    if not membership:
        raise HTTPException(403, "Non membre.")
    members = await db.association_members.find({"association_id": aid}, _proj()).to_list(500)
    contributions = await db.association_contributions.find({"association_id": aid}, _proj()).sort("created_at", -1).to_list(500)
    return {"association": item, "members": members, "contributions": contributions, "is_admin": membership["role"] == "admin"}


@router.post("/associations/{aid}/contribute")
async def contribute_association(aid: str, data: GroupContribution, user=Depends(get_current_user)):
    db = get_db()
    item = await db.associations.find_one({"id": aid})
    if not item:
        raise HTTPException(404, "Introuvable.")
    membership = await db.association_members.find_one({"association_id": aid, "user_id": user["id"]})
    if not membership:
        raise HTTPException(403, "Non membre.")
    if data.member_user_id != user["id"] and membership["role"] != "admin":
        raise HTTPException(403, "Permission refusée.")
    member = await db.association_members.find_one({"association_id": aid, "user_id": data.member_user_id})
    if not member:
        raise HTTPException(404, "Membre introuvable.")
    doc = {
        "id": gen_id(),
        "association_id": aid,
        "user_id": data.member_user_id,
        "full_name": member["full_name"],
        "amount": data.amount,
        "purpose": data.purpose,
        "note": data.note,
        "created_at": now_utc(),
    }
    await db.association_contributions.insert_one(doc)
    await db.associations.update_one({"id": aid}, {"$inc": {"total_collected": data.amount}})
    doc.pop("_id", None)
    return doc


# ============ COOPERATIVES ============
@router.get("/cooperatives")
async def list_cooperatives(user=Depends(get_current_user)):
    db = get_db()
    memberships = await db.cooperative_members.find({"user_id": user["id"]}, _proj()).to_list(200)
    ids = [m["cooperative_id"] for m in memberships]
    items = await db.cooperatives.find({"id": {"$in": ids}}, _proj()).to_list(200)
    return items


@router.post("/cooperatives")
async def create_cooperative(data: GroupCreate, user=Depends(get_current_user)):
    db = get_db()
    for _ in range(5):
        code = _gen_code()
        if not await db.cooperatives.find_one({"invite_code": code}):
            break
    now = now_utc()
    item = {
        "id": gen_id(),
        "name": data.name,
        "description": data.description,
        "admin_id": user["id"],
        "membership_fee": data.membership_fee,
        "currency": data.currency,
        "invite_code": code,
        "members_count": 1,
        "total_capital": 0.0,
        "created_at": now,
    }
    await db.cooperatives.insert_one(item)
    await db.cooperative_members.insert_one({
        "id": gen_id(),
        "cooperative_id": item["id"],
        "user_id": user["id"],
        "full_name": user["full_name"],
        "role": "admin",
        "joined_at": now,
    })
    # Role promotions are now via promotion request flow.
    await log_event("cooperative.created", user_id=user["id"], metadata={"id": item["id"]})
    item.pop("_id", None)
    return item


@router.post("/cooperatives/join")
async def join_cooperative(payload: dict, user=Depends(get_current_user)):
    code = (payload.get("invite_code") or "").upper().strip()
    db = get_db()
    item = await db.cooperatives.find_one({"invite_code": code}, _proj())
    if not item:
        raise HTTPException(404, "Coopérative introuvable.")
    existing = await db.cooperative_members.find_one({"cooperative_id": item["id"], "user_id": user["id"]})
    if existing:
        raise HTTPException(400, "Déjà membre.")
    await db.cooperative_members.insert_one({
        "id": gen_id(),
        "cooperative_id": item["id"],
        "user_id": user["id"],
        "full_name": user["full_name"],
        "role": "member",
        "joined_at": now_utc(),
    })
    await db.cooperatives.update_one({"id": item["id"]}, {"$inc": {"members_count": 1}})
    return {"detail": "ok", "cooperative_id": item["id"]}


@router.get("/cooperatives/{cid}")
async def get_cooperative(cid: str, user=Depends(get_current_user)):
    db = get_db()
    item = await db.cooperatives.find_one({"id": cid}, _proj())
    if not item:
        raise HTTPException(404, "Introuvable.")
    membership = await db.cooperative_members.find_one({"cooperative_id": cid, "user_id": user["id"]}, _proj())
    if not membership:
        raise HTTPException(403, "Non membre.")
    members = await db.cooperative_members.find({"cooperative_id": cid}, _proj()).to_list(500)
    contributions = await db.cooperative_contributions.find({"cooperative_id": cid}, _proj()).sort("created_at", -1).to_list(500)
    return {"cooperative": item, "members": members, "contributions": contributions, "is_admin": membership["role"] == "admin"}


@router.post("/cooperatives/{cid}/contribute")
async def contribute_cooperative(cid: str, data: GroupContribution, user=Depends(get_current_user)):
    db = get_db()
    item = await db.cooperatives.find_one({"id": cid})
    if not item:
        raise HTTPException(404, "Introuvable.")
    membership = await db.cooperative_members.find_one({"cooperative_id": cid, "user_id": user["id"]})
    if not membership:
        raise HTTPException(403, "Non membre.")
    if data.member_user_id != user["id"] and membership["role"] != "admin":
        raise HTTPException(403, "Permission refusée.")
    member = await db.cooperative_members.find_one({"cooperative_id": cid, "user_id": data.member_user_id})
    if not member:
        raise HTTPException(404, "Membre introuvable.")
    doc = {
        "id": gen_id(),
        "cooperative_id": cid,
        "user_id": data.member_user_id,
        "full_name": member["full_name"],
        "amount": data.amount,
        "purpose": data.purpose,
        "note": data.note,
        "created_at": now_utc(),
    }
    await db.cooperative_contributions.insert_one(doc)
    await db.cooperatives.update_one({"id": cid}, {"$inc": {"total_capital": data.amount}})
    doc.pop("_id", None)
    return doc


# ============ COMMUNITY FUNDS ============
@router.get("/funds")
async def list_funds(user=Depends(get_current_user)):
    db = get_db()
    items = await db.community_funds.find({"owner_id": user["id"]}, _proj()).sort("created_at", -1).to_list(200)
    return items


@router.post("/funds")
async def create_fund(data: CommunityFundCreate, user=Depends(get_current_user)):
    db = get_db()
    now = now_utc()
    item = {
        "id": gen_id(),
        "owner_id": user["id"],
        "name": data.name,
        "description": data.description,
        "target_amount": data.target_amount,
        "current_balance": 0.0,
        "total_collected": 0.0,
        "total_withdrawn": 0.0,
        "currency": data.currency,
        "created_at": now,
    }
    await db.community_funds.insert_one(item)
    item.pop("_id", None)
    return item


@router.get("/funds/{fid}")
async def get_fund(fid: str, user=Depends(get_current_user)):
    db = get_db()
    item = await db.community_funds.find_one({"id": fid, "owner_id": user["id"]}, _proj())
    if not item:
        raise HTTPException(404, "Fonds introuvable.")
    txs = await db.community_fund_transactions.find({"fund_id": fid}, _proj()).sort("created_at", -1).to_list(500)
    return {"fund": item, "transactions": txs}


@router.post("/funds/{fid}/transactions")
async def add_fund_tx(fid: str, data: FundTransactionCreate, user=Depends(get_current_user)):
    db = get_db()
    item = await db.community_funds.find_one({"id": fid, "owner_id": user["id"]})
    if not item:
        raise HTTPException(404, "Fonds introuvable.")
    if data.kind == "withdrawal" and item["current_balance"] < data.amount:
        raise HTTPException(400, "Solde insuffisant.")

    tx = {
        "id": gen_id(),
        "fund_id": fid,
        "amount": data.amount,
        "kind": data.kind,
        "note": data.note,
        "created_at": now_utc(),
    }
    await db.community_fund_transactions.insert_one(tx)
    delta = data.amount if data.kind == "contribution" else -data.amount
    update = {"$set": {"current_balance": item["current_balance"] + delta}}
    if data.kind == "contribution":
        update["$inc"] = {"total_collected": data.amount}
    else:
        update["$inc"] = {"total_withdrawn": data.amount}
    await db.community_funds.update_one({"id": fid}, update)
    tx.pop("_id", None)
    return tx
