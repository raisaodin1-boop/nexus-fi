"""MongoDB connection helper for HODIX."""
import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_db() -> AsyncIOMotorDatabase:
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        _db = _client[os.environ["DB_NAME"]]
    return _db


async def ensure_indexes():
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.sessions.create_index([("user_id", 1), ("is_active", 1)])
    await db.audit_logs.create_index([("user_id", 1), ("created_at", -1)])
    await db.savings_goals.create_index([("user_id", 1), ("created_at", -1)])
    await db.savings_transactions.create_index([("goal_id", 1), ("created_at", -1)])
    await db.tontines.create_index("invite_code", unique=True)
    await db.tontine_members.create_index([("tontine_id", 1), ("user_id", 1)], unique=True)
    await db.tontine_contributions.create_index([("tontine_id", 1), ("user_id", 1)])
    await db.associations.create_index("invite_code", unique=True)
    await db.association_members.create_index([("association_id", 1), ("user_id", 1)], unique=True)
    await db.cooperatives.create_index("invite_code", unique=True)
    await db.cooperative_members.create_index([("cooperative_id", 1), ("user_id", 1)], unique=True)
    await db.community_funds.create_index([("owner_id", 1)])
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.push_tokens.create_index("user_id", unique=True)
    # TTL index: MongoDB auto-deletes expired reminder_dedup docs (no cron needed)
    await db.reminder_dedup.create_index("key", unique=True)
    await db.reminder_dedup.create_index("expires_at", expireAfterSeconds=0)
    await db.documents.create_index([("user_id", 1), ("created_at", -1)])
    await db.documents.create_index("id", unique=True)
