import type { Currency } from "@/src/exchange-rates";

/** Countries eligible for Diaspora mode — residence must NOT be Cameroon. */
export const DIASPORA_RESIDENCE_COUNTRIES = [
  "France",
  "Belgique",
  "Canada",
  "États-Unis",
  "Royaume-Uni",
  "Allemagne",
  "Suisse",
  "Italie",
  "Espagne",
  "Pays-Bas",
  "Portugal",
  "Suède",
  "Norvège",
  "Danemark",
  "Autriche",
  "Luxembourg",
  "Irlande",
  "Afrique du Sud",
  "Maroc",
  "Autre (hors Cameroun)",
] as const;

export type DiasporaResidenceCountry = (typeof DIASPORA_RESIDENCE_COUNTRIES)[number];

export const BLOCKED_DIASPORA_COUNTRIES = ["cameroun", "cameroon", "cm"];

export const DIASPORA_ID_DOC_TYPES = [
  { key: "passport", label: "Passeport" },
  { key: "foreign_id", label: "Carte d'identité de mon pays" },
  { key: "residence_permit", label: "Titre de séjour / carte de résident" },
] as const;

/** Display currency for diaspora dashboard by country of residence. */
export const DIASPORA_COUNTRY_CURRENCY: Record<string, Currency> = {
  France: "EUR",
  Belgique: "EUR",
  Allemagne: "EUR",
  Suisse: "EUR",
  Italie: "EUR",
  Espagne: "EUR",
  "Pays-Bas": "EUR",
  Portugal: "EUR",
  Suède: "EUR",
  Norvège: "EUR",
  Danemark: "EUR",
  Autriche: "EUR",
  Luxembourg: "EUR",
  Irlande: "EUR",
  "États-Unis": "USD",
  Canada: "USD",
  "Royaume-Uni": "USD",
  "Afrique du Sud": "ZAR",
  Maroc: "EUR",
  "Autre (hors Cameroun)": "EUR",
};

export function diasporaCurrencyForCountry(country: string): Currency {
  return DIASPORA_COUNTRY_CURRENCY[country] ?? "EUR";
}

export function isBlockedDiasporaCountry(country: string): boolean {
  const c = country.trim().toLowerCase();
  return BLOCKED_DIASPORA_COUNTRIES.some((b) => c === b || c.includes("cameroun") || c.includes("cameroon"));
}

/** Profile carries diaspora mode after admin approval. */
export function isDiasporaMember(user?: {
  diaspora_status?: string | null;
  role?: string | null;
} | null): boolean {
  if (!user) return false;
  if (user.role && user.role !== "member") return false;
  return user.diaspora_status === "approved";
}

export type DiasporaEnrollmentStatus =
  | "not_submitted"
  | "pending_review"
  | "approved"
  | "rejected"
  | "needs_info";

export interface DiasporaAccess {
  status: DiasporaEnrollmentStatus;
  has_access: boolean;
  country_of_residence?: string | null;
  preferred_currency?: Currency;
  rejection_reason?: string | null;
  submitted_at?: string | null;
  enrollment_id?: string | null;
}

export const DIASPORA_GATE_COPY = {
  title: "Mode Diaspora HODIX",
  question: "Vous vivez à l'étranger ?",
  subtitle:
    "Accédez à votre espace Diaspora pour cotiser à vos tontines familiales depuis la France, la Belgique, le Canada, les États-Unis, le Royaume-Uni ou ailleurs.",
  cta: "Entrer dans le mode Diaspora",
  pendingTitle: "Dossier en cours d'examen",
  pendingBody:
    "Notre équipe vérifie votre identité et votre preuve de résidence à l'étranger. Délai habituel : 24 à 48 heures ouvrées.",
  rejectedTitle: "Inscription non validée",
  reapply: "Soumettre un nouveau dossier",
};
