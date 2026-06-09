/**
 * Credit score engine — 0-1000 weighted model.
 *
 * Weights:
 *   Régularité des cotisations  35%  →  0–350 pts
 *   Volume d'épargne            25%  →  0–250 pts
 *   Ancienneté                  20%  →  0–200 pts
 *   Réseau (groupes)            10%  →  0–100 pts
 *   Niveau KYC                  10%  →  0–100 pts
 */

export interface ScoreBreakdown {
  regularity: number;     // 0-350
  savings_volume: number; // 0-250
  seniority: number;      // 0-200
  network: number;        // 0-100
  kyc: number;            // 0-100
}

export interface CreditScoreResult {
  score: number;          // 0-1000
  breakdown: ScoreBreakdown;
  tier: ScoreTier;
  is_loan_eligible: boolean;
  computed_at: string;
}

export interface ScoreTier {
  label: string;
  color: string;
  min: number;
  gradientColors: readonly [string, string, string];
}

export interface MonthlySnapshot {
  month: string;    // "2025-06"
  score: number;
}

// ─── Tier config ──────────────────────────────────────────────────────────────

export const TIERS: ScoreTier[] = [
  { label: "Platine",  color: "#8B5CF6", min: 850, gradientColors: ["#1a0533", "#3b1a6e", "#8B5CF6"] as const },
  { label: "Or",       color: "#D4AF37", min: 650, gradientColors: ["#1a1200", "#3d2e00", "#D4AF37"] as const },
  { label: "Argent",   color: "#8B9EB0", min: 450, gradientColors: ["#0d1a26", "#1e3a52", "#8B9EB0"] as const },
  { label: "Bronze",   color: "#CD7F32", min: 200, gradientColors: ["#1a0d00", "#3d2600", "#CD7F32"] as const },
  { label: "Débutant", color: "#94A3B8", min: 0,   gradientColors: ["#0f172a", "#1e293b", "#94A3B8"] as const },
];

export function getTier(score: number): ScoreTier {
  return TIERS.find(t => score >= t.min) ?? TIERS[TIERS.length - 1];
}

export function getTierGradient(score: number): readonly [string, string, string] {
  return getTier(score).gradientColors;
}

// ─── Component calculators ────────────────────────────────────────────────────

/** 35% — ratio (contributions paid / expected) × recency boost */
export function scoreRegularity(
  contributions: { created_at: string }[],
  memberSince: string,
  frequencyDays: number, // avg days between expected contributions
): number {
  if (!memberSince) return 0;
  const now = Date.now();
  const sinceMs = new Date(memberSince).getTime();
  const ageMs = now - sinceMs;
  if (ageMs <= 0 || frequencyDays <= 0) return 0;

  const expectedCount = Math.max(1, Math.floor(ageMs / (frequencyDays * 86400000)));
  const paidCount = contributions.length;

  // Ratio — hard-capped at 1
  const ratio = Math.min(1, paidCount / expectedCount);

  // Recency boost: contributions in last 90 days add 15% bonus
  const recentCutoff = now - 90 * 86400000;
  const recentPaid = contributions.filter(c => new Date(c.created_at).getTime() > recentCutoff).length;
  const recentBonus = Math.min(0.15, recentPaid * 0.03);

  return Math.round(Math.min(350, (ratio + recentBonus) * 350));
}

/** 25% — log-scaled savings volume (plateau at ~2 000 000 XAF) */
export function scoreSavingsVolume(totalXAF: number): number {
  if (totalXAF <= 0) return 0;
  const MAX_XAF = 2_000_000;
  const ratio = Math.log1p(totalXAF) / Math.log1p(MAX_XAF);
  return Math.round(Math.min(250, ratio * 250));
}

/** 20% — account age, plateau at 36 months */
export function scoreSeniority(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const months = ageMs / (30 * 86400000);
  return Math.round(Math.min(200, (months / 36) * 200));
}

/** 10% — groups joined + creator bonus */
export function scoreNetwork(
  groupsJoined: number,
  groupsCreated: number,
): number {
  const memberPts  = Math.min(60, groupsJoined * 12);
  const creatorPts = Math.min(40, groupsCreated * 20);
  return Math.round(Math.min(100, memberPts + creatorPts));
}

/** 10% — KYC level */
export function scoreKyc(kycStatus: string | null | undefined): number {
  switch (kycStatus) {
    case "approved":  return 100;
    case "pending":   return 40;
    default:          return 0;
  }
}

// ─── Composite ────────────────────────────────────────────────────────────────

export function computeScore(breakdown: ScoreBreakdown): number {
  return Math.round(
    breakdown.regularity +
    breakdown.savings_volume +
    breakdown.seniority +
    breakdown.network +
    breakdown.kyc
  );
}

// ─── Tips based on weakest component ─────────────────────────────────────────

export function generateTips(b: ScoreBreakdown): string[] {
  const tips: string[] = [];
  if (b.regularity < 200)
    tips.push("Cotisez régulièrement pour améliorer votre score de régularité (35%).");
  if (b.savings_volume < 150)
    tips.push("Augmentez votre épargne pour booster le composant volume (25%).");
  if (b.network < 50)
    tips.push("Rejoignez ou créez un groupe pour renforcer votre réseau (10%).");
  if (b.kyc < 100)
    tips.push("Complétez votre vérification KYC pour gagner jusqu'à 100 points.");
  if (tips.length === 0)
    tips.push("Excellent profil ! Continuez sur cette lancée.");
  return tips;
}
