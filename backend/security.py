"""JWT + password hashing utilities for HODIX."""
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import jwt, JWTError
from passlib.context import CryptContext

JWT_SECRET = os.environ["JWT_SECRET_KEY"]
JWT_REFRESH_SECRET = os.environ["JWT_REFRESH_SECRET_KEY"]
ACCESS_EXPIRE_MIN = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))
REFRESH_EXPIRE_DAYS = int(os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", 30))
ALGO = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    # bcrypt has a 72-byte limit
    return pwd_context.hash(password[:72])


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain[:72], hashed)
    except Exception:
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(user_id: str, role: str, session_id: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "sid": session_id,
        "type": "access",
        "exp": _now() + timedelta(minutes=ACCESS_EXPIRE_MIN),
        "iat": _now(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGO)


def create_refresh_token(user_id: str, session_id: str) -> str:
    payload = {
        "sub": user_id,
        "sid": session_id,
        "type": "refresh",
        "exp": _now() + timedelta(days=REFRESH_EXPIRE_DAYS),
        "iat": _now(),
    }
    return jwt.encode(payload, JWT_REFRESH_SECRET, algorithm=ALGO)


def create_reset_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "password_reset",
        "exp": _now() + timedelta(hours=1),
        "iat": _now(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGO)


def decode_token(token: str, refresh: bool = False) -> Optional[dict[str, Any]]:
    secret = JWT_REFRESH_SECRET if refresh else JWT_SECRET
    try:
        return jwt.decode(token, secret, algorithms=[ALGO])
    except JWTError:
        return None
