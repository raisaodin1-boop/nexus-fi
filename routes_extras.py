"""Promotion requests, manager dashboard, analytics time-series, PDF base64 for sharing,
admin user management actions (suspend/restore/delete)."""
import base64
import io
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from db import get_db
from deps import get_current_user, require_super_admin
from models import gen_id, now_utc
from audit import log_event
from notifications_svc import create_notification
from trust_score import compute_trust_score


# ============== PROMOTION REQUESTS ==============
promo_router = APIRouter(prefix="/promotion-requests", tags=["promotion"])


@promo_router.get("/me")
async def my_request(user=Depends(get_current_user)):
    db = get_db()
    req = await db.promotion_requests.find_one(
        {"user_id": user["id"]},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    return req or {}


@promo_router.post("")
async def request_promotion(payload: dict, user=Depends(get_current_user)):
    """Member requests promotion to Tontine Manager."""
    if user["role"] != "member":
        raise HTTPException(400, "Seuls les Membres peuvent demander une promotion.")

    db = get_db()
    pending = await db.promotion_requests.find_one(
        {"user_id": user["id"], "status": "pending"}
    )
    if pending:
        raise HTTPException(400, "Une demande est déjà en cours d'examen.")

    reason = (payload.get("reason") or "").strip()
    if len(reason) < 10:
        raise HTTPException(400, "Veuillez fournir une motivation d'au moins 10 caractères.")

    req = {
        "id": gen_id(),
        "user_id": user["id"],
        "full_name": user["full_name"],
        "email": user["email"],
        "reason": reason,
        "status": "pending",
        "decided_by": None,
        "decided_at": None,
        "decision_note": None,
        "created_at": now_utc(),
    }
    await db.promotion_requests.insert_one(req)
    await log_event("promotion.requested", user_id=user["id"], metadata={"id": req["id"]})
    await create_notification(
        user["id"], "Demande envoyée",
        "Votre demande de promotion en Tontine Manager est en cours d'examen.", kind="info"
    )
    req.pop("_id", None)
    return req


# Admin-side routes for promotion management live on the admin router below.


# ============== MANAGER DASHBOARD ==============
manager_router = APIRouter(prefix="/manager", tags=["manager"])


@manager_router.get("/overview")
async def manager_overview(user=Depends(get_current_user)):
    if user["role"] not in ("tontine_manager", "super_admin"):
        raise HTTPException(403, "Accès réservé aux Tontine Managers.")
    db = get_db()
    uid = user["id"]

    # Tontines, associations, cooperatives, funds I administer
    tontines = await db.tontines.find({"admin_id": uid}, {"_id": 0}).to_list(500)
    associations = await db.associations.find({"admin_id": uid}, {"_id": 0}).to_list(500)
    cooperatives = await db.cooperatives.find({"admin_id": uid}, {"_id": 0}).to_list(500)
    funds = await db.community_funds.find({"owner_id": uid}, {"_id": 0}).to_list(500)

    # Aggregates
    total_members = sum(t["members_count"] for t in tontines) \
        + sum(a["members_count"] for a in associations) \
        + sum(c["members_count"] for c in cooperatives)
    total_collected = sum(t.get("total_collected", 0) for t in tontines) \
        + sum(a.get("total_collected", 0) for a in associations) \
        + sum(c.get("total_capital", 0) for c in cooperatives) \
        + sum(f.get("current_balance", 0) for f in funds)

    # Compliance: avg of (collected / expected) for each tontine
    compliance_values = []
    for t in tontines:
        expected = t["contribution_amount"] * t["members_count"]
        if expected > 0:
            compliance_values.append(min(100, (t.get("total_collected", 0) / expected) * 100))
    avg_compliance = round(sum(compliance_values) / len(compliance_values), 1) if compliance_values else 0.0

    # Community Health Score: blend of compliance + member growth (last 30 days new members)
    thirty = datetime.now(timezone.utc) - timedelta(days=30)
    tontine_ids = [t["id"] for t in tontines]
    assoc_ids = [a["id"] for a in associations]
    coop_ids = [c["id"] for c in cooperatives]
    new_members = await db.tontine_members.count_documents(
        {"tontine_id": {"$in": tontine_ids}, "joined_at": {"$gte": thirty}}
    ) + await db.association_members.count_documents(
        {"association_id": {"$in": assoc_ids}, "joined_at": {"$gte": thirty}}
    ) + await db.cooperative_members.count_documents(
        {"cooperative_id": {"$in": coop_ids}, "joined_at": {"$gte": thirty}}
    )
    growth_score = min(100, (new_members / max(total_members, 1)) * 300)
    health_score = round(avg_compliance * 0.6 + growth_score * 0.4, 1)

    return {
        "groups": {
            "tontines": len(tontines),
            "associations": len(associations),
            "cooperatives": len(cooperatives),
            "funds": len(funds),
        },
        "total_members": total_members,
        "total_collected": total_collected,
        "avg_compliance": avg_compliance,
        "health_score": health_score,
        "new_members_30d": new_members,
        "tontines": tontines[:5],
        "currency": "XAF",
    }


@manager_router.get("/members")
async def manager_members(user=Depends(get_current_user)):
    if user["role"] not in ("tontine_manager", "super_admin"):
        raise HTTPException(403, "Accès réservé.")
    db = get_db()
    uid = user["id"]

    tontines = await db.tontines.find({"admin_id": uid}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    t_ids = [t["id"] for t in tontines]
    members = await db.tontine_members.find(
        {"tontine_id": {"$in": t_ids}},
        {"_id": 0},
    ).sort("joined_at", -1).to_list(500)

    # Attach tontine name
    tname = {t["id"]: t["name"] for t in tontines}
    for m in members:
        m["tontine_name"] = tname.get(m["tontine_id"], "—")
    return members


# ============== ANALYTICS TIME-SERIES ==============
analytics_router = APIRouter(prefix="/analytics", tags=["analytics"])


def _days_buckets(days: int) -> list[datetime]:
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return [today - timedelta(days=i) for i in range(days - 1, -1, -1)]


async def _aggregate_daily(collection, user_id: Optional[str], date_field: str, days: int, amount_field: Optional[str] = None):
    db = get_db()
    start = datetime.now(timezone.utc) - timedelta(days=days)
    match = {date_field: {"$gte": start}}
    if user_id is not None:
        match["user_id"] = user_id
    if amount_field:
        match["kind"] = "deposit"  # for savings

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": f"${date_field}"}},
            "value": {"$sum": f"${amount_field}"} if amount_field else {"$sum": 1},
        }},
    ]
    rows = await db[collection].aggregate(pipeline).to_list(1000)
    by_day = {r["_id"]: r["value"] for r in rows}

    buckets = _days_buckets(days)
    return [
        {"date": b.strftime("%Y-%m-%d"), "value": float(by_day.get(b.strftime("%Y-%m-%d"), 0))}
        for b in buckets
    ]


