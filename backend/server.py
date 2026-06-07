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
    db_ok = False
    db_err = ""
    try:
        db = get_db()
        await db.command("ping")
        db_ok = True
    except Exception as e:
        db_err = str(e)
    return {
        "status": "ok" if db_ok else "degraded",
        "db": "connected" if db_ok else f"error: {db_err}",
        "app": "HODIX",
        "version": "1.0.0",
    }


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

app.include_router(api_router)
app.include_router(ws_router)

# CORS — regex covers all vercel.app, railway.app, localhost, Expo
# NOTE: allow_credentials=True + allow_origins=["*"] is invalid in Starlette,
# so we always use allow_origin_regex and keep allow_origins=[].
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "").strip()
if _raw_origins:
    _explicit_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    _origin_regex = None
else:
    _explicit_origins = []
    _origin_regex = (
        r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
        r"|exp://localhost(:\d+)?"
        r"|https://[a-zA-Z0-9][a-zA-Z0-9\-]*\.vercel\.app"
        r"|https://[a-zA-Z0-9][a-zA-Z0-9\-]*\.up\.railway\.app"
        r"|https://(www\.)?hodix\.app"
    )

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_explicit_origins,
    allow_origin_regex=_origin_regex,
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
