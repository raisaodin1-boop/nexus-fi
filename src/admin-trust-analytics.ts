/**
 * Pure helpers for admin trust-score analytics (0–100 UI scale).
 * profiles.trust_score may be stored as 0–1000 or already 0–100.
 */

export type ScoreDistribution = {
  excellent: number;
  very_good: number;
  good: number;
  emerging: number;
  new: number;
};

export type TierDistribution = {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
};

/** Normalize raw trust_score to 0–100 for admin charts/KPIs. */
export function trustScoreToPct(raw: number | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 100) return Math.min(100, n / 10); // 0–1000 storage
  return Math.min(100, n);
}

export function buildTrustScoreAnalytics(scores: Array<number | null | undefined>): {
  score_distribution: ScoreDistribution;
  tier_distribution: TierDistribution;
  avg_trust_score: number;
} {
  const score_distribution: ScoreDistribution = {
    excellent: 0,
    very_good: 0,
    good: 0,
    emerging: 0,
    new: 0,
  };
  const tier_distribution: TierDistribution = {
    bronze: 0,
    silver: 0,
    gold: 0,
    platinum: 0,
  };

  let sum = 0;
  let count = 0;
  for (const raw of scores) {
    const pct = trustScoreToPct(raw);
    sum += pct;
    count += 1;

    if (pct >= 80) score_distribution.excellent += 1;
    else if (pct >= 60) score_distribution.very_good += 1;
    else if (pct >= 40) score_distribution.good += 1;
    else if (pct >= 20) score_distribution.emerging += 1;
    else score_distribution.new += 1;

    if (pct >= 81) tier_distribution.platinum += 1;
    else if (pct >= 61) tier_distribution.gold += 1;
    else if (pct >= 31) tier_distribution.silver += 1;
    else tier_distribution.bronze += 1;
  }

  return {
    score_distribution,
    tier_distribution,
    avg_trust_score: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
  };
}
