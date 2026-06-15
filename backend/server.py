"""HODIX FastAPI server entrypoint."""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR.parent / ".env")

from fastapi import FastAPI, APIRouter  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from rate_limiter import limiter  # noqa: E402

from db import ensure_indexes, get_db  # noqa: E402
from routes_auth import router as auth_router  # noqa: E402
from routes_users import router as users_router  # noqa: E402
from routes_savings import router as savings_router  # noqa: E402
from notifications_svc import router as notif_router  # noqa: E402
from routes_tontines import router as tontines_router  # noqa: E402
from routes_groups import router as groups_router  # noqa: E402
from routes_identity import router as identity_router, admin_router  # noqa: E402
from routes_extras import (  # noqa: E402
    promo_router,
    manager_router,
    analytics_router,
    pdfb64_router,
    admin_ext_router,
)
from routes_payments import payments_router, sms_router, sms_admin_router  # noqa: E402
from routes_premium import identity_v2_router, kyc_router  # noqa: E402
from routes_fraud import fraud_router  # noqa: E402
from routes_referral import router as referral_router  # noqa: E402
from routes_documents import router as documents_router  # noqa: E402
from migrations import migrate_roles  # noqa: E402
from scheduler import start_scheduler, shutdown_scheduler  # noqa: E402
from routes_ws import ws_router  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("hodix")

_sentry_dsn = os.environ.get("SENTRY_DSN", "")
if _sentry_dsn:
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.1, environment=os.environ.get("ENVIRONMENT", "production"))
    except Exception as _sentry_err:
        logger.warning("Sentry init skipped: %s", _sentry_err)

app = FastAPI(title="HODIX API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"app": "HODIX", "tagline": "Building Trust Together", "version": "1.0.0", "status": "ok"}


@api_router.get("/health")
async def health():
    return {"status": "ok"}


api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(savings_router)
api_router.include_router(notif_router)
api_router.include_router(tontines_router)
api_router.include_router(groups_router)
api_router.include_router(identity_router)
api_router.include_router(admin_router)
api_router.include_router(promo_router)
api_router.include_router(manager_router)
api_router.include_router(analytics_router)
api_router.include_router(pdfb64_router)
api_router.include_router(admin_ext_router)
api_router.include_router(payments_router)
api_router.include_router(sms_router)
api_router.include_router(sms_admin_router)
api_router.include_router(identity_v2_router)
api_router.include_router(kyc_router)
api_router.include_router(fraud_router)
api_router.include_router(referral_router)
api_router.include_router(documents_router)

app.include_router(api_router)
app.include_router(ws_router)

# CORS — allow specific origins in production, wildcard only in dev
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "").strip()
if _raw_origins:
    _allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
else:
    # Dev fallback: allow localhost variants + Expo
    _allowed_origins = [
        "http://localhost:8081",
        "http://localhost:8082",
        "http://localhost:8083",
        "http://localhost:3000",
        "http://127.0.0.1:8081",
        "http://127.0.0.1:8082",
        "http://127.0.0.1:8083",
        "http://127.0.0.1:3000",
        "exp://localhost:8081",
        "exp://localhost:8082",
        "https://hodix.app",
        "https://www.hodix.app",
        "https://hodixemergent-production.up.railway.app",
        "https://web-production-7d726.up.railway.app",
        "https://nexus-fi.vercel.app",
        "https://nexus-fi-git-claude-blissful-s-179986-raisaodin1-boops-projects.vercel.app",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Idempotency-Key"],
)


@app.on_event("startup")
async def on_startup():
    try:
        await ensure_indexes()
        # Auto-seed in dev if empty
        db = get_db()
        if not await db.users.find_one({"email": "admin@hodix.app"}):
            from seed import seed
            await seed()
        # Idempotent legacy role migration
        await migrate_roles()
        # Start APScheduler (daily SMS reminders @ 09:00 UTC)
        try:
            start_scheduler()
        except Exception as se:
            logger.error("Scheduler failed to start: %s", se)
        logger.info("HODIX backend ready")
    except Exception as e:
        logger.error("Startup error: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    try:
        shutdown_scheduler()
    except Exception:
        pass
    logger.info("HODIX backend shutting down")
