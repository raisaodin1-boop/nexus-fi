"""Auth routes: register, login, logout, refresh, password reset."""
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

logger = logging.getLogger(__name__)

# Email addresses that automatically get super_admin role.
# Configured exclusively via env var — a hardcoded fallback would be a
# privilege-escalation backdoor (anyone registering that email becomes admin).
SUPER_ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("SUPER_ADMIN_EMAILS", "").split(",") if e.strip()}

from audit import log_event
from db import get_db
from trust_score import award_signup_bonus
from deps import get_current_user
from models import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    Role,
    TokenResponse,
    UserPublic,
    now_utc,
    gen_id,
)
from rate_limiter import limiter

from security import (
    ACCESS_EXPIRE_MIN,
    create_access_token,
    create_refresh_token,
    create_reset_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_public(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "email": doc["email"],
        "full_name": doc["full_name"],
        "role": doc["role"],
        "is_email_verified": doc.get("is_email_verified", True),
        "phone": doc.get("phone"),
        "gender": doc.get("gender"),
        "country": doc.get("country"),
        "city": doc.get("city"),
        "occupation": doc.get("occupation"),
        "photo_base64": doc.get("photo_base64"),
        "created_at": doc.get("created_at", now_utc()),
        "profile_complete": doc.get("profile_complete", False),
        "first_name": doc.get("first_name"),
        "last_name": doc.get("last_name"),
        "birth_date": doc.get("birth_date"),
        "birth_place": doc.get("birth_place"),
        "neighborhood": doc.get("neighborhood"),
        "id_doc_base64": None,  # never expose raw doc
        "kyc_level": doc.get("kyc_level", 0),
    }


@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(data: RegisterRequest, request: Request):
    db = get_db()
    email = data.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")

    # Determine role
    # Validate mandatory consents
    if not (data.consent_cgu and data.consent_data and data.consent_fees):
        raise HTTPException(
            status_code=400,
            detail="Vous devez accepter les trois conditions obligatoires (CGU, données personnelles et frais) pour créer un compte."
        )

    if email in SUPER_ADMIN_EMAILS:
        assigned_role = Role.SUPER_ADMIN.value
    elif data.role == "tontine_manager":
        assigned_role = Role.TONTINE_MANAGER.value
    else:
        assigned_role = Role.MEMBER.value

    user_id = gen_id()
    now = now_utc()
    doc = {
        "id": user_id,
        "email": email,
        "full_name": data.full_name.strip(),
        "hashed_password": hash_password(data.password),
        "role": assigned_role,
        "profile_complete": False,
        "is_active": True,
        "is_email_verified": True,
        "phone": None, "gender": None, "country": None,
        "city": None, "occupation": None, "photo_base64": None,
        # Consent audit trail — stored for legal compliance
        "consents": {
            "cgu": True,
            "data": True,
            "fees": True,
            "accepted_at": data.consent_date or now.isoformat(),
            "ip_address": request.client.host if request.client else None,
        },
        "created_at": now,
        "updated_at": now,
    }
    await db.users.insert_one(doc)
    await award_signup_bonus(user_id)

    # Handle referral code
    if data.referral_code:
        referral_code = data.referral_code.strip().upper()
        referrer = await db.users.find_one({"invite_code": referral_code})
        if referrer:
            referrer_id = referrer["id"]
            # Mark this user as referred
            await db.users.update_one(
                {"id": user_id},
                {"$set": {"referred_by": referrer_id}},
            )
            # Award bonus points to referrer
            await db.users.update_one(
                {"id": referrer_id},
                {"$inc": {"trust_score": 50}, "$set": {"updated_at": now_utc()}},
            )
            # Create notification for referrer
            try:
                from notifications_svc import create_notification
                await create_notification(
                    referrer_id,
                    "Nouveau filleul",
                    f"Nouveau filleul : {email}",
                    kind="success",
                )
            except Exception:
                pass

    # Create session + tokens
    session_id = gen_id()
    await db.sessions.insert_one({
        "id": session_id,
        "user_id": user_id,
        "device_id": None,
        "user_agent": request.headers.get("user-agent"),
        "ip_address": request.client.host if request.client else None,
        "is_active": True,
        "created_at": now,
        "last_seen_at": now,
    })

    access = create_access_token(user_id, assigned_role, session_id)
    refresh = create_refresh_token(user_id, session_id)

    await log_event("user.register", user_id=user_id, request=request, metadata={"email": email})

    # Identity event: kickstart points
    try:
        from identity_engine import record_identity_event
        await record_identity_event(user_id, "account_created")
    except Exception:
        pass

    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": ACCESS_EXPIRE_MIN * 60,
        "user": _user_public(doc),
    }


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(data: LoginRequest, request: Request):
    from datetime import timedelta
    db = get_db()
    email = data.email.lower().strip()
    user = await db.users.find_one({"email": email})

    # Account lockout check
    if user:
        locked_until = user.get("locked_until")
        if locked_until:
            if isinstance(locked_until, str):
                locked_until = datetime.fromisoformat(locked_until.replace("Z", "+00:00"))
            if locked_until.replace(tzinfo=timezone.utc) if locked_until.tzinfo is None else locked_until > datetime.now(timezone.utc):
                remaining = max(1, int((locked_until.astimezone(timezone.utc) - datetime.now(timezone.utc)).total_seconds() / 60))
                raise HTTPException(status_code=429, detail=f"Compte bloqué suite à trop de tentatives. Réessayez dans {remaining} minute(s).")

    if not user or not verify_password(data.password, user["hashed_password"]):
        await log_event("user.login_failed", request=request, metadata={"email": email})
        if user:
            attempts = user.get("failed_login_attempts", 0) + 1
            upd: dict = {"failed_login_attempts": attempts, "updated_at": datetime.now(timezone.utc)}
            if attempts >= 5:
                upd["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=15)
                upd["failed_login_attempts"] = 0
            await db.users.update_one({"id": user["id"]}, {"$set": upd})
        raise HTTPException(status_code=401, detail="Email ou mot de passe invalide.")

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Compte désactivé.")

    # Reset failed attempts on success
    await db.users.update_one({"id": user["id"]}, {"$set": {"failed_login_attempts": 0, "locked_until": None}})

    session_id = gen_id()
    now = now_utc()
    await db.sessions.insert_one({
        "id": session_id,
        "user_id": user["id"],
        "device_id": None,
        "user_agent": request.headers.get("user-agent"),
        "ip_address": request.client.host if request.client else None,
        "is_active": True,
        "created_at": now,
        "last_seen_at": now,
    })

    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": now}})

    access = create_access_token(user["id"], user["role"], session_id)
    refresh = create_refresh_token(user["id"], session_id)

    await log_event("user.login", user_id=user["id"], request=request)

    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": ACCESS_EXPIRE_MIN * 60,
        "user": _user_public(user),
    }


