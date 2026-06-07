"""Tontine routes."""
import secrets
import random as _random
from fastapi import APIRouter, Depends, HTTPException

from db import get_db
from deps import get_current_user, require_super_admin
from models import TontineCreate, TontineContributionCreate, gen_id, now_utc
from audit import log_event
from notifications_svc import create_notification

router = APIRouter(prefix="/tontines", tags=["tontines"])

# Modes de distribution autorisés
ROTATION_MODES = ("rotation", "random", "custom")


def _proj():
    return {"_id": 0}


def _gen_code() -> str:
    return secrets.token_urlsafe(4).upper().replace("_", "X").replace("-", "Y")[:8]


def _member_status(member: dict, tontine: dict) -> str:
    """Compute tontine member status: a_jour / en_retard / suspendu.

    Logic: each completed cycle (current_cycle - 1) expects one contribution per
    member. We count `tontine_contributions` for this user. Late = missed up to
    2 cycles. Suspended = 3+ missed cycles.
    """
    expected = max(0, tontine.get("current_cycle", 1) - 1)
    paid = member.get("cycles_paid", 0)
    if expected == 0 or paid >= expected:
        return "a_jour"
    missed = expected - paid
    if missed >= 3:
        return "suspendu"
    return "en_retard"


@router.get("")
async def list_my_tontines(user=Depends(get_current_user)):
    db = get_db()
    memberships = await db.tontine_members.find({"user_id": user["id"]}, _proj()).to_list(200)
    tontine_ids = [m["tontine_id"] for m in memberships]
    tontines = await db.tontines.find({"id": {"$in": tontine_ids}}, _proj()).to_list(200)
    return tontines


@router.post("")
async def create_tontine(data: TontineCreate, user=Depends(get_current_user)):
    # Members can only create personal tontines (max 5 members)
    if user["role"] == "member" and data.max_members > 5:
        raise HTTPException(
            status_code=403,
            detail="Les Membres ne peuvent créer que des tontines personnelles (max 5 membres). Demandez une promotion en Tontine Manager pour créer des tontines plus larges.",
        )

    db = get_db()

    # Extra optional fields parsed from raw model_dump
    payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    rotation_mode = (payload.get("rotation_mode") or "rotation").lower()
    if rotation_mode not in ROTATION_MODES:
        rotation_mode = "rotation"

    now = now_utc()
    code = _gen_code()
    tontine = {
        "id": gen_id(),
        "name": data.name,
        "description": data.description,
        "admin_id": user["id"],
        "contribution_amount": data.contribution_amount,
        "frequency": data.frequency.value,
        "max_members": data.max_members,
        "currency": data.currency,
        "invite_code": code,
        "rotation_mode": rotation_mode,
        "current_cycle": 1,
        "members_count": 1,
        "total_collected": 0.0,
        "is_public": payload.get("is_public", False),
        "is_active": True,
        "created_at": now,
    }
    await db.tontines.insert_one(tontine)

    # Add creator as first member + admin
    await db.tontine_members.insert_one({
        "id": gen_id(),
        "tontine_id": tontine["id"],
        "user_id": user["id"],
        "full_name": user["full_name"],
        "role": "admin",
        "rotation_position": 1,
        "has_received": False,
        "received_at": None,
        "status": "a_jour",
        "joined_at": now,
    })

    await log_event("tontine.created", user_id=user["id"], metadata={"tontine_id": tontine["id"], "mode": rotation_mode})
    # Identity points
    try:
        from identity_engine import record_identity_event
        await record_identity_event(user["id"], "group_created", {"tontine_id": tontine["id"]})
    except Exception:
        pass
    tontine.pop("_id", None)
    return tontine


@router.get("/public")
async def list_public_tontines(user=Depends(get_current_user)):
    """List all public active tontines the user hasn't joined yet."""
    db = get_db()
    memberships = await db.tontine_members.find({"user_id": user["id"]}, {"_id": 0, "tontine_id": 1}).to_list(500)
    joined_ids = [m["tontine_id"] for m in memberships]
    tontines = await db.tontines.find(
        {"is_public": True, "is_active": True, "id": {"$nin": joined_ids}},
        _proj()
    ).sort("created_at", -1).to_list(200)
    return tontines


