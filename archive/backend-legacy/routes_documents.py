"""
Document generation service — PDF + QR + signed download URLs.

Supported document types:
  tontine_certificate   — membership & participation certificate
  contribution_receipt  — single contribution receipt
  tontine_disbursement  — disbursement receipt (beneficiary)
  savings_summary       — personal savings summary
  trust_score           — trust-score certificate

Flow:
  POST /documents/generate  →  generate PDF, store in DB, return {doc_id, url, expires_at}
  GET  /documents/           →  list the user's documents
  GET  /documents/{id}/download?token=<jwt>  →  stream PDF (no Bearer needed)
  GET  /documents/{id}/verify                →  public metadata (unauthenticated)
"""
import base64
import io
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from db import get_db
from deps import get_current_user
from models import gen_id, now_utc
from trust_score import compute_trust_score

router = APIRouter(prefix="/documents", tags=["documents"])

_JWT_SECRET = os.environ["JWT_SECRET_KEY"]
_ALGO = "HS256"
_DOWNLOAD_EXPIRE_MIN = 15
_VERIFY_BASE_URL = os.environ.get("APP_PUBLIC_URL", "https://hodix.app")


# ─── JWT helpers ──────────────────────────────────────────────────────────────

def _create_download_token(user_id: str, doc_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "doc_id": doc_id,
        "type": "doc_download",
        "iat": now,
        "exp": now + timedelta(minutes=_DOWNLOAD_EXPIRE_MIN),
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm=_ALGO)


def _verify_download_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _JWT_SECRET, algorithms=[_ALGO])
    except JWTError:
        return None


# ─── QR code helper ───────────────────────────────────────────────────────────

