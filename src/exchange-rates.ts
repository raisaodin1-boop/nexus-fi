/**
 * Real-time exchange rates for XAF / EUR / USD.
 *
 * XAF (CFA franc BEAC) is legally pegged to EUR at exactly 655.957 XAF = 1 EUR.
 * EUR/USD rate is fetched live from frankfurter.app (free, no API key).
 * All derived rates are computed from those two facts.
 */

export interface Rates {
  XAF_PER_EUR: number;   // always 655.957
  XAF_PER_USD: number;   // derived
  USD_PER_EUR: number;   // live
  EUR_PER_USD: number;   // live inverse
  fetched_at: string;
}

const XAF_PER_EUR = 655.957;

let _cache: Rates | null = null;
let _cacheAt = 0;
const TTL_MS = 5 * 60 * 1000; // 5 min

export async function getRates(): Promise<Rates> {
  if (_cache && Date.now() - _cacheAt < TTL_MS) return _cache;

  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD");
    const json = await res.json();
    const usdPerEur: number = json?.rates?.USD ?? 1.08;
    const rates: Rates = {
      XAF_PER_EUR,
      XAF_PER_USD: XAF_PER_EUR / usdPerEur,
      USD_PER_EUR: usdPerEur,
      EUR_PER_USD: 1 / usdPerEur,
      fetched_at: new Date().toISOString(),
    };
    _cache = rates;
    _cacheAt = Date.now();
    return rates;
  } catch {
    // Fallback to approximate rates if network fails
    return {
      XAF_PER_EUR,
      XAF_PER_USD: 608,
      USD_PER_EUR: 1.08,
      EUR_PER_USD: 0.926,
      fetched_at: new Date().toISOString(),
    };
  }
}

export type Currency = "XAF" | "EUR" | "USD";

/** Convert amount from one currency to another */
export function convert(amount: number, from: Currency, to: Currency, rates: Rates): number {
  if (from === to) return amount;
  // Normalise to XAF first
  let xaf: number;
  if (from === "XAF") xaf = amount;
  else if (from === "EUR") xaf = amount * rates.XAF_PER_EUR;
  else xaf = amount * rates.XAF_PER_USD;
  // Convert from XAF to target
  if (to === "XAF") return xaf;
  if (to === "EUR") return xaf / rates.XAF_PER_EUR;
  return xaf / rates.XAF_PER_USD;
}

export function formatAmount(amount: number, currency: Currency): string {
  const locale = "fr-FR";
  if (currency === "XAF") return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount) + " XAF";
  if (currency === "EUR") return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(amount);
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
}
