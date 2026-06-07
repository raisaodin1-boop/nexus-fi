"""Trust Score, Financial Identity, Reports (PDF) and Admin routes."""
import base64
import io
import math
import os
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas

from db import get_db
from deps import get_current_user, require_super_admin
from models import gen_id, now_utc
from trust_score import compute_trust_score, store_trust_score

router = APIRouter(tags=["identity"])


# ===================== TRUST SCORE =====================
@router.get("/trust-score")
async def get_trust_score(user=Depends(get_current_user)):
    return await store_trust_score(user["id"])


# ===================== FINANCIAL IDENTITY =====================
@router.get("/identity")
async def get_identity(user=Depends(get_current_user)):
    db = get_db()
    score = await compute_trust_score(user["id"])

    # Totals
    deposits_pipeline = [
        {"$match": {"user_id": user["id"], "kind": "deposit"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    d_res = await db.savings_transactions.aggregate(deposits_pipeline).to_list(1)
    deposits = d_res[0] if d_res else {"total": 0, "count": 0}

    tontine_contribs_pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    tc = await db.tontine_contributions.aggregate(tontine_contribs_pipeline).to_list(1)
    tontine_contribs = tc[0] if tc else {"total": 0, "count": 0}

    tontines = await db.tontine_members.count_documents({"user_id": user["id"]})
    assocs = await db.association_members.count_documents({"user_id": user["id"]})
    coops = await db.cooperative_members.count_documents({"user_id": user["id"]})

    return {
        "user": {
            "id": user["id"], "full_name": user["full_name"],
            "email": user["email"], "phone": user.get("phone"),
            "country": user.get("country"), "city": user.get("city"),
            "occupation": user.get("occupation"),
            "created_at": user["created_at"],
        },
        "trust_score": score,
        "totals": {
            "total_savings": deposits["total"],
            "deposits_count": deposits["count"],
            "tontine_contributions": tontine_contribs["total"],
            "tontine_contributions_count": tontine_contribs["count"],
            "groups": tontines + assocs + coops,
            "tontines": tontines,
            "associations": assocs,
            "cooperatives": coops,
        },
        "currency": "XAF",
    }


# ===================== INSIGHTS =====================
@router.get("/insights")
async def insights(user=Depends(get_current_user)):
    db = get_db()
    score = await compute_trust_score(user["id"])
    items = []
    if score["score"] >= 60:
        items.append({"text": f"Vous êtes parmi les profils {score['level']} sur Hodix.", "kind": "success"})
    if score["stats"]["deposits_90d"] >= 5:
        items.append({"text": f"{score['stats']['deposits_90d']} dépôts effectués sur les 90 derniers jours.", "kind": "info"})
    if score["stats"]["tontines"] > 0:
        items.append({"text": f"Vous participez à {score['stats']['tontines']} tontine(s) — un atout pour votre fiabilité.", "kind": "info"})
    if score["stats"]["total_saved"] > 0:
        items.append({"text": f"Vous avez épargné un total de {score['stats']['total_saved']:,.0f} XAF.", "kind": "success"})
    if score["stats"]["account_age_days"] >= 30:
        items.append({"text": f"Votre profil Hodix existe depuis {score['stats']['account_age_days']} jours.", "kind": "info"})
    if not items:
        items.append({"text": "Effectuez votre premier dépôt pour démarrer votre identité financière.", "kind": "info"})
    return {"items": items}


# ===================== REPORTS / PDF CERTIFICATES =====================
def _draw_certificate(c: canvas.Canvas, title: str, subtitle: str, user_name: str, body_lines: list[str], footer: str):
    width, height = A4
    # Background border
    c.setFillColor(colors.HexColor("#0B1F3A"))
    c.rect(0, height - 4 * cm, width, 4 * cm, fill=1, stroke=0)

    # Logo block
    c.setFillColor(colors.HexColor("#10B981"))
    c.rect(2 * cm, height - 3.3 * cm, 2.5 * cm, 2.5 * cm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(2.7 * cm, height - 2.3 * cm, "HX")

    # Header text
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(5.2 * cm, height - 2.0 * cm, "HODIX")
    c.setFont("Helvetica", 11)
    c.drawString(5.2 * cm, height - 2.7 * cm, "Building Trust Together")

    # Title
    c.setFillColor(colors.HexColor("#0B1F3A"))
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(width / 2, height - 6 * cm, title)

    c.setFillColor(colors.HexColor("#1D4ED8"))
    c.setFont("Helvetica-Oblique", 13)
    c.drawCentredString(width / 2, height - 6.8 * cm, subtitle)

    # Decorative line
    c.setStrokeColor(colors.HexColor("#10B981"))
    c.setLineWidth(2)
    c.line(5 * cm, height - 7.3 * cm, width - 5 * cm, height - 7.3 * cm)

    # User name
    c.setFillColor(colors.HexColor("#0F172A"))
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 8.4 * cm, "Délivré à")
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(width / 2, height - 9.4 * cm, user_name)

    # Body
    y = height - 11 * cm
    c.setFont("Helvetica", 12)
    c.setFillColor(colors.HexColor("#0F172A"))
    for line in body_lines:
        c.drawCentredString(width / 2, y, line)
        y -= 0.8 * cm

    # Footer
    c.setFont("Helvetica-Oblique", 10)
    c.setFillColor(colors.HexColor("#64748B"))
    c.drawCentredString(width / 2, 3 * cm, footer)
    c.setFont("Helvetica", 9)
    c.drawCentredString(width / 2, 2.3 * cm, "Ce document constitue une attestation officielle Hodix.")
    c.drawCentredString(width / 2, 1.8 * cm, datetime.now(timezone.utc).strftime("Émis le %d/%m/%Y à %H:%M UTC"))


def _stream_pdf(c: canvas.Canvas, buf: io.BytesIO, filename: str):
    c.showPage()
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/reports/identity")
async def report_identity(user=Depends(get_current_user)):
    db = get_db()
    score = await compute_trust_score(user["id"])
    pipeline = [{"$match": {"user_id": user["id"], "kind": "deposit"}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}]
    d = await db.savings_transactions.aggregate(pipeline).to_list(1)
    deposits = d[0] if d else {"total": 0, "count": 0}

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certificate(
        c,
        "Certificat d'Identité Financière",
        "Profil financier vérifié — Hodix",
        user["full_name"],
        [
            f"Score de confiance Hodix : {score['score']:.1f}/100 ({score['level']})",
            f"Total épargné : {deposits['total']:,.0f} XAF sur {deposits['count']} dépôts",
            f"Ancienneté du compte : {score['stats']['account_age_days']} jours",
            f"Participation groupes : {score['stats']['tontines'] + score['stats']['associations'] + score['stats']['cooperatives']} groupe(s)",
        ],
        "Atteste l'historique financier et la fiabilité communautaire du porteur."
    )
    return _stream_pdf(c, buf, f"hodix-identite-{user['id'][:8]}.pdf")


@router.get("/reports/trust-score")
async def report_trust(user=Depends(get_current_user)):
    score = await compute_trust_score(user["id"])
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certificate(
        c,
        "Certificat Trust Score Hodix",
        f"Catégorie : {score['level']} — Risque : {score['risk']}",
        user["full_name"],
        [
            f"Score actuel : {score['score']:.1f} / 100",
            f"Consistance : {score['components']['consistency']:.1f}",
            f"Volume d'épargne : {score['components']['volume']:.1f}",
            f"Participation : {score['components']['participation']:.1f}",
            f"Fiabilité : {score['components']['reliability']:.1f}",
        ],
        "Score basé sur l'historique d'épargne et de contribution communautaire."
    )
    return _stream_pdf(c, buf, f"hodix-trust-{user['id'][:8]}.pdf")


@router.get("/reports/savings")
async def report_savings(user=Depends(get_current_user)):
    db = get_db()
    pipeline = [{"$match": {"user_id": user["id"], "kind": "deposit"}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}]
    d = await db.savings_transactions.aggregate(pipeline).to_list(1)
    deposits = d[0] if d else {"total": 0, "count": 0}
    goals_count = await db.savings_goals.count_documents({"user_id": user["id"]})

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certificate(
        c,
        "Certificat d'Épargne",
        "Historique d'épargne personnelle",
        user["full_name"],
        [
            f"Total épargné : {deposits['total']:,.0f} XAF",
            f"Nombre de dépôts : {deposits['count']}",
            f"Objectifs créés : {goals_count}",
        ],
        "Atteste l'engagement d'épargne du porteur sur la plateforme Hodix."
    )
    return _stream_pdf(c, buf, f"hodix-savings-{user['id'][:8]}.pdf")


# ===================== FREE BASE64 PDF REPORTS =====================

def _build_pdf_b64(c: canvas.Canvas, buf: io.BytesIO, filename: str) -> dict:
    c.showPage()
    c.save()
    buf.seek(0)
    encoded = base64.b64encode(buf.read()).decode("utf-8")
    return {"filename": filename, "base64": encoded}


@router.get("/reports-b64/identity")
async def report_identity_b64(user=Depends(get_current_user)):
    db = get_db()
    score = await compute_trust_score(user["id"])
    pipeline = [{"$match": {"user_id": user["id"], "kind": "deposit"}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}]
    d = await db.savings_transactions.aggregate(pipeline).to_list(1)
    deposits = d[0] if d else {"total": 0, "count": 0}

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certificate(
        c,
        "Certificat d'Identité Financière",
        "Profil financier vérifié — Hodix",
        user["full_name"],
        [
            f"Score de confiance Hodix : {score['score']:.1f}/100 ({score['level']})",
            f"Total épargné : {deposits['total']:,.0f} XAF sur {deposits['count']} dépôts",
            f"Ancienneté du compte : {score['stats']['account_age_days']} jours",
            f"Participation groupes : {score['stats']['tontines'] + score['stats']['associations'] + score['stats']['cooperatives']} groupe(s)",
        ],
        "Atteste l'historique financier et la fiabilité communautaire du porteur."
    )
    return _build_pdf_b64(c, buf, f"hodix-identite-{user['id'][:8]}.pdf")


@router.get("/reports-b64/trust-score")
async def report_trust_b64(user=Depends(get_current_user)):
    score = await compute_trust_score(user["id"])
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certificate(
        c,
        "Certificat Trust Score Hodix",
        f"Catégorie : {score['level']} — Risque : {score['risk']}",
        user["full_name"],
        [
            f"Score actuel : {score['score']:.1f} / 100",
            f"Consistance : {score['components']['consistency']:.1f}",
            f"Volume d'épargne : {score['components']['volume']:.1f}",
            f"Participation : {score['components']['participation']:.1f}",
            f"Fiabilité : {score['components']['reliability']:.1f}",
        ],
        "Score basé sur l'historique d'épargne et de contribution communautaire."
    )
    return _build_pdf_b64(c, buf, f"hodix-trust-{user['id'][:8]}.pdf")


@router.get("/reports-b64/savings")
async def report_savings_b64(user=Depends(get_current_user)):
    db = get_db()
    pipeline = [{"$match": {"user_id": user["id"], "kind": "deposit"}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}]
    d = await db.savings_transactions.aggregate(pipeline).to_list(1)
    deposits = d[0] if d else {"total": 0, "count": 0}
    goals_count = await db.savings_goals.count_documents({"user_id": user["id"]})

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certificate(
        c,
        "Certificat d'Épargne",
        "Historique d'épargne personnelle",
        user["full_name"],
        [
            f"Total épargné : {deposits['total']:,.0f} XAF",
            f"Nombre de dépôts : {deposits['count']}",
            f"Objectifs créés : {goals_count}",
        ],
        "Atteste l'engagement d'épargne du porteur sur la plateforme Hodix."
    )
    return _build_pdf_b64(c, buf, f"hodix-savings-{user['id'][:8]}.pdf")


# ===================== CERTIFIED PDF DOCUMENTS (10,000 FCFA) =====================

def _draw_certified_certificate(
    c: canvas.Canvas, title: str, subtitle: str, user_name: str,
    body_lines: list, footer: str, verification_code: str
):
    """Extended version of _draw_certificate with watermark, stamp, verification code, and QR placeholder."""
    width, height = A4

    # Draw the base certificate layout
    _draw_certificate(c, title, subtitle, user_name, body_lines, footer)

    # --- Watermark (diagonal, light gray, 40pt) ---
    c.saveState()
    c.setFillColor(colors.HexColor("#DDDDDD"))
    c.setFont("Helvetica-Bold", 40)
    c.translate(width / 2, height / 2)
    c.rotate(45)
    c.drawCentredString(0, 0, "CERTIFIÉ AUTHENTIQUE")
    c.restoreState()

    # --- Official stamp circle (bottom right) ---
    stamp_cx = width - 4 * cm
    stamp_cy = 4 * cm
    stamp_r = 1.8 * cm
    c.setFillColor(colors.HexColor("#0B1F3A"))
    c.circle(stamp_cx, stamp_cy, stamp_r, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(stamp_cx, stamp_cy + 0.3 * cm, "HODIX")
    c.setFont("Helvetica", 6)
    c.drawCentredString(stamp_cx, stamp_cy - 0.1 * cm, "OFFICIEL")
    # Draw circle ring
    c.setStrokeColor(colors.HexColor("#10B981"))
    c.setLineWidth(1.5)
    c.circle(stamp_cx, stamp_cy, stamp_r - 0.15 * cm, fill=0, stroke=1)

    # --- Verification code ---
    c.setFillColor(colors.HexColor("#0B1F3A"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(2 * cm, 4.5 * cm, f"Code de vérification : {verification_code}")

    # --- QR Code placeholder box ---
    qr_x = 2 * cm
    qr_y = 4.8 * cm
    qr_size = 2.5 * cm
    c.setStrokeColor(colors.HexColor("#0B1F3A"))
    c.setLineWidth(1)
    c.rect(qr_x, qr_y, qr_size, qr_size, fill=0, stroke=1)
    c.setFillColor(colors.HexColor("#64748B"))
    c.setFont("Helvetica", 5)
    c.drawCentredString(qr_x + qr_size / 2, qr_y + qr_size / 2 + 0.1 * cm, "QR CODE")
    c.drawCentredString(qr_x + qr_size / 2, qr_y + qr_size / 2 - 0.3 * cm, "VÉRIFICATION")


CertKind = Literal["identity", "trust-score", "savings"]

CERT_KIND_LABELS = {
    "identity": "Identité Financière",
    "trust-score": "Trust Score",
    "savings": "Épargne",
}


class CertInitiatePayload(BaseModel):
    kind: CertKind


class CertConfirmPayload(BaseModel):
    purchase_id: str


@router.post("/reports/certified/initiate")
async def certified_initiate(payload: CertInitiatePayload, user=Depends(get_current_user)):
    db = get_db()
    purchase_id = gen_id()
    label = f"Certificat Hodix Authentifié - {CERT_KIND_LABELS[payload.kind]}"
    doc = {
        "id": purchase_id,
        "user_id": user["id"],
        "kind": payload.kind,
        "amount_xaf": 10000,
        "status": "pending",
        "created_at": now_utc(),
    }
    await db.certificate_purchases.insert_one(doc)
    return {"purchase_id": purchase_id, "amount_xaf": 10000, "label": label}


@router.post("/reports/certified/confirm")
async def certified_confirm(payload: CertConfirmPayload, user=Depends(get_current_user)):
    db = get_db()
    res = await db.certificate_purchases.update_one(
        {"id": payload.purchase_id, "user_id": user["id"]},
        {"$set": {"status": "paid", "paid_at": now_utc()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Achat introuvable.")
    return {"ok": True, "purchase_id": payload.purchase_id}


@router.get("/reports/certified/{kind}")
async def certified_report(kind: CertKind, user=Depends(get_current_user)):
    db = get_db()

    # Check payment
    purchase = await db.certificate_purchases.find_one(
        {"user_id": user["id"], "kind": kind, "status": "paid"},
        sort=[("paid_at", -1)]
    )
    if not purchase:
        raise HTTPException(
            status_code=402,
            detail={
                "detail": "Paiement requis. 10 000 FCFA pour ce certificat authentifié.",
                "purchase_required": True,
                "amount_xaf": 10000,
            }
        )

    purchase_id = purchase["id"]
    verification_code = f"HODIX-{user['id'][:8].upper()}-{purchase_id[:6].upper()}"

    score = await compute_trust_score(user["id"])
    pipeline = [{"$match": {"user_id": user["id"], "kind": "deposit"}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}]
    d = await db.savings_transactions.aggregate(pipeline).to_list(1)
    deposits = d[0] if d else {"total": 0, "count": 0}

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    if kind == "identity":
        goals_count = await db.savings_goals.count_documents({"user_id": user["id"]})
        _draw_certified_certificate(
            c,
            "Certificat d'Identité Financière",
            "Profil financier vérifié — Hodix",
            user["full_name"],
            [
                f"Score de confiance Hodix : {score['score']:.1f}/100 ({score['level']})",
                f"Total épargné : {deposits['total']:,.0f} XAF sur {deposits['count']} dépôts",
                f"Ancienneté du compte : {score['stats']['account_age_days']} jours",
                f"Participation groupes : {score['stats']['tontines'] + score['stats']['associations'] + score['stats']['cooperatives']} groupe(s)",
            ],
            "Atteste l'historique financier et la fiabilité communautaire du porteur.",
            verification_code,
        )
        filename = f"hodix-certifie-identite-{user['id'][:8]}.pdf"

    elif kind == "trust-score":
        _draw_certified_certificate(
            c,
            "Certificat Trust Score Hodix",
            f"Catégorie : {score['level']} — Risque : {score['risk']}",
            user["full_name"],
            [
                f"Score actuel : {score['score']:.1f} / 100",
                f"Consistance : {score['components']['consistency']:.1f}",
                f"Volume d'épargne : {score['components']['volume']:.1f}",
                f"Participation : {score['components']['participation']:.1f}",
                f"Fiabilité : {score['components']['reliability']:.1f}",
            ],
            "Score basé sur l'historique d'épargne et de contribution communautaire.",
            verification_code,
        )
        filename = f"hodix-certifie-trust-{user['id'][:8]}.pdf"

    else:  # savings
        goals_count = await db.savings_goals.count_documents({"user_id": user["id"]})
        _draw_certified_certificate(
            c,
            "Certificat d'Épargne",
            "Historique d'épargne personnelle",
            user["full_name"],
            [
                f"Total épargné : {deposits['total']:,.0f} XAF",
                f"Nombre de dépôts : {deposits['count']}",
                f"Objectifs créés : {goals_count}",
            ],
            "Atteste l'engagement d'épargne du porteur sur la plateforme Hodix.",
            verification_code,
        )
        filename = f"hodix-certifie-savings-{user['id'][:8]}.pdf"

    return _build_pdf_b64(c, buf, filename)


# ===================== ADMIN PANEL =====================
admin_router = APIRouter(prefix="/admin", tags=["admin"])


@admin_router.get("/analytics")
async def admin_analytics(_admin=Depends(require_super_admin)):
    db = get_db()
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    users_total = await db.users.count_documents({})
    active_users = await db.users.count_documents({"is_active": True})
    new_users_7d = await db.users.count_documents({"created_at": {"$gte": seven_days_ago}})
    new_users_30d = await db.users.count_documents({"created_at": {"$gte": thirty_days_ago}})

    deposits_agg = await db.savings_transactions.aggregate([
        {"$match": {"kind": "deposit"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]).to_list(1)
    total_savings = deposits_agg[0]["total"] if deposits_agg else 0
    deposits_count = deposits_agg[0]["count"] if deposits_agg else 0

    contribs_agg = await db.tontine_contributions.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]).to_list(1)
    total_contribs = contribs_agg[0]["total"] if contribs_agg else 0
    contribs_count = contribs_agg[0]["count"] if contribs_agg else 0

    funds_agg = await db.community_funds.aggregate([
        {"$group": {"_id": None, "balance": {"$sum": "$current_balance"}, "collected": {"$sum": "$total_collected"}}}
    ]).to_list(1)
    funds_balance = funds_agg[0]["balance"] if funds_agg else 0
    funds_collected = funds_agg[0]["collected"] if funds_agg else 0

    payments_agg = await db.payments.aggregate([
        {"$match": {"status": "succeeded"}},
        {"$group": {"_id": None, "minor": {"$sum": "$amount_minor"}, "commission": {"$sum": "$commission_minor"}, "count": {"$sum": 1}}}
    ]).to_list(1)
    payments_minor = payments_agg[0]["minor"] if payments_agg else 0
    commission_minor = payments_agg[0]["commission"] if payments_agg else 0
    payments_count = payments_agg[0]["count"] if payments_agg else 0

    tontines = await db.tontines.count_documents({})
    tontines_active = await db.tontines.count_documents({"is_active": True})
    associations = await db.associations.count_documents({})
    cooperatives = await db.cooperatives.count_documents({})
    funds_count = await db.community_funds.count_documents({})

    # Trust Score distribution (recompute from current store)
    scores = await db.trust_scores.find({}, {"_id": 0, "score": 1}).to_list(10000)
    dist = {"excellent": 0, "very_good": 0, "good": 0, "emerging": 0, "new": 0}
    score_sum = 0.0
    for s in scores:
        sc = s["score"]
        score_sum += sc
        if sc >= 80: dist["excellent"] += 1
        elif sc >= 60: dist["very_good"] += 1
        elif sc >= 40: dist["good"] += 1
        elif sc >= 20: dist["emerging"] += 1
        else: dist["new"] += 1
    avg_trust_score = round(score_sum / len(scores), 1) if scores else 0.0

    # Identity tier distribution from identity_events aggregate
    tier_dist = {"bronze": 0, "silver": 0, "gold": 0, "platinum": 0}
    events_agg = await db.identity_events.aggregate([
        {"$group": {"_id": "$user_id", "total": {"$sum": "$points_delta"}}}
    ]).to_list(10000)
    for r in events_agg:
        pts = max(0, r["total"])
        if pts >= 81: tier_dist["platinum"] += 1
        elif pts >= 61: tier_dist["gold"] += 1
        elif pts >= 31: tier_dist["silver"] += 1
        else: tier_dist["bronze"] += 1
    # Users without events are bronze by default
    users_with_events = len(events_agg)
    tier_dist["bronze"] += max(0, users_total - users_with_events)

    # KYC stats
    kyc_l1 = await db.kyc_records.count_documents({"level": {"$gte": 1}})
    kyc_l2 = await db.kyc_records.count_documents({"level": 2, "status": "approved"})
    kyc_pending = await db.kyc_records.count_documents({"status": "pending_review"})

    return {
        "users": {
            "total": users_total,
            "active": active_users,
            "new_7d": new_users_7d,
            "new_30d": new_users_30d,
        },
        "savings_volume": total_savings,
        "savings_count": deposits_count,
        "tontine_contributions_volume": total_contribs,
        "tontine_contributions_count": contribs_count,
        "funds": {
            "count": funds_count,
            "balance": funds_balance,
            "collected": funds_collected,
        },
        "payments": {
            "count": payments_count,
            "amount_minor": payments_minor,
            "commission_minor": commission_minor,
            "currency": os.environ.get("STRIPE_CURRENCY", "usd"),
        },
        "active_groups": {
            "tontines": tontines,
            "tontines_active": tontines_active,
            "associations": associations,
            "cooperatives": cooperatives,
        },
        "score_distribution": dist,
        "avg_trust_score": avg_trust_score,
        "tier_distribution": tier_dist,
        "kyc": {
            "level1": kyc_l1,
            "level2_approved": kyc_l2,
            "pending_review": kyc_pending,
        },
    }


@admin_router.get("/users")
async def admin_users(_admin=Depends(require_super_admin)):
    db = get_db()
    users = await db.users.find({}, {"_id": 0, "hashed_password": 0}).sort("created_at", -1).to_list(500)
    return users


@admin_router.get("/audit-logs")
async def admin_audit(_admin=Depends(require_super_admin)):
    db = get_db()
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return logs


@admin_router.get("/certificate-purchases")
async def admin_certificate_purchases(_admin=Depends(require_super_admin)):
    db = get_db()
    purchases = await db.certificate_purchases.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich with user email
    for p in purchases:
        u = await db.users.find_one({"id": p["user_id"]}, {"email": 1})
        p["user_email"] = u["email"] if u else None
    return purchases


@admin_router.patch("/users/{user_id}")
async def admin_update_user(user_id: str, payload: dict, _admin=Depends(require_super_admin)):
    db = get_db()
    allowed = {k: v for k, v in payload.items() if k in {"role", "is_active"}}
    if not allowed:
        raise HTTPException(400, "Aucun champ à mettre à jour.")
    res = await db.users.update_one({"id": user_id}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(404, "Utilisateur introuvable.")
    return {"detail": "ok"}
