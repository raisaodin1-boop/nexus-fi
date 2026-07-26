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
  Suisse: "CHF",
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
  Canada: "CAD",
  "Royaume-Uni": "GBP",
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
  title: "HODIX Diaspora",
  question: "Cotisez à votre tontine depuis l'étranger",
  subtitle:
    "Un espace dédié aux membres hors Cameroun : montants en devise locale, preuves de paiement, validation HODIX.",
  cta: "Commencer l'inscription",
  pendingTitle: "Dossier en examen",
  pendingBody:
    "Nous vérifions votre identité et votre résidence à l'étranger. Délai habituel : 24 à 48 heures ouvrées. Vous serez notifié dès validation.",
  rejectedTitle: "Dossier à corriger",
  reapply: "Corriger et renvoyer mon dossier",
};

/** Enrollment / pre-access notices — hide once Diaspora mode is active.
 *  Do not match contribution "needs info" (action_url → /diaspora/proof/…).
 */
export function isDiasporaEnrollmentLifecycleNotif(n: {
  title?: string | null;
  action_url?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  const title = (n.title ?? "").trim();
  const url = n.action_url ?? (n.metadata?.action_url ? String(n.metadata.action_url) : "");
  if (title === "Dossier Diaspora reçu" || title === "Inscription Diaspora non validée") return true;
  if (url.includes("/diaspora/enroll")) return true;
  // Gate landing while waiting for approval — not post-activation home or pay/proof.
  if (url === "/diaspora" || url.endsWith("/diaspora")) return true;
  return false;
}