@analytics_router.get("/me/savings")
async def me_savings_series(days: int = 30, user=Depends(get_current_user)):
    series = await _aggregate_daily("savings_transactions", user["id"], "created_at", days, amount_field="amount")
    return {"days": days, "series": series}


@analytics_router.get("/me/contributions")
async def me_contributions_series(days: int = 30, user=Depends(get_current_user)):
    series = await _aggregate_daily("tontine_contributions", user["id"], "created_at", days, amount_field="amount")
    return {"days": days, "series": series}


@analytics_router.get("/platform/savings")
async def platform_savings_series(days: int = 30, _admin=Depends(require_super_admin)):
    series = await _aggregate_daily("savings_transactions", None, "created_at", days, amount_field="amount")
    return {"days": days, "series": series}


@analytics_router.get("/platform/users")
async def platform_users_series(days: int = 30, _admin=Depends(require_super_admin)):
    # New users per day
    db = get_db()
    start = datetime.now(timezone.utc) - timedelta(days=days)
    rows = await db.users.aggregate([
        {"$match": {"created_at": {"$gte": start}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "value": {"$sum": 1},
        }},
    ]).to_list(1000)
    by_day = {r["_id"]: r["value"] for r in rows}
    buckets = _days_buckets(days)
    series = [
        {"date": b.strftime("%Y-%m-%d"), "value": float(by_day.get(b.strftime("%Y-%m-%d"), 0))}
        for b in buckets
    ]
    return {"days": days, "series": series}


