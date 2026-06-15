/**
 * Real-time exchange rates — XAF, NGN, GHS, KES, ZAR, USD, EUR.
 *
 * XAF (CFA franc BEAC) is legally pegged to EUR at exactly 655.957.
 * All other rates fetched from ExchangeRate-API (free, USD base, no key required).
 */

export type Currency = "XAF" | "NGN" | "GHS" | "KES" | "ZAR" | "USD" | "EUR";

export const CURRENCY_META: Record<Currency, { name: string; symbol: string; flag: string; decimals: number }> = {
  XAF: { name: "Franc CFA", symbol: "FCFA", flag: "🇨🇲", decimals: 0 },
  NGN: { name: "Naira nigérian", symbol: "₦", flag: "🇳🇬", decimals: 0 },
  GHS: { name: "Cedi ghanéen", symbol: "GH₵", flag: "🇬🇭", decimals: 2 },
  KES: { name: "Shilling kényan", symbol: "KSh", flag: "🇰🇪", decimals: 2 },
  ZAR: { name: "Rand sud-africain", symbol: "R", flag: "🇿🇦", decimals: 2 },
  USD: { name: "Dollar américain", symbol: "$", flag: "🇺🇸", decimals: 2 },
  EUR: { name: "Euro", symbol: "€", flag: "🇪🇺", decimals: 2 },
};

export const ALL_CURRENCIES: Currency[] = ["XAF", "NGN", "GHS", "KES", "ZAR", "USD", "EUR"];

// USD-based rates (1 USD = N units of currency)
export interface Rates {
  base: "USD";
  rates: Record<Currency, number>;
  fetched_at: string;
  /** live = API ok, stale = expired cache reused, fallback = static defaults */
  source: "live" | "stale" | "fallback";
}

const XAF_PER_EUR = 655.957;

let _cache: Rates | null = null;
let _cacheAt = 0;
const TTL_MS = 5 * 60 * 1000;

// Static fallback (mid-2026 approx.) — only used when API and stale cache unavailable
const FALLBACK_USD: Record<Currency, number> = {
  USD: 1,
  EUR: 0.92,
  XAF: XAF_PER_EUR * 0.92,
  NGN: 1650,
  GHS: 15.8,
  KES: 132,
  ZAR: 18.2,
};

export async function getRates(): Promise<Rates> {
  if (_cache && Date.now() - _cacheAt < TTL_MS) return _cache;

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();
    if (json?.result !== "success") throw new Error("API error");

    const r = json.rates;
    const rates: Record<Currency, number> = {
      USD: 1,
      EUR: r.EUR ?? FALLBACK_USD.EUR,
      XAF: XAF_PER_EUR * (r.EUR ?? FALLBACK_USD.EUR),
      NGN: r.NGN ?? FALLBACK_USD.NGN,
      GHS: r.GHS ?? FALLBACK_USD.GHS,
      KES: r.KES ?? FALLBACK_USD.KES,
      ZAR: r.ZAR ?? FALLBACK_USD.ZAR,
    };

    _cache = { base: "USD", rates, fetched_at: new Date().toISOString(), source: "live" };
    _cacheAt = Date.now();
    return _cache;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (_cache) {
      console.warn("[exchange-rates] API unavailable, using stale cache:", msg);
      return { ..._cache, source: "stale" };
    }
    console.warn("[exchange-rates] API unavailable, using static fallback rates:", msg);
    return {
      base: "USD",
      rates: { ...FALLBACK_USD },
      fetched_at: new Date().toISOString(),
      source: "fallback",
    };
  }
}

/** Convert amount between any two supported currencies */
export function convert(amount: number, from: Currency, to: Currency, rates: Rates): number {
  if (from === to) return amount;
  const inUSD = amount / rates.rates[from];
  return inUSD * rates.rates[to];
}

export function formatAmount(amount: number, currency: Currency): string {
  const meta = CURRENCY_META[currency];
  const decimals = meta?.decimals ?? 2;
  const formatted = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimals }).format(amount);
  return `${formatted} ${meta?.symbol ?? currency}`;
}

// Legacy compat for existing screens
export function formatXAFAmount(amount: number): string {
  return `${Math.round(amount).toLocaleString("fr-FR")} FCFA`;
}
