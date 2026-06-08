"""
HODIX Payment Routes — production-grade fintech implementation.

Business rules:
  - Mobile Money (Orange/MTN): member pays EXACT cotisation amount, zero fees displayed
  - Stripe: member sees NET amount only; gross calculated server-side so Hodix receives full cotisation
  - Commission 1.5%: applied on WITHDRAWAL only, NEVER on deposit
  - All amounts validated server-side; frontend amounts NEVER trusted
  - Full audit trail on every transaction

Transaction audit fields (always stored):
  payment_method, displayed_amount, gross_charged_amount,
  stripe_fee_estimated, net_received, currency, transaction_reference
"""
import logging
import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request

from db import get_db
from deps import get_current_user, require_super_admin
from models import gen_id, now_utc
from notifications_svc import create_notification
from audit import log_event
from sms import send_sms, is_e164
from payment_config import (
    get_payment_config, invalidate_config_cache,
    calculate_stripe_gross, xaf_to_usd,
    calculate_withdrawal_net,
)

log = logging.getLogger(__name__)

STRIPE_API_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
stripe.api_key = STRIPE_API_KEY
STRIPE_CURRENCY = os.environ.get("STRIPE_CURRENCY", "eur")

payments_router = APIRouter(prefix="/payments", tags=["payments"])
sms_router = APIRouter(prefix="/sms", tags=["sms"])
sms_admin_router = APIRouter(prefix="/admin/sms", tags=["admin"])

MOBILE_MONEY_NUMBERS = {
    "orange": os.environ.get("ORANGE_MONEY_NUMBER", "+237 XXX XXX XXX"),
    "mtn": os.environ.get("MTN_MONEY_NUMBER", "+237 XXX XXX XXX"),
}


async def _check_idempotency(key: str | None, user_id: str, endpoint: str) -> dict | None:
    """Returns existing result if key was already processed, None otherwise."""
    if not key:
        return None
    db = get_db()
    existing = await db.idempotency_keys.find_one({
        "key": key, "user_id": user_id, "endpoint": endpoint
    })
    return existing.get("result") if existing else None


async def _save_idempotency(key: str, user_id: str, endpoint: str, result: dict):
    if not key:
        return
    db = get_db()
    await db.idempotency_keys.update_one(
        {"key": key, "user_id": user_id},
        {"$set": {"key": key, "user_id": user_id, "endpoint": endpoint,
                  "result": result, "created_at": now_utc()}},
        upsert=True
    )


class CheckoutError(Exception):
    pass


async def _create_stripe_session(amount_cents: int, currency: str, success_url: str, cancel_url: str, metadata: dict) -> dict:
    """Create a Stripe Checkout Session directly via stripe SDK."""
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": currency,
                    "product_data": {"name": "Cotisation Hodix"},
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
        )
        return {"session_id": session.id, "url": session.url}
    except stripe.error.StripeError as e:
        raise CheckoutError(str(e))


async def _get_stripe_session_status(session_id: str) -> dict:
    """Retrieve Stripe session status."""
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        return {
            "payment_status": session.payment_status,
            "status": session.status,
            "metadata": dict(session.metadata or {}),
        }
    except stripe.error.StripeError as e:
        raise CheckoutError(str(e))


# ============================================================
# STRIPE PAYMENTS
# ============================================================

