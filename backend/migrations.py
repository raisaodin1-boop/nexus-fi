"""One-shot migration: collapse legacy 5-role system into 3 roles.

Mapping:
- individual               -> member
- tontine_admin            -> tontine_manager
- association_admin        -> tontine_manager
- cooperative_admin        -> tontine_manager
- super_admin              -> super_admin (unchanged)
"""
import logging

from db import get_db

log = logging.getLogger(__name__)

OLD_TO_NEW = {
    "individual": "member",
    "tontine_admin": "tontine_manager",
    "association_admin": "tontine_manager",
    "cooperative_admin": "tontine_manager",
}


async def migrate_roles() -> None:
    db = get_db()
    total = 0
    for old, new in OLD_TO_NEW.items():
        res = await db.users.update_many({"role": old}, {"$set": {"role": new}})
        total += res.modified_count
    if total:
        log.info("[role-migration] Updated %s users to new role schema", total)