@analytics_router.get("/platform/contributions")
async def platform_contributions_series(days: int = 30, _admin=Depends(require_super_admin)):
    series = await _aggregate_daily("tontine_contributions", None, "created_at", days, amount_field="amount")
    return {"days": days, "series": series}


@analytics_router.get("/fiscal-report")
async def fiscal_report(year: int = None, current_user=Depends(get_current_user)):
    """Generate a fiscal annual report PDF for the current user."""
    if year is None:
        year = datetime.now(timezone.utc).year

    db = get_db()
    uid = current_user["id"]

    year_start = datetime(year, 1, 1, tzinfo=timezone.utc)
    year_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)

    payments = await db.payments.find({
        "user_id": uid,
        "status": "succeeded",
        "created_at": {"$gte": year_start, "$lt": year_end},
    }).to_list(None)

    withdrawals = await db.withdrawals.find({
        "user_id": uid,
        "status": "completed",
        "created_at": {"$gte": year_start, "$lt": year_end},
    }).to_list(None)

    total_depot = sum(p.get("amount_xaf", 0) for p in payments)
    total_retrait = sum(w.get("amount_xaf", 0) for w in withdrawals)
    commissions = sum(w.get("commission_xaf", 0) for w in withdrawals)
    solde_net = total_depot - total_retrait

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4

    # Background
    c.setFillColor("#0B1F3A")
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Header gradient band
    c.setFillColor("#1E3A5F")
    c.rect(0, H - 110, W, 110, fill=1, stroke=0)

    # Title
    c.setFillColor("#FFFFFF")
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(W / 2, H - 55, f"RAPPORT FISCAL HODIX {year}")

    c.setFont("Helvetica", 12)
    c.setFillColor("#A0B4C8")
    c.drawCentredString(W / 2, H - 78, "Document confidentiel — généré automatiquement")

    # Generated date
    c.setFont("Helvetica", 9)
    c.setFillColor("#7A9AB0")
    now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    c.drawRightString(W - 40, H - 100, f"Généré le {now_str}")

    # User info box
    y = H - 155
    c.setFillColor("#1A2E45")
    c.roundRect(40, y - 30, W - 80, 50, 8, fill=1, stroke=0)
    c.setFillColor("#FFFFFF")
    c.setFont("Helvetica-Bold", 11)
    c.drawString(55, y + 4, current_user.get("full_name", "—"))
    c.setFont("Helvetica", 10)
    c.setFillColor("#A0B4C8")
    c.drawString(55, y - 14, current_user.get("email", "—"))
    c.setFillColor("#4ADE80")
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(W - 55, y - 4, f"Exercice fiscal {year}")

    # Summary table
    y = H - 240
    c.setFillColor("#FFFFFF")
    c.setFont("Helvetica-Bold", 13)
    c.drawString(40, y, "Résumé financier")

    table_y = y - 20
    rows = [
        ("Total des dépôts", f"{total_depot:,.0f} XAF", "#4ADE80"),
        ("Total des retraits", f"{total_retrait:,.0f} XAF", "#F87171"),
        ("Commissions Hodix", f"{commissions:,.0f} XAF", "#FBBF24"),
        ("Solde net", f"{solde_net:,.0f} XAF", "#60A5FA"),
    ]
    row_h = 36
    for i, (label, value, color) in enumerate(rows):
        ry = table_y - i * row_h
        bg = "#162032" if i % 2 == 0 else "#1A2E45"
        c.setFillColor(bg)
        c.roundRect(40, ry - row_h + 10, W - 80, row_h, 6, fill=1, stroke=0)
        c.setFillColor("#A0B4C8")
        c.setFont("Helvetica", 10)
        c.drawString(55, ry - 6, label)
        c.setFillColor(color)
        c.setFont("Helvetica-Bold", 11)
        c.drawRightString(W - 55, ry - 6, value)

    # Transactions section
    y_tx = table_y - len(rows) * row_h - 40
    c.setFillColor("#FFFFFF")
    c.setFont("Helvetica-Bold", 13)
    c.drawString(40, y_tx, f"Transactions de dépôt ({len(payments)})")

    y_tx -= 20
    # Header
    c.setFillColor("#1E3A5F")
    c.rect(40, y_tx - 16, W - 80, 22, fill=1, stroke=0)
    c.setFillColor("#A0B4C8")
    c.setFont("Helvetica-Bold", 9)
    c.drawString(50, y_tx - 8, "Date")
    c.drawString(170, y_tx - 8, "Méthode")
    c.drawRightString(W - 50, y_tx - 8, "Montant")

    for idx, p in enumerate(payments[:15]):
        ry = y_tx - 30 - idx * 20
        if ry < 50:
            break
        bg = "#162032" if idx % 2 == 0 else "#1A2E45"
        c.setFillColor(bg)
        c.rect(40, ry - 8, W - 80, 18, fill=1, stroke=0)
        dt = p.get("created_at")
        dt_str = dt.strftime("%d/%m/%Y") if isinstance(dt, datetime) else str(dt)[:10]
        c.setFillColor("#D0E0F0")
        c.setFont("Helvetica", 9)
        c.drawString(50, ry, dt_str)
        c.drawString(170, ry, (p.get("payment_method") or "—")[:12])
        c.setFillColor("#4ADE80")
        c.setFont("Helvetica-Bold", 9)
        c.drawRightString(W - 50, ry, f"{p.get('amount_xaf', 0):,.0f} XAF")

    # Footer
    c.setFillColor("#1E3A5F")
    c.rect(0, 0, W, 40, fill=1, stroke=0)
    c.setFillColor("#7A9AB0")
    c.setFont("Helvetica", 8)
    c.drawCentredString(W / 2, 15, "HODIX — Document généré automatiquement. Non valable comme document officiel sans signature.")

    c.showPage()
    c.save()
    buf.seek(0)
    pdf_b64 = base64.b64encode(buf.read()).decode("ascii")
    filename = f"hodix-fiscal-{year}.pdf"
    return {"pdf_b64": pdf_b64, "filename": filename}


