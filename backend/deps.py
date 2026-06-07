"""FastAPI dependencies for auth & RBAC."""
from typing import List
from fastapi import Depends, HTTPException, Header, status

from db import get_db
from security import decode_token
from models import Role


async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.split(" ", 1)[1].strip()
    payload = decode_token(token, refresh=False)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id or not session_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    db = get_db()
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="User not found or inactive")

    session = await db.sessions.find_one({"id": session_id, "is_active": True}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Session revoked or expired")

    user["_session_id"] = session_id
    return user


def require_roles(allowed: List[Role]):
    async def checker(user=Depends(get_current_user)):
        if Role(user["role"]) not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker


require_super_admin = require_roles([Role.SUPER_ADMIN])
