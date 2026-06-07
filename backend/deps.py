"""FastAPI dependencies for auth & RBAC.

Accepts two token formats:
  1. Hodix JWT (legacy / created by /auth/supabase-sync)
  2. Supabase JWT (verified via Supabase /auth/v1/user endpoint)
"""
import os
import logging
from typing import List

import httpx
from fastapi import Depends, HTTPException, Header, status

from db import get_db
from security import decode_token
from models import Role

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")


async def _verify_supabase_token(token: str) -> dict | None:
    """Call Supabase /auth/v1/user to verify the token and get user info."""
    if not SUPABASE_URL:
        return None
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": SUPABASE_ANON_KEY,
                },
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("Supabase token verification failed: %s", e)
    return None


async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.split(" ", 1)[1].strip()
    db = get_db()

    # ── Try Hodix JWT first (fast, no network call) ──
    payload = decode_token(token, refresh=False)
    if payload and payload.get("type") == "access":
        user_id = payload.get("sub")
        session_id = payload.get("sid")
        if not user_id or not session_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
        if not user or not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="User not found or inactive")

        session = await db.sessions.find_one({"id": session_id, "is_active": True}, {"_id": 0})
        if not session:
            raise HTTPException(status_code=401, detail="Session revoked or expired")

        user["_session_id"] = session_id
        return user

    # ── Try Supabase JWT (verify via Supabase API) ──
    sb_user = await _verify_supabase_token(token)
    if sb_user:
        email = sb_user.get("email", "")
        supabase_id = sb_user.get("id", "")

        # Look up user in MongoDB by supabase_id or email
        user = await db.users.find_one(
            {"$or": [{"supabase_id": supabase_id}, {"email": email}]},
            {"_id": 0, "hashed_password": 0},
        )
        if not user:
            # Auto-create user in MongoDB from Supabase data
            from models import gen_id, now_utc
            meta = sb_user.get("user_metadata", {})
            user = {
                "id": gen_id(),
                "supabase_id": supabase_id,
                "email": email,
                "full_name": meta.get("full_name", email.split("@")[0]),
                "role": "member",
                "is_active": True,
                "is_email_verified": bool(sb_user.get("email_confirmed_at")),
                "phone": sb_user.get("phone") or None,
                "hashed_password": "",
                "created_at": now_utc(),
            }
            await db.users.insert_one({**user, "_id": user["id"]})
            logger.info("Auto-created MongoDB user for Supabase user %s", email)
        elif not user.get("supabase_id"):
            await db.users.update_one({"email": email}, {"$set": {"supabase_id": supabase_id}})

        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account inactive")

        user["_session_id"] = f"supabase:{supabase_id}"
        return user

    raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_roles(allowed: List[Role]):
    async def checker(user=Depends(get_current_user)):
        if Role(user["role"]) not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker


require_super_admin = require_roles([Role.SUPER_ADMIN])