@router.post("/join")
async def join_tontine(payload: dict, user=Depends(get_current_user)):
    db = get_db()
    tontine_id = payload.get("tontine_id")
    code = (payload.get("invite_code") or "").upper().strip()

    # Lookup by tontine_id or invite_code
    if tontine_id:
        tontine = await db.tontines.find_one({"id": tontine_id}, _proj())
    elif code:
        tontine = await db.tontines.find_one({"invite_code": code}, _proj())
    else:
        raise HTTPException(400, "tontine_id ou invite_code requis.")

    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")

    existing = await db.tontine_members.find_one({"tontine_id": tontine["id"], "user_id": user["id"]})
    if existing:
        raise HTTPException(400, "Vous êtes déjà membre.")

    if tontine["members_count"] >= tontine["max_members"]:
        raise HTTPException(400, "Tontine complète.")

    # Public tontines: create a join request instead of directly joining
    if tontine.get("is_public") and not code:
        # Check if request already pending
        existing_req = await db.tontine_join_requests.find_one({
            "tontine_id": tontine["id"], "user_id": user["id"], "status": "pending"
        })
        if existing_req:
            raise HTTPException(400, "Une demande est déjà en attente.")
        req = {
            "id": gen_id(),
            "tontine_id": tontine["id"],
            "user_id": user["id"],
            "full_name": user["full_name"],
            "email": user.get("email", ""),
            "status": "pending",
            "created_at": now_utc(),
        }
        await db.tontine_join_requests.insert_one(req)
        await create_notification(
            tontine["admin_id"], "Nouvelle demande d'adhésion",
            f"{user['full_name']} demande à rejoindre « {tontine['name']} »."
        )
        await log_event("tontine.join_requested", user_id=user["id"], metadata={"tontine_id": tontine["id"]})
        return {"status": "pending", "detail": "Demande envoyée, en attente de validation."}

    # Private tontine (or public with code): direct join
    if not tontine.get("is_public") and not code:
        raise HTTPException(400, "Code d'invitation requis.")

    now = now_utc()
    await db.tontine_members.insert_one({
        "id": gen_id(),
        "tontine_id": tontine["id"],
        "user_id": user["id"],
        "full_name": user["full_name"],
        "role": "member",
        "rotation_position": tontine["members_count"] + 1,
        "has_received": False,
        "received_at": None,
        "status": "a_jour",
        "joined_at": now,
    })
    await db.tontines.update_one({"id": tontine["id"]}, {"$inc": {"members_count": 1}})
    await create_notification(user["id"], "Bienvenue dans la tontine!",
                              f"Vous avez rejoint « {tontine['name']} ».", kind="success")
    await create_notification(tontine["admin_id"], "Nouveau membre",
                              f"{user['full_name']} a rejoint « {tontine['name']} ».")
    # Identity points
    try:
        from identity_engine import record_identity_event
        await record_identity_event(user["id"], "group_joined", {"tontine_id": tontine["id"]})
    except Exception:
        pass
    await log_event("tontine.joined", user_id=user["id"], metadata={"tontine_id": tontine["id"]})
    return {"detail": "ok", "tontine_id": tontine["id"]}


@router.get("/{tontine_id}")
async def get_tontine(tontine_id: str, user=Depends(get_current_user)):
    db = get_db()
    tontine = await db.tontines.find_one({"id": tontine_id}, _proj())
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")
    membership = await db.tontine_members.find_one({"tontine_id": tontine_id, "user_id": user["id"]}, _proj())
    if not membership:
        raise HTTPException(403, "Non membre de cette tontine.")

    members = await db.tontine_members.find({"tontine_id": tontine_id}, _proj()).sort("rotation_position", 1).to_list(500)

    # Decorate each member with cycles_paid + status
    for m in members:
        paid = await db.tontine_contributions.count_documents({"tontine_id": tontine_id, "user_id": m["user_id"]})
        m["cycles_paid"] = paid
        m["status"] = _member_status(m, tontine)

    contributions = await db.tontine_contributions.find({"tontine_id": tontine_id}, _proj()).sort("created_at", -1).to_list(500)

    total_expected = tontine["contribution_amount"] * tontine["members_count"]
    compliance = round((tontine["total_collected"] / total_expected * 100) if total_expected else 0, 1)

    return {
        "tontine": tontine,
        "members": members,
        "contributions": contributions,
        "is_admin": membership["role"] == "admin",
        "compliance_pct": compliance,
    }