@router.post("/logout")
async def logout(request: Request, user=Depends(get_current_user)):
    db = get_db()
    await db.sessions.update_one(
        {"id": user["_session_id"]},
        {"$set": {"is_active": False, "revoked_at": now_utc()}}
    )
    await log_event("user.logout", user_id=user["id"], request=request)
    return {"detail": "Déconnexion réussie"}


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(data: ForgotPasswordRequest, request: Request):
    db = get_db()
    user = await db.users.find_one({"email": data.email.lower().strip()})
    if user:
        token = create_reset_token(user["id"])
        # In production, email this. For MVP, store in DB for QA/dev access.
        await db.password_resets.insert_one({
            "id": gen_id(),
            "user_id": user["id"],
            "token": token,
            "used": False,
            "created_at": now_utc(),
        })
        logger.info("Password reset token for %s: %s", user['email'], token)
        await log_event("user.password_reset_request", user_id=user["id"], request=request)
    return {"detail": "Si cet email existe, un lien de réinitialisation a été envoyé."}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, request: Request):
    payload = decode_token(data.token, refresh=False)
    if not payload or payload.get("type") != "password_reset":
        raise HTTPException(status_code=400, detail="Token invalide ou expiré.")
    user_id = payload.get("sub")
    db = get_db()
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    await db.users.update_one(
        {"id": user_id},
        {"$set": {"hashed_password": hash_password(data.new_password), "updated_at": now_utc()}}
    )
    # Revoke all sessions
    await db.sessions.update_many(
        {"user_id": user_id, "is_active": True},
        {"$set": {"is_active": False, "revoked_at": now_utc()}}
    )
    await log_event("user.password_reset_confirm", user_id=user_id, request=request)
    return {"detail": "Mot de passe réinitialisé avec succès."}