# ============== PDF BASE64 (for native Share) ==============
pdfb64_router = APIRouter(prefix="/reports-b64", tags=["reports"])

# Reuse the certificate drawing helpers from routes_identity
from routes_identity import _draw_certificate  # noqa: E402


def _b64_from(c: canvas.Canvas, buf: io.BytesIO) -> str:
    c.showPage()
    c.save()
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("ascii")


@pdfb64_router.get("/identity")
async def b64_identity(user=Depends(get_current_user)):
    db = get_db()
    score = await compute_trust_score(user["id"])
    pipeline = [{"$match": {"user_id": user["id"], "kind": "deposit"}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}]
    d = await db.savings_transactions.aggregate(pipeline).to_list(1)
    deposits = d[0] if d else {"total": 0, "count": 0}

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certificate(
        c, "Certificat d'Identité Financière",
        "Profil financier vérifié — Hodix",
        user["full_name"],
        [
            f"Score de confiance Hodix : {score['score']:.1f}/100 ({score['level']})",
            f"Total épargné : {deposits['total']:,.0f} XAF sur {deposits['count']} dépôts",
            f"Ancienneté du compte : {score['stats']['account_age_days']} jours",
        ],
        "Atteste l'historique financier et la fiabilité communautaire."
    )
    return {"filename": f"hodix-identite-{user['id'][:8]}.pdf", "base64": _b64_from(c, buf)}