@router.post("/{tontine_id}/contribute")
async def contribute(tontine_id: str, data: TontineContributionCreate, user=Depends(get_current_user)):
    db = get_db()
    tontine = await db.tontines.find_one({"id": tontine_id})
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")

    membership = await db.tontine_members.find_one({"tontine_id": tontine_id, "user_id": user["id"]})
    if not membership:
        raise HTTPException(403, "Non membre.")

    # Only admin can record contributions for other members
    if data.member_user_id != user["id"] and membership["role"] != "admin":
        raise HTTPException(403, "Seul l'admin peut enregistrer les contributions des autres.")

    member = await db.tontine_members.find_one({"tontine_id": tontine_id, "user_id": data.member_user_id})
    if not member:
        raise HTTPException(404, "Membre introuvable.")

    contrib = {
        "id": gen_id(),
        "tontine_id": tontine_id,
        "user_id": data.member_user_id,
        "full_name": member["full_name"],
        "amount": data.amount,
        "cycle": tontine["current_cycle"],
        "note": data.note,
        "recorded_by": user["id"],
        "created_at": now_utc(),
    }
    await db.tontine_contributions.insert_one(contrib)
    await db.tontines.update_one({"id": tontine_id}, {"$inc": {"total_collected": data.amount}})

    # Identity points: on-time contribution → +2
    try:
        from identity_engine import record_identity_event
        await record_identity_event(data.member_user_id, "contribution_on_time", {"tontine_id": tontine_id, "cycle": tontine["current_cycle"]})
    except Exception:
        pass

    await create_notification(data.member_user_id, "Contribution enregistrée",
                              f"+{data.amount:,.0f} {tontine['currency']} pour « {tontine['name']} »",
                              kind="success")
    contrib.pop("_id", None)
    return contrib


@router.post("/{tontine_id}/advance-rotation")
async def advance_rotation(tontine_id: str, user=Depends(get_current_user)):
    """Mark current beneficiary as received and advance to next cycle.

    Honors `rotation_mode`:
      - "rotation": classic order by `rotation_position` (default).
      - "random":   randomly picks an unmarked member.
      - "custom":   admin must pass `{ "beneficiary_user_id": "..." }`.
    """
    db = get_db()
    tontine = await db.tontines.find_one({"id": tontine_id})
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")
    membership = await db.tontine_members.find_one({"tontine_id": tontine_id, "user_id": user["id"]})
    if not membership or membership["role"] != "admin":
        raise HTTPException(403, "Seul l'admin peut faire avancer la rotation.")

    mode = tontine.get("rotation_mode", "rotation")
    beneficiary = None
    if mode == "random":
        candidates = await db.tontine_members.find(
            {"tontine_id": tontine_id, "has_received": False}, {"_id": 0}
        ).to_list(500)
        if candidates:
            beneficiary = _random.choice(candidates)
    else:
        beneficiary = await db.tontine_members.find_one(
            {"tontine_id": tontine_id, "rotation_position": tontine["current_cycle"]}
        )

    if beneficiary:
        await db.tontine_members.update_one(
            {"id": beneficiary["id"]},
            {"$set": {"has_received": True, "received_at": now_utc()}}
        )
        await create_notification(
            beneficiary["user_id"], "Vous êtes le bénéficiaire!",
            f"Cycle {tontine['current_cycle']} de « {tontine['name']} ».", kind="success"
        )

    await db.tontines.update_one({"id": tontine_id}, {"$inc": {"current_cycle": 1}})
    return {"detail": "ok", "beneficiary": beneficiary["user_id"] if beneficiary else None}


@router.post("/{tontine_id}/set-beneficiary")
async def set_beneficiary(tontine_id: str, payload: dict, user=Depends(get_current_user)):
    """Mode 'custom' : l'admin force le prochain bénéficiaire avant d'avancer."""
    db = get_db()
    tontine = await db.tontines.find_one({"id": tontine_id})
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")
    membership = await db.tontine_members.find_one({"tontine_id": tontine_id, "user_id": user["id"]})
    if not membership or membership["role"] != "admin":
        raise HTTPException(403, "Seul l'admin peut désigner le bénéficiaire.")
    target_id = payload.get("beneficiary_user_id")
    if not target_id:
        raise HTTPException(400, "beneficiary_user_id requis.")
    member = await db.tontine_members.find_one({"tontine_id": tontine_id, "user_id": target_id})
    if not member:
        raise HTTPException(404, "Membre introuvable.")
    await db.tontine_members.update_one(
        {"id": member["id"]},
        {"$set": {"has_received": True, "received_at": now_utc()}}
    )
    await db.tontines.update_one({"id": tontine_id}, {"$inc": {"current_cycle": 1}})
    await create_notification(
        target_id, "Vous êtes le bénéficiaire (choisi par l'admin)",
        f"Cycle {tontine['current_cycle']} de « {tontine['name']} ».", kind="success"
    )
    return {"detail": "ok", "beneficiary": target_id}