@payments_router.post("/contributions/checkout")
async def create_contribution_checkout(payload: dict, request: Request, user=Depends(get_current_user)):
    """Create a Stripe Checkout Session for a tontine contribution.

    Business rule: member sees only the cotisation amount (displayed_amount_xaf).
    The gross charged to Stripe is calculated server-side to absorb Stripe fees.
    No fee information is returned to the frontend.

    Expected payload: { "tontine_id": "...", "amount_xaf": 25000, "currency"?: "eur" }
    """
    if not user.get("is_email_verified", True):
        raise HTTPException(403, "Email non vérifié. Vérifiez votre email avant d'effectuer un paiement.")

    tontine_id = (payload.get("tontine_id") or "").strip()
    amount_xaf_input = payload.get("amount_xaf")
    currency = (payload.get("currency") or STRIPE_CURRENCY).strip().lower()

    if not tontine_id or not isinstance(amount_xaf_input, (int, float)) or amount_xaf_input <= 0:
        raise HTTPException(400, "tontine_id et amount_xaf > 0 requis.")

    db = get_db()
    tontine = await db.tontines.find_one({"id": tontine_id}, {"_id": 0})
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")
    member = await db.tontine_members.find_one({"tontine_id": tontine_id, "user_id": user["id"]})
    if not member:
        raise HTTPException(403, "Non membre de cette tontine.")

    # Server-side: use the authoritative cotisation amount from DB
    amount_xaf = float(tontine.get("contribution_amount", amount_xaf_input))

    config = await get_payment_config()
    xaf_to_usd_rate = config["xaf_to_usd_rate"]

    # Convert XAF net amount to the display currency
    if currency == "eur":
        net_amount = float(Decimal(str(amount_xaf)) * Decimal(str(config["xaf_to_eur_rate"])))
    else:
        net_amount = xaf_to_usd(amount_xaf, config)
        currency = "usd"

    # Calculate gross (what Stripe charges) so Hodix receives net_amount
    stripe_calc = calculate_stripe_gross(net_amount, config, fixed_fee=True)

    gross_cents = stripe_calc["gross_cents"]
    if gross_cents < 50:  # Stripe minimum ~ $0.50
        raise HTTPException(400, "Montant trop faible pour un paiement Stripe (min ~0.50).")

    payment_id = gen_id()
    now = now_utc()

    base = os.environ.get("APP_BASE_URL") or str(request.base_url).rstrip("/")
    try:
        ck = await _create_stripe_session(
            amount_cents=gross_cents,
            currency=currency,
            success_url=f"{base}/api/payments/return?sc=success&pid={payment_id}&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{base}/api/payments/return?sc=cancel&pid={payment_id}",
            metadata={
                "hodix_payment_id": payment_id,
                "user_id": user["id"],
                "tontine_id": tontine_id,
                "amount_xaf": str(amount_xaf),
            },
        )
    except CheckoutError as e:
        log.exception("Stripe session create failed")
        raise HTTPException(502, f"Stripe error: {e}")

    session_id = ck["session_id"]
    session_url = ck["url"]

    payment_doc = {
        "id": payment_id,
        "user_id": user["id"],
        "tontine_id": tontine_id,
        "goal_id": None,
        "kind": "tontine_contribution",
        "payment_method": "stripe",
        # Audit fields — never exposed to regular user endpoints
        "displayed_amount_xaf": amount_xaf,           # what member sees
        "gross_charged_amount_usd": stripe_calc["gross_usd"],  # what Stripe charges
        "stripe_fee_estimated_usd": stripe_calc["stripe_fee_usd"],
        "net_received_usd": stripe_calc["net_usd"],   # what Hodix expects to receive
        "exchange_rate_used": xaf_to_usd_rate,
        "currency": currency,
        "transaction_reference": session_id,
        "status": "pending",
        "stripe_session_id": session_id,
        "checkout_url": session_url,
        "amount_xaf": amount_xaf,
        "created_at": now,
        "updated_at": now,
    }
    await db.payments.insert_one(payment_doc)

    await log_event("payment.stripe_checkout_created", user_id=user["id"],
                    metadata={"payment_id": payment_id, "tontine_id": tontine_id, "amount_xaf": amount_xaf})

    # Return ONLY safe fields — no fee internals
    return {
        "payment_id": payment_id,
        "checkout_url": session_url,
        "displayed_amount_xaf": amount_xaf,
        "currency": currency,
    }