@pdfb64_router.get("/trust-score")
async def b64_trust(user=Depends(get_current_user)):
    score = await compute_trust_score(user["id"])
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certificate(
        c, "Certificat Trust Score Hodix",
        f"Catégorie : {score['level']} — Risque : {score['risk']}",
        user["full_name"],
        [
            f"Score actuel : {score['score']:.1f} / 100",
            f"Consistance : {score['components']['consistency']:.1f}",
            f"Volume d'épargne : {score['components']['volume']:.1f}",
            f"Participation : {score['components']['participation']:.1f}",
            f"Fiabilité : {score['components']['reliability']:.1f}",
        ],
        "Score basé sur l'historique d'épargne et de contribution."
    )
    return {"filename": f"hodix-trust-{user['id'][:8]}.pdf", "base64": _b64_from(c, buf)}


@pdfb64_router.get("/savings")
async def b64_savings(user=Depends(get_current_user)):
    db = get_db()
    pipeline = [{"$match": {"user_id": user["id"], "kind": "deposit"}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}]
    d = await db.savings_transactions.aggregate(pipeline).to_list(1)
    deposits = d[0] if d else {"total": 0, "count": 0}
    goals_count = await db.savings_goals.count_documents({"user_id": user["id"]})

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certificate(
        c, "Certificat d'Épargne",
        "Historique d'épargne personnelle",
        user["full_name"],
        [
            f"Total épargné : {deposits['total']:,.0f} XAF",
            f"Nombre de dépôts : {deposits['count']}",
            f"Objectifs créés : {goals_count}",
        ],
        "Atteste l'engagement d'épargne du porteur."
    )
    return {"filename": f"hodix-savings-{user['id'][:8]}.pdf", "base64": _b64_from(c, buf)}


# ============== ADMIN EXTENDED ==============
admin_ext_router = APIRouter(prefix="/admin", tags=["admin"])


@admin_ext_router.get("/promotion-requests")
async def list_promotion_requests(_admin=Depends(require_super_admin)):
    db = get_db()
    items = await db.promotion_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@admin_ext_router.post("/promotion-requests/{rid}/approve")
async def approve_promotion(rid: str, payload: Optional[dict] = None, admin=Depends(require_super_admin)):
    db = get_db()
    req = await db.promotion_requests.find_one({"id": rid})
    if not req:
        raise HTTPException(404, "Demande introuvable.")
    if req["status"] != "pending":
        raise HTTPException(400, "Demande déjà traitée.")
    note = (payload or {}).get("note")
    now = now_utc()
    await db.promotion_requests.update_one({"id": rid}, {"$set": {
        "status": "approved", "decided_by": admin["id"], "decided_at": now, "decision_note": note,
    }})
    await db.users.update_one({"id": req["user_id"]}, {"$set": {"role": "tontine_manager", "updated_at": now}})
    await create_notification(
        req["user_id"], "Promotion approuvée !",
        "Vous êtes maintenant Tontine Manager. Vous pouvez créer des tontines illimitées et accéder au tableau de bord communautaire.",
        kind="success",
    )
    await log_event("promotion.approved", user_id=admin["id"], metadata={"request_id": rid, "target": req["user_id"]})
    return {"detail": "approved"}


@admin_ext_router.post("/promotion-requests/{rid}/reject")
async def reject_promotion(rid: str, payload: Optional[dict] = None, admin=Depends(require_super_admin)):
    db = get_db()
    req = await db.promotion_requests.find_one({"id": rid})
    if not req:
        raise HTTPException(404, "Demande introuvable.")
    if req["status"] != "pending":
        raise HTTPException(400, "Demande déjà traitée.")
    note = (payload or {}).get("note")
    await db.promotion_requests.update_one({"id": rid}, {"$set": {
        "status": "rejected", "decided_by": admin["id"], "decided_at": now_utc(), "decision_note": note,
    }})
    await create_notification(
        req["user_id"], "Demande refusée",
        note or "Votre demande de promotion n'a pas été acceptée pour le moment.",
        kind="warning",
    )
    await log_event("promotion.rejected", user_id=admin["id"], metadata={"request_id": rid, "target": req["user_id"]})
    return {"detail": "rejected"}