@router.get("/admin/all")
async def admin_all_tontines(admin=Depends(require_super_admin)):
    """Super admin can see ALL tontines — public and private."""
    db = get_db()
    tontines = await db.tontines.find({}, _proj()).sort("created_at", -1).to_list(1000)
    # Enrich with admin_email via join
    result = []
    for t in tontines:
        admin_user = await db.users.find_one({"id": t.get("admin_id")}, {"email": 1, "_id": 0})
        result.append({
            "id": t.get("id"),
            "name": t.get("name"),
            "is_public": t.get("is_public"),
            "is_active": t.get("is_active"),
            "admin_id": t.get("admin_id"),
            "admin_email": admin_user.get("email") if admin_user else None,
            "contribution_amount": t.get("contribution_amount"),
            "frequency": t.get("frequency"),
            "max_members": t.get("max_members"),
            "members_count": t.get("members_count"),
            "total_collected": t.get("total_collected"),
            "invite_code": t.get("invite_code"),
            "created_at": t.get("created_at"),
        })
    return result


@router.get("/admin/{tontine_id}")
async def admin_tontine_detail(tontine_id: str, admin=Depends(require_super_admin)):
    """Full details of any tontine for super admin."""
    db = get_db()
    tontine = await db.tontines.find_one({"id": tontine_id}, _proj())
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")
    members_raw = await db.tontine_members.find({"tontine_id": tontine_id}, _proj()).sort("rotation_position", 1).to_list(500)
    members = []
    for m in members_raw:
        u = await db.users.find_one({"id": m["user_id"]}, {"full_name": 1, "email": 1, "phone": 1, "_id": 0})
        paid = await db.tontine_contributions.count_documents({"tontine_id": tontine_id, "user_id": m["user_id"]})
        members.append({
            "user_id": m["user_id"],
            "full_name": u.get("full_name") if u else m.get("full_name"),
            "email": u.get("email") if u else None,
            "phone": u.get("phone") if u else None,
            "role": m.get("role"),
            "joined_at": m.get("joined_at"),
            "cycles_paid": paid,
            "status": _member_status({**m, "cycles_paid": paid}, tontine),
        })
    return {"tontine": tontine, "members": members}


@router.get("/{tontine_id}/join-requests")
async def list_join_requests(tontine_id: str, user=Depends(get_current_user)):
    """List pending join requests for a tontine (admin of tontine or super_admin)."""
    db = get_db()
    tontine = await db.tontines.find_one({"id": tontine_id}, _proj())
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")
    if user["role"] != "super_admin" and tontine["admin_id"] != user["id"]:
        raise HTTPException(403, "Accès réservé à l'admin de la tontine.")
    requests = await db.tontine_join_requests.find(
        {"tontine_id": tontine_id, "status": "pending"}, _proj()
    ).sort("created_at", -1).to_list(200)
    return requests


@router.post("/{tontine_id}/join-requests/{request_id}/approve")
async def approve_join_request(tontine_id: str, request_id: str, user=Depends(get_current_user)):
    db = get_db()
    tontine = await db.tontines.find_one({"id": tontine_id})
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")
    if user["role"] != "super_admin" and tontine["admin_id"] != user["id"]:
        raise HTTPException(403, "Accès réservé à l'admin de la tontine.")
    req = await db.tontine_join_requests.find_one({"id": request_id, "tontine_id": tontine_id})
    if not req:
        raise HTTPException(404, "Demande introuvable.")
    if req["status"] != "pending":
        raise HTTPException(400, "Demande déjà traitée.")

    if tontine["members_count"] >= tontine["max_members"]:
        raise HTTPException(400, "Tontine complète.")

    now = now_utc()
    await db.tontine_members.insert_one({
        "id": gen_id(),
        "tontine_id": tontine_id,
        "user_id": req["user_id"],
        "full_name": req["full_name"],
        "role": "member",
        "rotation_position": tontine["members_count"] + 1,
        "has_received": False,
        "received_at": None,
        "status": "a_jour",
        "joined_at": now,
    })
    await db.tontines.update_one({"id": tontine_id}, {"$inc": {"members_count": 1}})
    await db.tontine_join_requests.update_one({"id": request_id}, {"$set": {"status": "approved", "decided_at": now}})
    await create_notification(req["user_id"], "Demande approuvée!",
                              f"Vous avez été accepté dans « {tontine['name']} ».", kind="success")
    await log_event("tontine.join_approved", user_id=user["id"], metadata={"tontine_id": tontine_id, "member": req["user_id"]})
    return {"detail": "approved"}