@router.post("/complete-profile")
async def complete_profile(data: dict, request: Request, user=Depends(get_current_user)):
    """Fill extended profile after registration (required before first withdrawal)."""
    db = get_db()
    allowed = {"first_name", "last_name", "phone", "birth_date", "birth_place",
               "neighborhood", "city", "country", "gender", "occupation", "id_doc_base64"}
    update = {k: v for k, v in data.items() if k in allowed and v}

    # Minimum required fields
    required = {"first_name", "last_name", "phone", "birth_date", "birth_place", "city", "country"}
    missing = required - set(update.keys())
    if missing:
        raise HTTPException(400, f"Champs obligatoires manquants : {', '.join(missing)}")

    update["profile_complete"] = True
    update["updated_at"] = now_utc()
    if not update.get("full_name"):
        update["full_name"] = f"{update.get('first_name', '')} {update.get('last_name', '')}".strip()

    await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]})
    await log_event("user.profile_completed", user_id=user["id"], request=request)
    return {"detail": "Profil complété.", "user": _user_public(fresh)}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(payload: dict, request: Request):
    token = (payload.get("refresh_token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="refresh_token requis.")
    decoded = decode_token(token, refresh=True)
    if not decoded or decoded.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Token de rafraîchissement invalide ou expiré.")

    user_id = decoded.get("sub")
    session_id = decoded.get("sid")
    db = get_db()

    # Verify session is still active
    session = await db.sessions.find_one({"id": session_id, "user_id": user_id, "is_active": True})
    if not session:
        raise HTTPException(status_code=401, detail="Session révoquée. Veuillez vous reconnecter.")

    user = await db.users.find_one({"id": user_id})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Compte introuvable ou désactivé.")

    now = now_utc()
    await db.sessions.update_one({"id": session_id}, {"$set": {"last_seen_at": now}})

    new_access = create_access_token(user_id, user["role"], session_id)
    new_refresh = create_refresh_token(user_id, session_id)

    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "token_type": "bearer",
        "expires_in": ACCESS_EXPIRE_MIN * 60,
        "user": _user_public(user),
    }


@router.get("/me", response_model=UserPublic)
async def me(user=Depends(get_current_user)):
    return _user_public(user)


# ─── Phone OTP Verification (Twilio Verify) ──────────────────────────────────

@router.post("/phone/send-otp")
async def send_phone_otp(payload: dict, user=Depends(get_current_user)):
    """
    Send an OTP to the given phone number via Twilio Verify.
    Non-blocking: if Twilio is unavailable, returns ok=False without error.
    """
    from sms import send_otp, is_e164
    phone = (payload.get("phone") or "").strip()
    if not phone:
        raise HTTPException(400, "Numéro de téléphone requis.")
    # Normalize: add +237 prefix if user typed without country code
    if phone.startswith("6") and len(phone) == 9:
        phone = "+237" + phone
    elif phone.startswith("237") and not phone.startswith("+"):
        phone = "+" + phone

    result = await send_otp(phone, user_id=user["id"])
    if result.get("ok"):
        return {"ok": True, "message": f"Code envoyé au {phone}. Valable 10 minutes."}
    elif result.get("bypass"):
        # Twilio not configured — let client know verification is skipped
        return {"ok": True, "bypass": True, "message": "Vérification SMS non disponible — étape ignorée."}
    else:
        return {"ok": False, "detail": result.get("detail", "Échec de l'envoi.")}


@router.post("/phone/verify-otp")
async def verify_phone_otp(payload: dict, user=Depends(get_current_user)):
    """
    Verify the OTP code entered by the user.
    On success: marks phone as verified in user document.
    Non-blocking: if Twilio is unavailable, marks as verified anyway.
    """
    from sms import check_otp, is_e164
    phone = (payload.get("phone") or "").strip()
    code = (payload.get("code") or "").strip()

    if not phone or not code:
        raise HTTPException(400, "Numéro et code requis.")
    if phone.startswith("6") and len(phone) == 9:
        phone = "+237" + phone
    elif phone.startswith("237") and not phone.startswith("+"):
        phone = "+" + phone

    result = await check_otp(phone, code, user_id=user["id"])

    if result.get("verified") or result.get("bypass"):
        db = get_db()
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "phone": phone,
                "phone_verified": True,
                "phone_verified_at": now_utc(),
                "updated_at": now_utc(),
            }}
        )
        await log_event("user.phone_verified", user_id=user["id"],
                        metadata={"phone": phone, "bypass": result.get("bypass", False)})
        return {"ok": True, "verified": True, "phone": phone}
    else:
        return {"ok": False, "verified": False, "detail": result.get("detail", "Code incorrect.")}


@router.post("/phone/send-otp-public")
@limiter.limit("5/minute")
async def send_phone_otp_public(payload: dict, request: Request):
    """
    Send OTP without authentication (used during registration before account creation).
    Rate-limited by Twilio's own mechanisms.
    """
    from sms import send_otp, is_e164
    phone = (payload.get("phone") or "").strip()
    if not phone:
        raise HTTPException(400, "Numéro de téléphone requis.")
    if phone.startswith("6") and len(phone) == 9:
        phone = "+237" + phone
    elif phone.startswith("237") and not phone.startswith("+"):
        phone = "+" + phone

    result = await send_otp(phone)
    if result.get("ok"):
        return {"ok": True, "message": f"Code envoyé au {phone}. Valable 10 minutes."}
    elif result.get("bypass"):
        return {"ok": True, "bypass": True, "message": "Vérification SMS non disponible."}
    else:
        # Don't expose internal errors
        return {"ok": False, "detail": "Impossible d'envoyer le code. Vérifiez le numéro."}


# ─── Super-admin debug endpoint (dev only) ───────────────────────────────────

@router.get("/admin/debug/password-reset/{email}")
async def debug_password_reset(email: str, user=Depends(get_current_user)):
    """Return the latest password reset token for a given email — super-admin only, dev/debug use."""
    if user.get("role") != "super_admin":
        raise HTTPException(403, "Réservé aux super-admins.")
    db = get_db()
    record = await db.password_resets.find_one(
        {"user_id": (await db.users.find_one({"email": email.lower().strip()}, {"id": 1}) or {}).get("id")},
        sort=[("created_at", -1)],
    )
    if not record:
        raise HTTPException(404, "Aucun token de réinitialisation trouvé pour cet email.")
    return {
        "email": email.lower().strip(),
        "token": record["token"],
        "used": record.get("used", False),
        "created_at": record.get("created_at"),
    }