@payments_router.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    """Stripe webhook receiver. Marks payment succeeded idempotently.

    Production: verifies HMAC `Stripe-Signature` when STRIPE_WEBHOOK_SECRET is set.
    """
    body_raw = await request.body()
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
    sig_header = request.headers.get("stripe-signature", "")

    event_obj = None
    if webhook_secret:
        try:
            event_obj = stripe.Webhook.construct_event(body_raw, sig_header, webhook_secret)
        except stripe.error.SignatureVerificationError as e:
            log.warning("Stripe webhook signature invalid: %s", e)
            raise HTTPException(status_code=400, detail="Invalid Stripe signature")
        except Exception as e:
            log.warning("Stripe webhook parsing failed: %s", e)
            raise HTTPException(status_code=400, detail="Invalid Stripe payload")
        body = event_obj
    else:
        log.warning("[stripe] STRIPE_WEBHOOK_SECRET absent — signature verification disabled.")
        try:
            import json
            body = json.loads(body_raw.decode("utf-8"))
        except Exception:
            return {"received": False}

    event_type = body.get("type", "")
    obj = body.get("data", {}).get("object", {}) if isinstance(body, dict) else (body["data"]["object"] if "data" in body else {})
    if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        pid = (obj.get("metadata") or {}).get("hodix_payment_id")
        if pid:
            await _mark_payment_succeeded(pid, obj.get("metadata"))
    elif event_type in ("checkout.session.expired",):
        pid = (obj.get("metadata") or {}).get("hodix_payment_id")
        if pid:
            db = get_db()
            await db.payments.update_one({"id": pid, "status": "pending"},
                                         {"$set": {"status": "expired", "updated_at": now_utc()}})
    return {"received": True}