@admin_ext_router.post("/users/{uid}/suspend")
async def suspend_user(uid: str, admin=Depends(require_super_admin)):
    db = get_db()
    if uid == admin["id"]:
        raise HTTPException(400, "Vous ne pouvez pas vous suspendre.")
    res = await db.users.update_one({"id": uid}, {"$set": {"is_active": False, "updated_at": now_utc()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Utilisateur introuvable.")
    # revoke sessions
    await db.sessions.update_many({"user_id": uid, "is_active": True},
                                  {"$set": {"is_active": False, "revoked_at": now_utc()}})
    await log_event("admin.user_suspended", user_id=admin["id"], metadata={"target": uid})
    return {"detail": "suspended"}


@admin_ext_router.post("/users/{uid}/restore")
async def restore_user(uid: str, admin=Depends(require_super_admin)):
    db = get_db()
    res = await db.users.update_one({"id": uid}, {"$set": {"is_active": True, "updated_at": now_utc()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Utilisateur introuvable.")
    await log_event("admin.user_restored", user_id=admin["id"], metadata={"target": uid})
    return {"detail": "restored"}


@admin_ext_router.get("/payments")
async def admin_list_payments(_admin=Depends(require_super_admin)):
    """Super admin: list all payments on the platform (last 100, most recent first)."""
    db = get_db()
    payments = await db.payments.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return payments


@admin_ext_router.get("/payment-config")
async def admin_get_payment_config(_admin=Depends(require_super_admin)):
    """Return current payment fee configuration."""
    from payment_config import get_payment_config
    return await get_payment_config()


@admin_ext_router.patch("/payment-config")
async def admin_update_payment_config(payload: dict, _admin=Depends(require_super_admin)):
    """Update payment fee config. Validates bounds and invalidates cache."""
    from payment_config import invalidate_config_cache
    SAFE_BOUNDS = {
        "stripe_fee_rate": (0.0, 0.10),
        "stripe_fixed_fee_usd": (0.0, 2.0),
        "stripe_reserve_rate": (0.0, 0.05),
        "hodix_commission_pct": (0.0, 10.0),
        "xaf_to_usd_rate": (0.0001, 0.01),
        "xaf_to_eur_rate": (0.0001, 0.01),
    }
    updates = {}
    for key, (lo, hi) in SAFE_BOUNDS.items():
        if key in payload:
            val = float(payload[key])
            if not (lo <= val <= hi):
                raise HTTPException(400, f"{key} doit être entre {lo} et {hi}.")
            updates[key] = val

    if not updates:
        raise HTTPException(400, "Aucun champ valide à mettre à jour.")

    db = get_db()
    await db.payment_config.update_one(
        {"_id": "global"},
        {"$set": updates},
        upsert=True,
    )
    invalidate_config_cache()
    await log_event("admin.payment_config_updated", user_id=_admin["id"], metadata={"updates": updates})
    return {"updated": list(updates.keys()), "values": updates}


@admin_ext_router.delete("/users/{uid}")
async def delete_user(uid: str, admin=Depends(require_super_admin)):
    db = get_db()
    if uid == admin["id"]:
        raise HTTPException(400, "Vous ne pouvez pas vous supprimer.")
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "Utilisateur introuvable.")
    if user.get("role") == "super_admin":
        raise HTTPException(400, "Impossible de supprimer un autre super admin.")
    await db.users.delete_one({"id": uid})
    await db.sessions.delete_many({"user_id": uid})
    await log_event("admin.user_deleted", user_id=admin["id"], metadata={"target": uid})
    return {"detail": "deleted"}