@router.post("/{tontine_id}/join-requests/{request_id}/reject")
async def reject_join_request(tontine_id: str, request_id: str, user=Depends(get_current_user)):
    db = get_db()
    tontine = await db.tontines.find_one({"id": tontine_id})
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")
    if user["role"] != "super_admin" and tontine["admin_id"] != user["id"]:
        raise HTTPException(403, "Accès réservé à l'admin de la tontine.")
    req = await db.tontine_join_requests.find_one({"id": request_id, "tontine_id": tontine_id})
    if not req:
        raise HTTPException(404, "Demande introuvable.")
    if req["status"] != "pending":
        raise HTTPException(400, "Demande déjà traitée.")
    await db.tontine_join_requests.update_one({"id": request_id}, {"$set": {"status": "rejected", "decided_at": now_utc()}})
    await create_notification(req["user_id"], "Demande refusée",
                              f"Votre demande pour rejoindre « {tontine['name']} » n'a pas été acceptée.")
    await log_event("tontine.join_rejected", user_id=user["id"], metadata={"tontine_id": tontine_id, "member": req["user_id"]})
    return {"detail": "rejected"}


@router.delete("/{tontine_id}")
async def delete_tontine(tontine_id: str, user=Depends(get_current_user)):
    """Delete a tontine. Only creator (admin_id == user.id) or super_admin can do this."""
    db = get_db()
    tontine = await db.tontines.find_one({"id": tontine_id}, _proj())
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")
    if user["role"] != "super_admin" and tontine["admin_id"] != user["id"]:
        raise HTTPException(403, "Seul le créateur ou un super admin peut supprimer cette tontine.")
    # Notify all members before deletion
    members = await db.tontine_members.find({"tontine_id": tontine_id}, {"user_id": 1, "_id": 0}).to_list(500)
    for m in members:
        await create_notification(
            m["user_id"], "Tontine supprimée",
            f"La tontine « {tontine['name']} » a été supprimée par l'administrateur.",
            kind="warning",
        )
    # Cascade delete
    await db.tontine_members.delete_many({"tontine_id": tontine_id})
    await db.tontine_contributions.delete_many({"tontine_id": tontine_id})
    await db.tontines.delete_one({"id": tontine_id})
    await log_event("tontine.deleted", user_id=user["id"], metadata={"tontine_id": tontine_id})
    return {"detail": "deleted"}


@router.delete("/{tontine_id}/members/{target_user_id}")
async def kick_member(tontine_id: str, target_user_id: str, user=Depends(get_current_user)):
    """Remove a member from tontine. Only tontine admin or super_admin."""
    db = get_db()
    tontine = await db.tontines.find_one({"id": tontine_id}, _proj())
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")
    if user["role"] != "super_admin" and tontine["admin_id"] != user["id"]:
        raise HTTPException(403, "Seul l'admin de la tontine ou un super admin peut exclure un membre.")
    # Cannot kick the creator
    if target_user_id == tontine["admin_id"]:
        raise HTTPException(400, "Impossible d'exclure le créateur de la tontine.")
    member = await db.tontine_members.find_one({"tontine_id": tontine_id, "user_id": target_user_id})
    if not member:
        raise HTTPException(404, "Membre introuvable.")
    await db.tontine_members.delete_one({"tontine_id": tontine_id, "user_id": target_user_id})
    await db.tontines.update_one({"id": tontine_id}, {"$inc": {"members_count": -1}})
    await create_notification(
        target_user_id, "Exclusion de tontine",
        f"Vous avez été retiré de la tontine « {tontine['name']} ».",
        kind="warning",
    )
    await log_event("tontine.member_kicked", user_id=user["id"], metadata={"tontine_id": tontine_id, "kicked": target_user_id})
    return {"detail": "kicked"}