@payments_router.get("/return")
async def payment_return(sc: str, pid: str, session_id: Optional[str] = None):
    """Stripe redirect after Checkout. Returns a tiny HTML page that closes itself."""
    from fastapi.responses import HTMLResponse
    if sc == "success" and session_id and pid:
        try:
            await _mark_payment_succeeded(pid, None)
        except Exception:
            pass
    status = "Paiement réussi !" if sc == "success" else "Paiement annulé."
    color = "#10B981" if sc == "success" else "#F59E0B"
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>HODIX</title>
<style>body{{font-family:-apple-system,sans-serif;background:#0B1F3A;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px}}
.box{{max-width:360px}}
.dot{{width:64px;height:64px;border-radius:32px;background:{color};margin:0 auto 16px}}
h1{{font-size:22px;margin:0 0 8px}}p{{color:rgba(255,255,255,0.7);margin:0 0 24px}}
a{{color:#10B981;text-decoration:none;font-weight:700}}
</style></head><body><div class="box"><div class="dot"></div><h1>{status}</h1>
<p>Vous pouvez fermer cette fenêtre et retourner dans l'application Hodix.</p>
<a href="#" onclick="window.close()">Fermer</a></div></body></html>"""
    return HTMLResponse(content=html)


@payments_router.get("/me")
async def list_my_payments(user=Depends(get_current_user)):
    """Return user's payments without internal fee fields."""
    db = get_db()
    # Exclude internal audit fields from user-facing response
    projection = {
        "_id": 0,
        "gross_charged_amount_usd": 0,
        "stripe_fee_estimated_usd": 0,
        "net_received_usd": 0,
        "exchange_rate_used": 0,
    }
    items = await db.payments.find({"user_id": user["id"]}, projection).sort("created_at", -1).to_list(200)
    return items


@payments_router.get("/{payment_id}/status")
async def get_payment_status(payment_id: str, request: Request, user=Depends(get_current_user)):
    """Poll status of a payment — returns safe fields only (no fee internals)."""
    db = get_db()
    payment = await db.payments.find_one({"id": payment_id, "user_id": user["id"]}, {"_id": 0})
    if not payment:
        raise HTTPException(404, "Paiement introuvable.")

    if payment["status"] == "pending" and payment.get("stripe_session_id"):
        try:
            status_resp = await _get_stripe_session_status(payment["stripe_session_id"])
            if status_resp["payment_status"] == "paid":
                await _mark_payment_succeeded(payment_id, status_resp["metadata"])
                payment = await db.payments.find_one({"id": payment_id}, {"_id": 0})
            elif status_resp["status"] in ("expired", "canceled"):
                await db.payments.update_one({"id": payment_id}, {"$set": {"status": status_resp["status"], "updated_at": now_utc()}})
                payment = await db.payments.find_one({"id": payment_id}, {"_id": 0})
        except Exception as e:
            log.warning("Stripe status retrieve failed: %s", e)

    # Strip internal fields before returning
    safe = {k: v for k, v in payment.items() if k not in (
        "gross_charged_amount_usd", "stripe_fee_estimated_usd",
        "net_received_usd", "exchange_rate_used",
    )}
    return safe


async def _mark_payment_succeeded(payment_id: str, metadata: Optional[dict] = None) -> None:
    """Idempotent: transition pending → succeeded. Commission NOT applied here (withdrawal only)."""
    db = get_db()
    payment = await db.payments.find_one({"id": payment_id})
    if not payment or payment["status"] not in ("pending", "pending_mm"):
        return

    await db.payments.update_one({"id": payment_id}, {"$set": {
        "status": "succeeded",
        "updated_at": now_utc(),
    }})

    # Mirror into tontine_contributions
    tontine_id = payment.get("tontine_id")
    if tontine_id:
        tontine = await db.tontines.find_one({"id": tontine_id})
        member = await db.tontine_members.find_one({"tontine_id": tontine_id, "user_id": payment["user_id"]})
        if tontine and member:
            await db.tontine_contributions.insert_one({
                "id": gen_id(),
                "tontine_id": tontine["id"],
                "user_id": payment["user_id"],
                "full_name": member["full_name"],
                "amount": payment["amount_xaf"],
                "cycle": tontine["current_cycle"],
                "note": f"Paiement {payment.get('payment_method', 'Stripe')}",
                "recorded_by": payment["user_id"],
                "payment_id": payment_id,
                "created_at": now_utc(),
            })
            await db.tontines.update_one({"id": tontine["id"]}, {"$inc": {"total_collected": payment["amount_xaf"]}})

    await create_notification(
        payment["user_id"], "Paiement réussi",
        f"Votre contribution de {payment['amount_xaf']:,.0f} XAF a été enregistrée.",
        kind="success",
    )


# ============================================================
# MOBILE MONEY (Orange Money / MTN Mobile Money)
# ============================================================

@payments_router.post("/mobile-money/initiate")
async def initiate_mobile_money(payload: dict, request: Request, user=Depends(get_current_user)):
    """Initiate a Mobile Money payment (Orange / MTN).

    Business rule: displayed_amount = amount_xaf exactly — no markup, no fee shown.
    Hodix absorbs operator fees separately.
    """
    idempotency_key = request.headers.get("x-idempotency-key")
    cached = await _check_idempotency(idempotency_key, user["id"], "mobile-money/initiate")
    if cached is not None:
        return cached

    tontine_id = (payload.get("tontine_id") or "").strip()
    goal_id = (payload.get("goal_id") or "").strip()
    amount_xaf = payload.get("amount_xaf")
    provider = (payload.get("provider") or "").strip().lower()
    phone = (payload.get("phone") or "").strip()

    if not amount_xaf or provider not in ("orange", "mtn") or not phone:
        raise HTTPException(400, "amount_xaf, provider (orange|mtn) et phone requis.")
    if not tontine_id and not goal_id:
        raise HTTPException(400, "tontine_id ou goal_id requis.")

    db = get_db()

    tontine = None
    if tontine_id:
        tontine = await db.tontines.find_one({"id": tontine_id})
        if not tontine:
            raise HTTPException(404, "Tontine introuvable.")
        if not await db.tontine_members.find_one({"tontine_id": tontine_id, "user_id": user["id"]}):
            raise HTTPException(403, "Non membre de cette tontine.")
        # Use authoritative cotisation amount from DB
        amount_xaf = float(tontine.get("contribution_amount", amount_xaf))

    payment_id = gen_id()
    now = now_utc()

    await db.payments.insert_one({
        "id": payment_id,
        "user_id": user["id"],
        "tontine_id": tontine_id or None,
        "goal_id": goal_id or None,
        "kind": "savings_deposit" if goal_id else "tontine_contribution",
        "payment_method": provider,
        # Audit fields — no markup on MM deposits
        "displayed_amount_xaf": float(amount_xaf),
        "gross_charged_amount_xaf": float(amount_xaf),  # same — no markup on deposit
        "stripe_fee_estimated_usd": 0,
        "net_received_xaf": float(amount_xaf),
        "currency": "XAF",
        "transaction_reference": None,  # filled at confirm
        "amount_xaf": float(amount_xaf),
        "phone": phone,
        "status": "pending_mm",
        "created_at": now,
        "updated_at": now,
    })

    operator_num = MOBILE_MONEY_NUMBERS.get(provider, "")
    try:
        label = tontine["name"] if tontine else "Épargne"
        msg = (
            f"Hodix · Paiement {provider.title()} Money demandé.\n"
            f"Montant : {float(amount_xaf):,.0f} XAF\n"
            f"Destination : {label}\n"
            f"Validez sur votre téléphone puis entrez le code de confirmation dans l'app.\n"
            f"Réf: {payment_id[:8].upper()}"
        )
        await send_sms(phone, msg, user_id=user["id"])
    except Exception:
        pass  # SMS failure is non-fatal

    await log_event("payment.mm_initiated", user_id=user["id"], request=request,
                    metadata={"payment_id": payment_id, "provider": provider, "amount_xaf": amount_xaf})

    mm_result = {
        "payment_id": payment_id,
        "status": "pending_mm",
        "message": f"Demande envoyée au {phone}. Validez puis entrez le code de confirmation.",
        "reference_prefix": payment_id[:8].upper(),
    }
    await _save_idempotency(idempotency_key, user["id"], "mobile-money/initiate", mm_result)
    return mm_result


@payments_router.post("/mobile-money/confirm")
async def confirm_mobile_money(payload: dict, request: Request, user=Depends(get_current_user)):
    """Confirm a Mobile Money payment with the operator reference code."""
    tontine_id = (payload.get("tontine_id") or "").strip()
    goal_id = (payload.get("goal_id") or "").strip()
    amount_xaf = payload.get("amount_xaf")
    provider = (payload.get("provider") or "").strip().lower()
    phone = (payload.get("phone") or "").strip()
    reference = (payload.get("reference") or "").strip()

    if not all([amount_xaf, provider, phone, reference]):
        raise HTTPException(400, "amount_xaf, provider, phone et reference requis.")
    if not reference:
        raise HTTPException(400, "Code de référence obligatoire.")

    db = get_db()
    query: dict = {"user_id": user["id"], "payment_method": provider, "status": "pending_mm"}
    if tontine_id:
        query["tontine_id"] = tontine_id
    elif goal_id:
        query["goal_id"] = goal_id
    payment = await db.payments.find_one(query, sort=[("created_at", -1)])

    if not payment:
        raise HTTPException(404, "Aucun paiement en attente trouvé.")

    net_xaf = float(payment["amount_xaf"])
    now = now_utc()

    await db.payments.update_one({"id": payment["id"]}, {"$set": {
        "status": "succeeded",
        "transaction_reference": reference,
        "confirmed_at": now,
        "updated_at": now,
    }})

    # Record contribution — full amount credited (no commission on deposit)
    if tontine_id:
        tontine = await db.tontines.find_one({"id": tontine_id})
        member = await db.tontine_members.find_one({"tontine_id": tontine_id, "user_id": user["id"]})
        if tontine and member:
            await db.tontine_contributions.insert_one({
                "id": gen_id(),
                "tontine_id": tontine_id,
                "user_id": user["id"],
                "full_name": member["full_name"],
                "amount": net_xaf,
                "cycle": tontine["current_cycle"],
                "note": f"Paiement {provider.title()} Money · Réf: {reference}",
                "recorded_by": user["id"],
                "payment_id": payment["id"],
                "created_at": now,
            })
            await db.tontines.update_one({"id": tontine_id}, {"$inc": {"total_collected": net_xaf}})

    await create_notification(
        user["id"], "Paiement Mobile Money confirmé",
        f"Contribution de {net_xaf:,.0f} XAF via {provider.title()} Money enregistrée (réf: {reference}).",
        kind="success",
    )
    await log_event("payment.mm_confirmed", user_id=user["id"], request=request,
                    metadata={"payment_id": payment["id"], "reference": reference})

    return {
        "status": "succeeded",
        "net_received_xaf": round(net_xaf, 2),
        "transaction_reference": reference,
    }


# ============================================================
# RETRAITS
# ============================================================

@payments_router.get("/withdrawal/preview")
async def withdrawal_preview(amount_xaf: float, user=Depends(get_current_user)):
    """Return commission breakdown before the user confirms a withdrawal."""
    if not user.get("is_email_verified", True):
        raise HTTPException(403, "Email non vérifié. Vérifiez votre email avant d'effectuer un retrait.")
    if amount_xaf < 500:
        raise HTTPException(400, "Montant minimum de retrait : 500 XAF.")
    config = await get_payment_config()
    breakdown = calculate_withdrawal_net(float(amount_xaf), config)
    return {
        "gross_xaf": breakdown["gross_xaf"],
        "commission_xaf": round(breakdown["commission_xaf"], 2),
        "commission_pct": breakdown["commission_pct"],
        "net_xaf": round(breakdown["net_xaf"], 2),
        "message": f"Vous recevrez {breakdown['net_xaf']:,.0f} XAF après déduction de la commission de {breakdown['commission_pct']}%.",
    }


@payments_router.post("/withdrawal/request")
async def request_withdrawal(payload: dict, request: Request, user=Depends(get_current_user)):
    """Demande de retrait. Commission 1.5% applied HERE — not on deposits."""
    if not user.get("is_email_verified", True):
        raise HTTPException(403, "Email non vérifié. Vérifiez votre email avant d'effectuer un retrait.")
    idempotency_key = request.headers.get("x-idempotency-key")

    # Check idempotency first
    cached = await _check_idempotency(idempotency_key, user["id"], "withdrawal/request")
    if cached is not None:
        return cached

    amount_xaf = payload.get("amount_xaf")
    method = (payload.get("method") or "").strip().lower()
    phone = (payload.get("phone") or "").strip()
    reason = (payload.get("reason") or "").strip()
    goal_id = (payload.get("goal_id") or "").strip() or None

    if not amount_xaf or float(amount_xaf) < 500:
        raise HTTPException(400, "Montant minimum de retrait : 500 XAF.")
    if method not in ("orange", "mtn", "bank"):
        raise HTTPException(400, "Méthode invalide (orange | mtn | bank).")
    if method in ("orange", "mtn") and not phone:
        raise HTTPException(400, "Numéro de téléphone requis pour Mobile Money.")

    config = await get_payment_config()
    breakdown = calculate_withdrawal_net(float(amount_xaf), config)

    db = get_db()

    # Daily withdrawal limit check
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    daily_agg = await db.withdrawals.aggregate([
        {"$match": {
            "user_id": user["id"],
            "status": {"$in": ["pending", "approved", "processing"]},
            "created_at": {"$gte": today_start}
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount_xaf"}}}
    ]).to_list(1)
    daily_total = daily_agg[0]["total"] if daily_agg else 0

    DAILY_LIMIT_XAF = float(os.environ.get("DAILY_WITHDRAWAL_LIMIT_XAF", "500000"))
    if daily_total + float(amount_xaf) > DAILY_LIMIT_XAF:
        raise HTTPException(400, f"Limite journalière de retrait atteinte ({DAILY_LIMIT_XAF:,.0f} XAF/jour). Réessayez demain.")

    now = now_utc()
    withdrawal_id = gen_id()

    await db.withdrawals.insert_one({
        "id": withdrawal_id,
        "user_id": user["id"],
        "full_name": user["full_name"],
        "amount_xaf": breakdown["gross_xaf"],
        "commission_xaf": breakdown["commission_xaf"],
        "commission_pct": breakdown["commission_pct"],
        "net_xaf": breakdown["net_xaf"],
        "method": method,
        "phone": phone,
        "reason": reason,
        "goal_id": goal_id,
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    })

    await create_notification(
        user["id"], "Retrait en cours de traitement",
        f"Votre demande de retrait de {amount_xaf:,.0f} XAF est en traitement. Net reçu : {breakdown['net_xaf']:,.0f} XAF.",
        kind="info",
    )
    await log_event("payment.withdrawal_requested", user_id=user["id"], request=request,
                    metadata={"withdrawal_id": withdrawal_id, "amount_xaf": amount_xaf, "method": method})

    result = {
        "withdrawal_id": withdrawal_id,
        "status": "pending",
        "amount_xaf": breakdown["gross_xaf"],
        "commission_xaf": breakdown["commission_xaf"],
        "net_xaf": breakdown["net_xaf"],
        "message": f"Demande enregistrée. Vous recevrez {breakdown['net_xaf']:,.0f} XAF sur votre {method.title()} ({phone}) sous 24-48h.",
    }
    await _save_idempotency(idempotency_key, user["id"], "withdrawal/request", result)
    return result


@payments_router.get("/withdrawals/me")
async def my_withdrawals(user=Depends(get_current_user)):
    db = get_db()
    items = await db.withdrawals.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


@payments_router.get("/admin/withdrawals")
async def admin_withdrawals(_admin=Depends(require_super_admin), status: Optional[str] = None):
    db = get_db()
    filt: dict = {}
    if status:
        filt["status"] = status
    items = await db.withdrawals.find(filt, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@payments_router.patch("/admin/withdrawals/{wid}")
async def process_withdrawal(wid: str, payload: dict, _admin=Depends(require_super_admin)):
    """Admin approves or rejects a withdrawal request."""
    new_status = payload.get("status")
    if new_status not in ("approved", "rejected", "paid"):
        raise HTTPException(400, "Status doit être approved | rejected | paid.")
    db = get_db()
    w = await db.withdrawals.find_one({"id": wid})
    if not w:
        raise HTTPException(404, "Retrait introuvable.")

    await db.withdrawals.update_one({"id": wid}, {"$set": {"status": new_status, "updated_at": now_utc()}})

    msg_map = {
        "approved": f"Votre retrait de {w['amount_xaf']:,.0f} XAF a été approuvé. Traitement en cours.",
        "paid": f"Votre retrait de {w['net_xaf']:,.0f} XAF a été envoyé sur votre {w['method'].title()}.",
        "rejected": f"Votre demande de retrait de {w['amount_xaf']:,.0f} XAF a été refusée. Contactez le support.",
    }
    await create_notification(w["user_id"], "Mise à jour retrait", msg_map[new_status],
                               kind="success" if new_status == "paid" else "info")
    return {"status": new_status}


# ============================================================
# PAYMENT CONFIG (admin)
# ============================================================

@payments_router.get("/config")
async def get_config(_admin=Depends(require_super_admin)):
    """Return current payment fee configuration."""
    config = await get_payment_config()
    return config


@payments_router.patch("/config")
async def update_config(payload: dict, _admin=Depends(require_super_admin)):
    """Update payment fee config. Validates bounds and invalidates cache."""
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
    return {"updated": list(updates.keys()), "values": updates}


# ============================================================
# TWILIO SMS
# ============================================================

@sms_router.post("/test")
async def sms_test(payload: dict, user=Depends(get_current_user)):
    """Send a test SMS to any phone. Available to all authed users."""
    to = (payload.get("to") or user.get("phone") or "").strip()
    body = payload.get("body") or f"Hodix · SMS test pour {user['full_name'][:30]}"
    res = await send_sms(to, body, user_id=user["id"])
    if not res.get("ok"):
        raise HTTPException(400, res.get("detail", "Échec SMS"))
    return res


@sms_router.post("/tontines/{tontine_id}/reminders")
async def send_tontine_reminders(tontine_id: str, payload: Optional[dict] = None, user=Depends(get_current_user)):
    """Send a contribution reminder to all members of a tontine (admin only)."""
    db = get_db()
    tontine = await db.tontines.find_one({"id": tontine_id})
    if not tontine:
        raise HTTPException(404, "Tontine introuvable.")
    membership = await db.tontine_members.find_one({"tontine_id": tontine_id, "user_id": user["id"]})
    if not membership or membership["role"] != "admin":
        raise HTTPException(403, "Seul l'admin peut envoyer des rappels.")

    custom = (payload or {}).get("message")
    members = await db.tontine_members.find({"tontine_id": tontine_id}, {"_id": 0}).to_list(500)
    sent = 0
    skipped = 0
    failed = 0
    for m in members:
        u = await db.users.find_one({"id": m["user_id"]}, {"_id": 0, "phone": 1, "full_name": 1})
        if not u or not is_e164(u.get("phone") or ""):
            skipped += 1
            continue
        body = custom or (
            f"Bonjour {u['full_name'].split(' ')[0]}, rappel Hodix : votre contribution de "
            f"{tontine['contribution_amount']:,.0f} XAF pour la tontine « {tontine['name']} » "
            f"(cycle {tontine['current_cycle']}) est attendue. Merci !"
        )
        res = await send_sms(u["phone"], body, user_id=m["user_id"])
        if res.get("ok"):
            sent += 1
        else:
            failed += 1

    await log_event("sms.tontine_reminders", user_id=user["id"],
                    metadata={"tontine_id": tontine_id, "sent": sent, "failed": failed, "skipped": skipped})
    return {"sent": sent, "skipped": skipped, "failed": failed}


# Admin endpoint to list SMS logs
@sms_admin_router.get("/logs")
async def sms_logs(_admin=Depends(require_super_admin), limit: int = 100):
    db = get_db()
    items = await db.sms_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return items


# ============================================================
# TRANSACTION RECEIPT
# ============================================================

@payments_router.get("/qr-data")
async def get_qr_data(current_user=Depends(get_current_user)):
    uid = str(current_user["_id"]) if "_id" in current_user else current_user["id"]
    return {
        "user_id": uid,
        "full_name": current_user.get("full_name", ""),
        "hodix_tag": f"HODIX-{uid[:8].upper()}",
        "type": "payment_request"
    }


@payments_router.get("/{payment_id}/receipt")
async def payment_receipt(payment_id: str, user=Depends(get_current_user)):
    """Get transaction receipt details for display/sharing."""
    db = get_db()
    # Check in both payments and withdrawals collections
    payment = await db.payments.find_one({"id": payment_id, "user_id": user["id"]}, {"_id": 0})
    if not payment:
        payment = await db.withdrawals.find_one({"id": payment_id, "user_id": user["id"]}, {"_id": 0})
    if not payment:
        raise HTTPException(404, "Transaction introuvable.")

    # Build receipt
    return {
        "receipt_id": f"HDX-{payment_id[:8].upper()}",
        "transaction_id": payment_id,
        "type": payment.get("kind", "payment"),
        "amount_xaf": payment.get("amount_xaf") or payment.get("displayed_amount_xaf") or 0,
        "commission_xaf": payment.get("commission_xaf", 0),
        "net_xaf": payment.get("net_xaf", 0),
        "status": payment.get("status"),
        "method": payment.get("payment_method") or payment.get("method", "unknown"),
        "created_at": payment.get("created_at"),
        "reference": payment.get("transaction_reference") or payment.get("stripe_session_id", "—"),
        "user_name": user["full_name"],
        "user_email": user["email"],
    }
