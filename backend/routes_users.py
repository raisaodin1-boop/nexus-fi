"""User profile routes."""
from fastapi import APIRouter, Depends, HTTPException

from db import get_db
from deps import get_current_user, require_super_admin
from models import ProfileUpdate, UserPublic, now_utc
from notifications_svc import create_notification

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserPublic)
async def get_me(user=Depends(get_current_user)):
    return {
        "id": user["id"], "email": user["email"], "full_name": user["full_name"],
        "role": user["role"], "is_email_verified": user.get("is_email_verified", True),
        "phone": user.get("phone"), "gender": user.get("gender"),
        "country": user.get("country"), "city": user.get("city"),
        "occupation": user.get("occupation"), "photo_base64": user.get("photo_base64"),
        "created_at": user["created_at"],
    }


@router.patch("/me", response_model=UserPublic)
async def update_me(data: ProfileUpdate, user=Depends(get_current_user)):
    db = get_db()
    update_data = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    # Limit photo size to ~750 KB (base64 overhead ~33%)
    if "photo_base64" in update_data and update_data["photo_base64"]:
        if len(update_data["photo_base64"]) > 1_000_000:
            raise HTTPException(400, "Photo trop volumineuse. Taille maximale : 750 KB.")
    if update_data:
        update_data["updated_at"] = now_utc()
        await db.users.update_one({"id": user["id"]}, {"$set": update_data})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "hashed_password": 0})
    return {
        "id": updated["id"], "email": updated["email"], "full_name": updated["full_name"],
        "role": updated["role"], "is_email_verified": updated.get("is_email_verified", True),
        "phone": updated.get("phone"), "gender": updated.get("gender"),
        "country": updated.get("country"), "city": updated.get("city"),
        "occupation": updated.get("occupation"), "photo_base64": updated.get("photo_base64"),
        "created_at": updated["created_at"],
    }


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin=Depends(require_super_admin)):
    """Deactivate user account. Does NOT hard delete — sets is_active=False."""
    db = get_db()
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not target:
        raise HTTPException(404, "Utilisateur introuvable.")
    if target.get("role") == "super_admin":
        raise HTTPException(403, "Impossible de désactiver un autre super admin.")
    await db.users.update_one({"id": user_id}, {"$set": {"is_active": False, "updated_at": now_utc()}})
    await create_notification(
        user_id, "Compte suspendu",
        "Votre compte Hodix a été suspendu. Contactez le support pour plus d'informations.",
        kind="warning",
    )
    return {"detail": "deactivated"}
