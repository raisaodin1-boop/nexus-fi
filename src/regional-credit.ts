/**
 * Regional credit zones — CEMAC, UEMOA (XOF), WAMZ (NGN/GHS).
 * Maps profile country names / ISO codes to local currency and scoring thresholds.
 */
import type { Currency } from "@/src/exchange-rates";

export type CountryZone = "CEMAC" | "UEMOA" | "WAMZ" | "EAC" | "SADC" | "OTHER";

export interface RegionalProfile {
  zone: CountryZone;
  country_code: string;
  local_currency: Currency;
  /** Loan eligibility floor in local currency (equivalent ~700/1000 score gate) */
  loan_min_local: number;
  /** High-value tontine threshold in local currency */
  high_value_tontine_local: number;
  /** Savings volume plateau for 250 pts scoring component */
  savings_plateau_local: number;
}

/** ISO 3166-1 alpha-2 → zone */
export const ISO_ZONE: Record<string, CountryZone> = {
  CM: "CEMAC", GA: "CEMAC", CG: "CEMAC", TD: "CEMAC", CF: "CEMAC", GQ: "CEMAC",
  SN: "UEMOA", CI: "UEMOA", ML: "UEMOA", BF: "UEMOA", TG: "UEMOA", BJ: "UEMOA",
  NE: "UEMOA", GW: "UEMOA",
  NG: "WAMZ", GH: "WAMZ",
  KE: "EAC", TZ: "EAC", UG: "EAC", RW: "EAC",
  ZA: "SADC",
};

/** French country name (profiles.country) → ISO */
export const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  Cameroun: "CM", Gabon: "GA", Congo: "CG", Tchad: "TD",
  "République Centrafricaine": "CF", "Guinée Équatoriale": "GQ",
  Sénégal: "SN", "Côte d'Ivoire": "CI", Mali: "ML", "Burkina Faso": "BF",
  Togo: "TG", Bénin: "BJ", Niger: "NE", "Guinée-Bissau": "GW",
  Nigeria: "NG", Ghana: "GH",
  Kenya: "KE", Tanzanie: "TZ", Ouganda: "UG", Rwanda: "RW",
  "Afrique du Sud": "ZA",
};

export const ZONE_CURRENCY: Record<CountryZone, Currency> = {
  CEMAC: "XAF",
  UEMOA: "XOF",
  WAMZ: "NGN", // default; GH users get GHS via country
  EAC: "KES",
  SADC: "ZAR",
  OTHER: "XAF",
};

const ZONE_THRESHOLDS: Record<CountryZone, { loan_min: number; high_tontine: number; savings_plateau: number }> = {
  CEMAC:  { loan_min: 50_000,   high_tontine: 100_000,  savings_plateau: 2_000_000 },
  UEMOA:  { loan_min: 50_000,   high_tontine: 100_000,  savings_plateau: 2_000_000 },
  WAMZ:   { loan_min: 150_000,  high_tontine: 300_000,  savings_plateau: 5_000_000 },
  EAC:    { loan_min: 15_000,   high_tontine: 50_000,   savings_plateau: 500_000 },
  SADC:   { loan_min: 2_000,    high_tontine: 10_000,   savings_plateau: 100_000 },
  OTHER:  { loan_min: 50_000,   high_tontine: 100_000,  savings_plateau: 2_000_000 },
};

export function resolveCountryCode(country: string | null | undefined): string {
  if (!country?.trim()) return "CM";
  const c = country.trim();
  if (c.length === 2 && ISO_ZONE[c.toUpperCase()]) return c.toUpperCase();
  return COUNTRY_NAME_TO_ISO[c] ?? "CM";
}

export function getRegionalProfile(country: string | null | undefined): RegionalProfile {
  const code = resolveCountryCode(country);
  const zone = ISO_ZONE[code] ?? "OTHER";
  let local: Currency = ZONE_CURRENCY[zone];
  if (code === "GH") local = "GHS";
  if (code === "NG") local = "NGN";
  const t = ZONE_THRESHOLDS[zone];
  return {
    zone,
    country_code: code,
    local_currency: local,
    loan_min_local: t.loan_min,
    high_value_tontine_local: t.high_tontine,
    savings_plateau_local: t.savings_plateau,
  };
}

/** XOF ↔ XAF: same EUR peg (655.957) — treat 1:1 for scoring simplicity */
export function toReferenceXaf(amount: number, currency: Currency, rates?: { rates: Record<Currency, number> }): number {
  if (currency === "XAF" || currency === "XOF") return amount;
  if (!rates) {
    const approx: Partial<Record<Currency, number>> = {
      NGN: 0.37, GHS: 38.7, KES: 4.65, ZAR: 32.3, USD: 600, EUR: 655.957,
    };
    return amount * (approx[currency] ?? 1);
  }
  const inUsd = amount / rates.rates[currency];
  return inUsd * rates.rates.XAF;
}

export function countryQueryValue(country: string | null | undefined): string {
  const code = resolveCountryCode(country);
  const name = Object.entries(COUNTRY_NAME_TO_ISO).find(([, iso]) => iso === code)?.[0];
  return name ?? country ?? "Cameroun";
}
