/**
 * Identity progression — slow, earned tiers based on real activity only.
 * Platinum requires ~3 years of consistent contributions (not purchasable / not forceable).
 */

export type IdentityLevelKey = "bronze" | "silver" | "gold" | "platinum";

export interface ActivityMonth {
  month: string; // YYYY-MM
  deposits: number;
  contributions: number;
}

export interface ProgressionMetrics {
  accountAgeDays: number;
  depositCount: number;
  contributionCount: number;
  signupBonus: number;
  activeMonths: number;
  monthsSinceFirstActivity: number;
  activeLast12Months: number;
  regularityPct: number;
}

export interface PlatinumRequirement {
  label: string;
  met: boolean;
  current: string;
  required: string;
}

export interface ProgressionResult {
  activityPoints: number;
  displayScore: number;
  scoreMax: number;
  level: string;
  level_key: IdentityLevelKey;
  level_color: string;
  next_level: string | null;
  points_to_next: number;
  progress_within_level_pct: number;
  platinum_eligible: boolean;
  platinum_requirements: PlatinumRequirement[];
  metrics: ProgressionMetrics;
}

const SIGNUP_BONUS = 5;
const PLATINUM_MIN_AGE_DAYS = 1095; // 3 years
const PLATINUM_MIN_ACTIVE_MONTHS = 30;
const PLATINUM_MIN_LAST_12 = 10;
const PLATINUM_MIN_REGULARITY = 60;

