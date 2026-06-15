/**
 * Localized payment methods by country.
 * Each method has a type (mobile_money | bank | card | crypto) and supported currencies.
 */

export type PaymentMethodType = "mobile_money" | "bank" | "card" | "crypto";

export interface PaymentMethod {
  id: string;
  name: string;
  type: PaymentMethodType;
  icon: string;          // emoji
  currencies: string[];
  countries: string[];
  minAmount: number;     // in local currency
  maxAmount: number;
  processingTime: string;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  // ── Cameroun / Zone CFA
  {
    id: "mtn_momo_cm",
    name: "MTN Mobile Money",
    type: "mobile_money",
    icon: "📱",
    currencies: ["XAF"],
    countries: ["CM", "CM-XAF"],
    minAmount: 100,
    maxAmount: 2_000_000,
    processingTime: "Instantané",
  },
  {
    id: "orange_money_cm",
    name: "Orange Money",
    type: "mobile_money",
    icon: "🟠",
    currencies: ["XAF"],
    countries: ["CM", "SN", "CI", "ML", "BF", "GN"],
    minAmount: 100,
    maxAmount: 1_500_000,
    processingTime: "Instantané",
  },
  {
    id: "express_union",
    name: "Express Union",
    type: "mobile_money",
    icon: "💳",
    currencies: ["XAF"],
    countries: ["CM"],
    minAmount: 500,
    maxAmount: 5_000_000,
    processingTime: "Instantané",
  },
  // ── Nigeria
  {
    id: "opay_ng",
    name: "OPay",
    type: "mobile_money",
    icon: "🟢",
    currencies: ["NGN"],
    countries: ["NG"],
    minAmount: 50,
    maxAmount: 500_000,
    processingTime: "Instantané",
  },
  {
    id: "palmpay_ng",
    name: "PalmPay",
    type: "mobile_money",
    icon: "🌴",
    currencies: ["NGN"],
    countries: ["NG"],
    minAmount: 50,
    maxAmount: 1_000_000,
    processingTime: "Instantané",
  },
  {
    id: "mtn_momo_ng",
    name: "MTN MoMo Nigeria",
    type: "mobile_money",
    icon: "📱",
    currencies: ["NGN"],
    countries: ["NG"],
    minAmount: 100,
    maxAmount: 1_000_000,
    processingTime: "Instantané",
  },
  // ── Ghana
  {
    id: "mtn_momo_gh",
    name: "MTN Mobile Money Ghana",
    type: "mobile_money",
    icon: "📱",
    currencies: ["GHS"],
    countries: ["GH"],
    minAmount: 1,
    maxAmount: 10_000,
    processingTime: "Instantané",
  },
  {
    id: "vodafone_cash_gh",
    name: "Vodafone Cash",
    type: "mobile_money",
    icon: "📡",
    currencies: ["GHS"],
    countries: ["GH"],
    minAmount: 1,
    maxAmount: 5_000,
    processingTime: "Instantané",
  },
  // ── Kenya
  {
    id: "mpesa_ke",
    name: "M-PESA",
    type: "mobile_money",
    icon: "🦁",
    currencies: ["KES"],
    countries: ["KE"],
    minAmount: 10,
    maxAmount: 300_000,
    processingTime: "Instantané",
  },
  {
    id: "airtel_money_ke",
    name: "Airtel Money Kenya",
    type: "mobile_money",
    icon: "🔴",
    currencies: ["KES"],
    countries: ["KE"],
    minAmount: 10,
    maxAmount: 150_000,
    processingTime: "Instantané",
  },
  // ── Afrique du Sud
  {
    id: "snapscan_za",
    name: "SnapScan",
    type: "mobile_money",
    icon: "📸",
    currencies: ["ZAR"],
    countries: ["ZA"],
    minAmount: 1,
    maxAmount: 50_000,
    processingTime: "Instantané",
  },
  {
    id: "zapper_za",
    name: "Zapper",
    type: "mobile_money",
    icon: "⚡",
    currencies: ["ZAR"],
    countries: ["ZA"],
    minAmount: 1,
    maxAmount: 50_000,
    processingTime: "Instantané",
  },
  // ── Sénégal / Afrique de l'Ouest
  {
    id: "wave_sn",
    name: "Wave",
    type: "mobile_money",
    icon: "🌊",
    currencies: ["XAF"],
    countries: ["SN", "CI", "ML", "BF"],
    minAmount: 500,
    maxAmount: 3_000_000,
    processingTime: "Instantané",
  },
  // ── International
  {
    id: "card_visa",
    name: "Carte Visa / Mastercard",
    type: "card",
    icon: "💳",
    currencies: ["USD", "EUR"],
    countries: ["*"],
    minAmount: 5,
    maxAmount: 10_000,
    processingTime: "1-3 jours",
  },
];

export const COUNTRY_CURRENCY: Record<string, string> = {
  CM: "XAF", SN: "XAF", CI: "XAF", ML: "XAF", BF: "XAF", TG: "XAF", BJ: "XAF", GA: "XAF",
  NG: "NGN",
  GH: "GHS",
  KE: "KES",
  ZA: "ZAR",
  US: "USD",
  FR: "EUR", BE: "EUR", CH: "EUR", LU: "EUR",
};

export const COUNTRY_NAMES: Record<string, string> = {
  CM: "Cameroun", SN: "Sénégal", CI: "Côte d'Ivoire", ML: "Mali", BF: "Burkina Faso",
  TG: "Togo", BJ: "Bénin", GA: "Gabon", NG: "Nigeria", GH: "Ghana",
  KE: "Kenya", ZA: "Afrique du Sud", US: "États-Unis", FR: "France", BE: "Belgique",
};

export const COUNTRY_FLAGS: Record<string, string> = {
  CM: "🇨🇲", SN: "🇸🇳", CI: "🇨🇮", ML: "🇲🇱", BF: "🇧🇫", TG: "🇹🇬", BJ: "🇧🇯", GA: "🇬🇦",
  NG: "🇳🇬", GH: "🇬🇭", KE: "🇰🇪", ZA: "🇿🇦", US: "🇺🇸", FR: "🇫🇷", BE: "🇧🇪",
};

/** Get payment methods available for a given country code */
export function getMethodsForCountry(countryCode: string): PaymentMethod[] {
  return PAYMENT_METHODS.filter(m =>
    m.countries.includes(countryCode) || m.countries.includes("*")
  );
}

/** Get payment methods for a given currency */
export function getMethodsForCurrency(currency: string): PaymentMethod[] {
  return PAYMENT_METHODS.filter(m => m.currencies.includes(currency));
}
