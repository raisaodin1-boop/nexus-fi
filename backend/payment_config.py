"""
Payment fee configuration — fetched from DB (admin-editable) with env fallback.
Cached in memory for 5 minutes.
All fee calculations happen server-side only.
"""
import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


# In-memory cache
_cache: dict = {}
_cache_ts: datetime | None = None
CACHE_TTL = timedelta(minutes=5)

# Defaults — also the floor/ceiling limits
DEFAULTS = {
    "stripe_fee_rate": float(os.environ.get("STRIPE_FEE_RATE", "0.029")),   # 2.9%
    "stripe_fixed_fee_usd": float(os.environ.get("STRIPE_FIXED_FEE", "0.30")),  # $0.30
    "stripe_reserve_rate": float(os.environ.get("STRIPE_RESERVE_RATE", "0.005")),  # 0.5% safety margin
    "hodix_commission_pct": float(os.environ.get("HODIX_COMMISSION_PCT", "1.5")),  # Applied on withdrawal only
    "mm_fee_rate": 0.0,  # Mobile Money — Hodix absorbs fees, not members
    "xaf_to_usd_rate": float(os.environ.get("XAF_TO_USD_RATE", "0.0018")),
    "xaf_to_eur_rate": float(os.environ.get("XAF_TO_EUR_RATE", "0.0015")),
}


async def get_payment_config() -> dict:
    """Return current fee config from DB with 5min cache."""
    global _cache, _cache_ts
    now = datetime.now(timezone.utc)
    if _cache and _cache_ts and (now - _cache_ts) < CACHE_TTL:
        return _cache
    try:
        from db import get_db
        db = get_db()
        doc = await db.payment_config.find_one({"_id": "global"})
        if doc:
            cfg = {**DEFAULTS, **{k: v for k, v in doc.items() if k in DEFAULTS}}
        else:
            cfg = DEFAULTS.copy()
    except Exception:
        cfg = DEFAULTS.copy()
    _cache = cfg
    _cache_ts = now
    return cfg


def invalidate_config_cache():
    global _cache, _cache_ts
    _cache = {}
    _cache_ts = None


def calculate_stripe_gross(net_amount_usd: float, config: dict, fixed_fee: bool = True) -> dict:
    """
    Calculate gross amount to charge Stripe so Hodix receives net_amount_usd.

    Formula with fixed fee:
        gross = (net + fixed_fee) / (1 - percentage_rate)

    Without fixed fee (for small amounts):
        gross = net / (1 - total_rate)

    Returns full breakdown for audit logging.
    """
    total_rate = Decimal(str(config["stripe_fee_rate"])) + Decimal(str(config["stripe_reserve_rate"]))
    fixed = Decimal(str(config["stripe_fixed_fee_usd"])) if fixed_fee else Decimal("0")
    net = Decimal(str(net_amount_usd))

    # gross = (net + fixed) / (1 - rate)
    gross = ((net + fixed) / (1 - total_rate)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    stripe_fee_estimated = (gross * total_rate + fixed).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    return {
        "gross_usd": float(gross),
        "gross_cents": int(gross * 100),
        "net_usd": float(net),
        "stripe_fee_rate": float(total_rate),
        "stripe_fee_usd": float(stripe_fee_estimated),
        "stripe_fixed_fee_usd": float(fixed),
    }


def xaf_to_usd(amount_xaf: float, config: dict) -> float:
    return float(Decimal(str(amount_xaf)) * Decimal(str(config["xaf_to_usd_rate"])))


def xaf_to_eur(amount_xaf: float, config: dict) -> float:
    return float(Decimal(str(amount_xaf)) * Decimal(str(config["xaf_to_eur_rate"])))


def calculate_withdrawal_net(gross_xaf: float, config: dict) -> dict:
    """Commission is applied ONLY on withdrawals."""
    commission_pct = Decimal(str(config["hodix_commission_pct"])) / 100
    commission = (Decimal(str(gross_xaf)) * commission_pct).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    net = Decimal(str(gross_xaf)) - commission
    return {
        "gross_xaf": float(gross_xaf),
        "commission_xaf": float(commission),
        "commission_pct": float(config["hodix_commission_pct"]),
        "net_xaf": float(net),
    }