def _make_qr_image(url: str) -> io.BytesIO:
    qr = qrcode.QRCode(
        version=3,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0B1F3A", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


# ─── PDF rendering ────────────────────────────────────────────────────────────

def _draw_base(
    c: canvas.Canvas,
    title: str,
    subtitle: str,
    user_name: str,
    body_lines: list[str],
    footer: str,
):
    width, height = A4

    # ── Header bar ──
    c.setFillColor(colors.HexColor("#0B1F3A"))
    c.rect(0, height - 4 * cm, width, 4 * cm, fill=1, stroke=0)

    # Logo block
    c.setFillColor(colors.HexColor("#10B981"))
    c.rect(2 * cm, height - 3.3 * cm, 2.5 * cm, 2.5 * cm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(2.7 * cm, height - 2.3 * cm, "HX")

    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(5.2 * cm, height - 2.0 * cm, "HODIX")
    c.setFont("Helvetica", 11)
    c.drawString(5.2 * cm, height - 2.7 * cm, "Building Trust Together")

    # ── Title ──
    c.setFillColor(colors.HexColor("#0B1F3A"))
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(width / 2, height - 6 * cm, title)

    c.setFillColor(colors.HexColor("#1D4ED8"))
    c.setFont("Helvetica-Oblique", 13)
    c.drawCentredString(width / 2, height - 6.8 * cm, subtitle)

    c.setStrokeColor(colors.HexColor("#10B981"))
    c.setLineWidth(2)
    c.line(5 * cm, height - 7.3 * cm, width - 5 * cm, height - 7.3 * cm)

    # ── Recipient ──
    c.setFillColor(colors.HexColor("#0F172A"))
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 8.4 * cm, "Délivré à")
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(width / 2, height - 9.4 * cm, user_name)

    # ── Body lines ──
    y = height - 11 * cm
    c.setFont("Helvetica", 12)
    c.setFillColor(colors.HexColor("#0F172A"))
    for line in body_lines:
        c.drawCentredString(width / 2, y, line)
        y -= 0.8 * cm

    # ── Footer ──
    c.setFont("Helvetica-Oblique", 10)
    c.setFillColor(colors.HexColor("#64748B"))
    c.drawCentredString(width / 2, 3 * cm, footer)
    c.setFont("Helvetica", 9)
    c.drawCentredString(width / 2, 2.3 * cm, "Ce document constitue une attestation officielle Hodix.")
    c.drawCentredString(width / 2, 1.8 * cm,
                        datetime.now(timezone.utc).strftime("Émis le %d/%m/%Y à %H:%M UTC"))


def _draw_certified(
    c: canvas.Canvas,
    title: str,
    subtitle: str,
    user_name: str,
    body_lines: list[str],
    footer: str,
    verification_code: str,
    doc_id: str,
):
    """Full certified document: base layout + watermark + stamp + real QR code."""
    width, height = A4

    _draw_base(c, title, subtitle, user_name, body_lines, footer)

    # ── Diagonal watermark ──
    c.saveState()
    c.setFillColor(colors.HexColor("#DDDDDD"))
    c.setFont("Helvetica-Bold", 40)
    c.translate(width / 2, height / 2)
    c.rotate(45)
    c.drawCentredString(0, 0, "CERTIFIÉ AUTHENTIQUE")
    c.restoreState()

    # ── Official stamp circle (bottom right) ──
    stamp_cx = width - 4 * cm
    stamp_cy = 4.5 * cm
    stamp_r = 1.8 * cm
    c.setFillColor(colors.HexColor("#0B1F3A"))
    c.circle(stamp_cx, stamp_cy, stamp_r, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(stamp_cx, stamp_cy + 0.3 * cm, "HODIX")
    c.setFont("Helvetica", 6)
    c.drawCentredString(stamp_cx, stamp_cy - 0.1 * cm, "OFFICIEL")
    c.setStrokeColor(colors.HexColor("#10B981"))
    c.setLineWidth(1.5)
    c.circle(stamp_cx, stamp_cy, stamp_r - 0.15 * cm, fill=0, stroke=1)

    # ── Timestamp signature line ──
    signed_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    c.setFillColor(colors.HexColor("#0B1F3A"))
    c.setFont("Helvetica-Bold", 8)
    c.drawString(2 * cm, 7.8 * cm, f"Horodatage : {signed_at}")
    c.setFont("Helvetica", 8)
    c.drawString(2 * cm, 7.3 * cm, f"Code : {verification_code}")
    c.drawString(2 * cm, 6.9 * cm, f"ID document : {doc_id}")

    # ── Real QR code ──
    verify_url = f"{_VERIFY_BASE_URL}/verify/{doc_id}"
    qr_buf = _make_qr_image(verify_url)
    qr_size = 2.8 * cm
    qr_x = 2 * cm
    qr_y = 4.0 * cm
    c.drawImage(ImageReader(qr_buf), qr_x, qr_y, qr_size, qr_size,
                preserveAspectRatio=True, mask="auto")
    c.setFillColor(colors.HexColor("#64748B"))
    c.setFont("Helvetica", 6)
    c.drawCentredString(qr_x + qr_size / 2, qr_y - 0.25 * cm, "Scanner pour vérifier")


def _finalise(c: canvas.Canvas, buf: io.BytesIO) -> bytes:
    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()


# ─── PDF builders per document type ──────────────────────────────────────────

async def _build_tontine_certificate(db, user: dict, tontine_id: str, doc_id: str, verification_code: str) -> bytes:
    tontine = await db.tontines.find_one({"id": tontine_id}, {"_id": 0})
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")

    member = await db.tontine_members.find_one(
        {"tontine_id": tontine_id, "user_id": user["id"]}, {"_id": 0}
    )
    if not member:
        raise HTTPException(403, "Vous n'êtes pas membre de cette tontine.")

    total_paid = 0
    contribs = await db.tontine_contributions.find(
        {"tontine_id": tontine_id, "user_id": user["id"]}, {"_id": 0}
    ).to_list(500)
    total_paid = sum(c.get("amount", 0) for c in contribs)
    cycles_paid = len(contribs)
    joined_at = member.get("joined_at", tontine.get("created_at", ""))
    if hasattr(joined_at, "strftime"):
        joined_str = joined_at.strftime("%d/%m/%Y")
    else:
        joined_str = str(joined_at)[:10]

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certified(
        c,
        "Certificat de Participation Tontine",
        f"Groupe : {tontine['name']}",
        user["full_name"],
        [
            f"Tontine : {tontine['name']}",
            f"Fréquence : {tontine.get('frequency', 'mensuelle').capitalize()}",
            f"Cotisation unitaire : {tontine.get('contribution_amount', 0):,.0f} XAF",
            f"Cycles cotisés : {cycles_paid} — Total versé : {total_paid:,.0f} XAF",
            f"Membre depuis : {joined_str}",
            f"Statut : {'Actif' if tontine.get('is_active') else 'Clôturé'}",
        ],
        "Atteste la participation active du porteur dans cette tontine Hodix.",
        verification_code,
        doc_id,
    )
    return _finalise(c, buf)


async def _build_contribution_receipt(db, user: dict, contribution_id: str, doc_id: str, verification_code: str) -> bytes:
    contrib = await db.tontine_contributions.find_one({"id": contribution_id}, {"_id": 0})
    if not contrib or contrib["user_id"] != user["id"]:
        raise HTTPException(404, "Contribution introuvable.")

    tontine = await db.tontines.find_one({"id": contrib["tontine_id"]}, {"_id": 0}) or {}
    paid_at = contrib.get("paid_at", contrib.get("created_at", ""))
    if hasattr(paid_at, "strftime"):
        paid_str = paid_at.strftime("%d/%m/%Y à %H:%M UTC")
    else:
        paid_str = str(paid_at)[:19].replace("T", " ")

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certified(
        c,
        "Reçu de Cotisation",
        f"Tontine : {tontine.get('name', contrib['tontine_id'][:8])}",
        user["full_name"],
        [
            f"Montant versé : {contrib.get('amount', 0):,.0f} XAF",
            f"Cycle n° : {contrib.get('cycle', '—')}",
            f"Date de paiement : {paid_str}",
            f"Mode : {contrib.get('payment_method', 'Hodix')}",
            f"Référence : {contribution_id[:16].upper()}",
        ],
        "Ce reçu confirme la cotisation enregistrée sur la plateforme Hodix.",
        verification_code,
        doc_id,
    )
    return _finalise(c, buf)


async def _build_disbursement_receipt(db, user: dict, disbursement_id: str, doc_id: str, verification_code: str) -> bytes:
    disb = await db.tontine_disbursements.find_one({"id": disbursement_id}, {"_id": 0})
    if not disb:
        raise HTTPException(404, "Décaissement introuvable.")

    tontine = await db.tontines.find_one({"id": disb["tontine_id"]}, {"_id": 0}) or {}
    beneficiary = await db.users.find_one({"id": disb.get("beneficiary_id", user["id"])}, {"_id": 0, "full_name": 1}) or {}
    disb_at = disb.get("disbursed_at", disb.get("created_at", ""))
    if hasattr(disb_at, "strftime"):
        disb_str = disb_at.strftime("%d/%m/%Y à %H:%M UTC")
    else:
        disb_str = str(disb_at)[:19].replace("T", " ")

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certified(
        c,
        "Attestation de Décaissement",
        f"Tontine : {tontine.get('name', disb['tontine_id'][:8])}",
        user["full_name"],
        [
            f"Bénéficiaire : {beneficiary.get('full_name', '—')}",
            f"Montant décaissé : {disb.get('amount', 0):,.0f} XAF",
            f"Cycle n° : {disb.get('cycle', '—')}",
            f"Date : {disb_str}",
            f"Note : {disb.get('note', '—')}",
            f"Référence : {disbursement_id[:16].upper()}",
        ],
        "Ce document atteste le décaissement officiel enregistré sur Hodix.",
        verification_code,
        doc_id,
    )
    return _finalise(c, buf)


async def _build_savings_summary(db, user: dict, doc_id: str, verification_code: str) -> bytes:
    pipeline = [
        {"$match": {"user_id": user["id"], "kind": "deposit"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    d = await db.savings_transactions.aggregate(pipeline).to_list(1)
    dep = d[0] if d else {"total": 0, "count": 0}
    goals_count = await db.savings_goals.count_documents({"user_id": user["id"]})
    goals = await db.savings_goals.find({"user_id": user["id"]}, {"_id": 0}).to_list(10)
    active = sum(1 for g in goals if g.get("status") != "completed")

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certified(
        c,
        "Relevé d'Épargne Personnel",
        "Historique d'épargne vérifiée — Hodix",
        user["full_name"],
        [
            f"Total épargné : {dep['total']:,.0f} XAF",
            f"Nombre de dépôts : {dep['count']}",
            f"Objectifs créés : {goals_count} ({active} actif{'s' if active > 1 else ''})",
        ],
        "Ce relevé atteste l'engagement d'épargne du porteur sur la plateforme Hodix.",
        verification_code,
        doc_id,
    )
    return _finalise(c, buf)


async def _build_trust_score(db, user: dict, doc_id: str, verification_code: str) -> bytes:
    score = await compute_trust_score(user["id"])
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_certified(
        c,
        "Certificat Trust Score Hodix",
        f"Catégorie : {score['level']} — Risque : {score['risk']}",
        user["full_name"],
        [
            f"Score : {score['score']:.1f} / 100",
            f"Consistance : {score['components']['consistency']:.1f}",
            f"Volume : {score['components']['volume']:.1f}",
            f"Participation : {score['components']['participation']:.1f}",
            f"Fiabilité : {score['components']['reliability']:.1f}",
        ],
        "Score calculé à partir de l'historique d'épargne et de contribution.",
        verification_code,
        doc_id,
    )
    return _finalise(c, buf)


# ─── Route schemas ─────────────────────────────────────────────────────────────

DocKind = Literal[
    "tontine_certificate",
    "contribution_receipt",
    "tontine_disbursement",
    "savings_summary",
    "trust_score",
]

_KIND_LABELS: dict[str, str] = {
    "tontine_certificate": "Certificat de participation tontine",
    "contribution_receipt": "Reçu de cotisation",
    "tontine_disbursement": "Attestation de décaissement",
    "savings_summary": "Relevé d'épargne",
    "trust_score": "Certificat Trust Score",
}

_KIND_FILENAMES: dict[str, str] = {
    "tontine_certificate": "hodix-certificat-tontine",
    "contribution_receipt": "hodix-recu-cotisation",
    "tontine_disbursement": "hodix-attestation-decaissement",
    "savings_summary": "hodix-releve-epargne",
    "trust_score": "hodix-trust-score",
}


class GeneratePayload(BaseModel):
    kind: DocKind
    ref_id: Optional[str] = None   # tontine_id / contribution_id / disbursement_id


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_document(payload: GeneratePayload, user=Depends(get_current_user)):
    """Generate a certified PDF, store it, and return a short-lived signed download URL."""
    db = get_db()
    doc_id = gen_id()
    verification_code = secrets.token_hex(8).upper()

    # Build the PDF bytes
    pdf_bytes: bytes
    if payload.kind == "tontine_certificate":
        if not payload.ref_id:
            raise HTTPException(400, "ref_id (tontine_id) requis.")
        pdf_bytes = await _build_tontine_certificate(db, user, payload.ref_id, doc_id, verification_code)
    elif payload.kind == "contribution_receipt":
        if not payload.ref_id:
            raise HTTPException(400, "ref_id (contribution_id) requis.")
        pdf_bytes = await _build_contribution_receipt(db, user, payload.ref_id, doc_id, verification_code)
    elif payload.kind == "tontine_disbursement":
        if not payload.ref_id:
            raise HTTPException(400, "ref_id (disbursement_id) requis.")
        pdf_bytes = await _build_disbursement_receipt(db, user, payload.ref_id, doc_id, verification_code)
    elif payload.kind == "savings_summary":
        pdf_bytes = await _build_savings_summary(db, user, doc_id, verification_code)
    else:  # trust_score
        pdf_bytes = await _build_trust_score(db, user, doc_id, verification_code)

    filename = f"{_KIND_FILENAMES[payload.kind]}-{user['id'][:8]}.pdf"
    now = now_utc()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_DOWNLOAD_EXPIRE_MIN)

    # Store in MongoDB (base64 to keep it BSON-safe)
    await db.documents.insert_one({
        "id": doc_id,
        "user_id": user["id"],
        "kind": payload.kind,
        "ref_id": payload.ref_id,
        "filename": filename,
        "label": _KIND_LABELS[payload.kind],
        "verification_code": verification_code,
        "pdf_b64": base64.b64encode(pdf_bytes).decode("ascii"),
        "size_bytes": len(pdf_bytes),
        "created_at": now,
    })

    token = _create_download_token(user["id"], doc_id)
    download_url = f"/api/documents/{doc_id}/download?token={token}"

    return {
        "doc_id": doc_id,
        "kind": payload.kind,
        "filename": filename,
        "label": _KIND_LABELS[payload.kind],
        "download_url": download_url,
        "expires_at": expires_at.isoformat(),
        "verification_code": verification_code,
        "verify_url": f"{_VERIFY_BASE_URL}/verify/{doc_id}",
    }


@router.get("")
async def list_documents(user=Depends(get_current_user)):
    """List all documents generated by the current user."""
    db = get_db()
    items = await db.documents.find(
        {"user_id": user["id"]},
        {"_id": 0, "pdf_b64": 0},  # exclude heavy field
    ).sort("created_at", -1).to_list(50)
    return {"items": items}


@router.get("/{doc_id}/download")
async def download_document(doc_id: str, token: str = Query(...)):
    """Stream the PDF. Token is a short-lived JWT (15 min)."""
    claims = _verify_download_token(token)
    if not claims or claims.get("doc_id") != doc_id or claims.get("type") != "doc_download":
        raise HTTPException(401, "Lien de téléchargement invalide ou expiré.")

    db = get_db()
    doc = await db.documents.find_one({"id": doc_id, "user_id": claims["sub"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document introuvable.")

    pdf_bytes = base64.b64decode(doc["pdf_b64"])
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{doc["filename"]}"'},
    )


@router.get("/{doc_id}/verify")
async def verify_document(doc_id: str):
    """Public endpoint — returns document metadata for QR verification (no auth)."""
    db = get_db()
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0, "pdf_b64": 0})
    if not doc:
        raise HTTPException(404, "Document introuvable ou supprimé.")
    return {
        "valid": True,
        "doc_id": doc_id,
        "kind": doc["kind"],
        "label": doc["label"],
        "filename": doc["filename"],
        "verification_code": doc["verification_code"],
        "issued_at": doc["created_at"],
    }


@router.post("/{doc_id}/refresh-url")
async def refresh_download_url(doc_id: str, user=Depends(get_current_user)):
    """Re-issue a fresh 15-minute download token for an existing document."""
    db = get_db()
    doc = await db.documents.find_one({"id": doc_id, "user_id": user["id"]}, {"_id": 0, "pdf_b64": 0})
    if not doc:
        raise HTTPException(404, "Document introuvable.")

    token = _create_download_token(user["id"], doc_id)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_DOWNLOAD_EXPIRE_MIN)
    return {
        "download_url": f"/api/documents/{doc_id}/download?token={token}",
        "expires_at": expires_at.isoformat(),
    }