const TIER_RANGES: Record<IdentityLevelKey, { label: string; color: string; min: number; max: number; next: string | null }> = {
  bronze: { label: "Bronze", color: "#CD7F32", min: 0, max: 24, next: "Argent" },
  silver: { label: "Argent", color: "#8B9EB0", min: 25, max: 74, next: "Or" },
  gold: { label: "Or", color: "#D4AF37", min: 75, max: 199, next: "Platinum" },
  platinum: { label: "Platinum", color: "#8B5CF6", min: 200, max: 99999, next: null },
};

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function buildActivityMonths(
  deposits: { created_at: string }[],
  contributions: { created_at: string }[],
): ActivityMonth[] {
  const map = new Map<string, ActivityMonth>();
  const touch = (iso: string, field: "deposits" | "contributions") => {
    const m = monthKey(iso);
    const row = map.get(m) ?? { month: m, deposits: 0, contributions: 0 };
    row[field] += 1;
    map.set(m, row);
  };
  for (const d of deposits) touch(d.created_at, "deposits");
  for (const c of contributions) touch(c.created_at, "contributions");
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function platinumGates(metrics: ProgressionMetrics): { eligible: boolean; requirements: PlatinumRequirement[] } {
  const requirements: PlatinumRequirement[] = [
    {
      label: "Ancienneté du compte",
      met: metrics.accountAgeDays >= PLATINUM_MIN_AGE_DAYS,
      current: `${Math.floor(metrics.accountAgeDays / 365)} an(s)`,
      required: "3 ans minimum",
    },
    {
      label: "Mois avec cotisations réelles",
      met: metrics.activeMonths >= PLATINUM_MIN_ACTIVE_MONTHS,
      current: `${metrics.activeMonths} mois`,
      required: `${PLATINUM_MIN_ACTIVE_MONTHS} mois minimum`,
    },
    {
      label: "Régularité sur 12 derniers mois",
      met: metrics.activeLast12Months >= PLATINUM_MIN_LAST_12,
      current: `${metrics.activeLast12Months}/12 mois`,
      required: `${PLATINUM_MIN_LAST_12}/12 mois actifs`,
    },
    {
      label: "Taux de régularité global",
      met: metrics.regularityPct >= PLATINUM_MIN_REGULARITY,
      current: `${metrics.regularityPct}%`,
      required: `${PLATINUM_MIN_REGULARITY}% minimum`,
    },
  ];
  return { eligible: requirements.every((r) => r.met), requirements };
}

function tierForActivityPoints(activityPoints: number, platinumEligible: boolean): IdentityLevelKey {
  if (activityPoints >= 200 && platinumEligible) return "platinum";
  if (activityPoints >= 75) return "gold";
  if (activityPoints >= 25) return "silver";
  return "bronze";
}

export function computeProgression(input: {
  createdAt: string;
  savingsDeposits: { created_at: string }[];
  tontineContributions: { created_at: string }[];
  walletTopups?: { created_at: string }[];
}): ProgressionResult {
  const now = Date.now();
  const createdMs = new Date(input.createdAt).getTime();
  const accountAgeDays = Math.max(0, Math.floor((now - createdMs) / 86400000));

  const depositCount = input.savingsDeposits.length + (input.walletTopups?.length ?? 0);
  const contributionCount = input.tontineContributions.length;
  const activityPoints = SIGNUP_BONUS + depositCount + contributionCount;

  const months = buildActivityMonths(
    [...input.savingsDeposits, ...(input.walletTopups ?? [])],
    input.tontineContributions,
  );
  const activeMonths = months.length;
  const firstActivity = months[0]?.month ?? null;
  const monthsSinceFirst = firstActivity
    ? Math.max(1, (new Date().getFullYear() - parseInt(firstActivity.slice(0, 4), 10)) * 12
        + (new Date().getMonth() + 1) - parseInt(firstActivity.slice(5, 7), 10) + 1)
    : 0;
  const regularityPct = monthsSinceFirst > 0
    ? Math.min(100, Math.round((activeMonths / monthsSinceFirst) * 100))
    : 0;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 11);
  const cutoffKey = monthKey(cutoff.toISOString());
  const activeLast12Months = months.filter((m) => m.month >= cutoffKey).length;

  const metrics: ProgressionMetrics = {
    accountAgeDays,
    depositCount,
    contributionCount,
    signupBonus: SIGNUP_BONUS,
    activeMonths,
    monthsSinceFirstActivity: monthsSinceFirst,
    activeLast12Months,
    regularityPct,
  };

  const { eligible: platinumEligible, requirements } = platinumGates(metrics);
  const levelKey = tierForActivityPoints(activityPoints, platinumEligible);
  const tier = TIER_RANGES[levelKey];

  const seniorityPts = Math.min(120, Math.floor(accountAgeDays / 365) * 15);
  const regularityPts = Math.min(250, activeMonths * 4);
  const displayScore = Math.min(1000, Math.round((activityPoints * 1.5) + seniorityPts + regularityPts));

  const [lo, hi] = [tier.min, tier.max];
  const progressPct = hi > lo ? Math.min(100, ((activityPoints - lo) / (hi - lo)) * 100) : 100;
  const nextPts = tier.next ? (levelKey === "gold" && !platinumEligible ? 200 : TIER_RANGES[
    levelKey === "bronze" ? "silver" : levelKey === "silver" ? "gold" : "platinum"
  ].min) : 0;

  return {
    activityPoints,
    displayScore,
    scoreMax: 1000,
    level: tier.label,
    level_key: levelKey,
    level_color: tier.color,
    next_level: tier.next,
    points_to_next: tier.next ? Math.max(0, nextPts - activityPoints) : 0,
    progress_within_level_pct: Math.max(0, progressPct),
    platinum_eligible: platinumEligible,
    platinum_requirements: requirements,
    metrics,
  };
}

/** Trust gauge level labels aligned with slow display score. */
export function trustLevelFromScore(score: number, platinumEligible: boolean): { level: string; color: string; risk: string } {
  if (score >= 600 && platinumEligible) return { level: "Platinum", color: "#8B5CF6", risk: "Très faible" };
  if (score >= 300) return { level: "Or", color: "#D4AF37", risk: "Faible" };
  if (score >= 120) return { level: "Argent", color: "#8B9EB0", risk: "Modéré" };
  return { level: "Bronze", color: "#CD7F32", risk: "Standard" };
}
