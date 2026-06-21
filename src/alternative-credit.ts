/**
 * Alternative credit scoring — signals beyond traditional bureau data.
 * Mobile money velocity, social trust (tontines), repayment discipline, digital identity.
 */
import { scoreRegularity, scoreKyc } from "@/src/credit-score";
import { getRegionalProfile, toReferenceXaf, type RegionalProfile } from "@/src/regional-credit";
import type { Currency } from "@/src/exchange-rates";

export interface AlternativeSignals {
  mobile_velocity: number;      // 0–80
  social_trust: number;         // 0–80
  repayment_discipline: number; // 0–80
  digital_identity: number;   // 0–60
}

export interface AlternativeCreditResult {
  alternative_score: number;    // 0–300 sum of signals
  signals: AlternativeSignals;
  regional: RegionalProfile;
  composite_score: number;      // min(1000, base + alt * 0.25)
  model_version: string;
}

export interface AlternativeInput {
  country: string | null | undefined;
  createdAt: string;
  kycStatus: string | null;
  contributions: { created_at: string; amount?: number }[];
  savingsTotalLocal: number;
  savingsCurrency: Currency;
  walletTopups: { created_at: string; amount_xaf?: number }[];
  groupsJoined: number;
  groupsCreated: number;
  tontineCyclesCompleted: number;
  infractionCount: number;
  baseScore: number;
  memberSince: string;
  contributionFrequencyDays?: number;
}

/** Mobile money usage pattern — proxy for income stability */
export function scoreMobileVelocity(topups: AlternativeInput["walletTopups"]): number {
  if (topups.length === 0) return 0;
  const now = Date.now();
  const last90 = topups.filter(t => now - new Date(t.created_at).getTime() < 90 * 86400000);
  const last30 = topups.filter(t => now - new Date(t.created_at).getTime() < 30 * 86400000);
  const regularity = Math.min(40, last90.length * 8);
  const recency = Math.min(40, last30.length * 15);
  return Math.round(Math.min(80, regularity + recency));
}

/** Social collateral — tontine network depth and creator status */
export function scoreSocialTrust(
  groupsJoined: number,
  groupsCreated: number,
  cyclesCompleted: number,
  infractions: number,
): number {
  const network = Math.min(40, groupsJoined * 8 + groupsCreated * 15);
  const reliability = Math.min(40, cyclesCompleted * 10);
  const penalty = Math.min(40, infractions * 20);
  return Math.round(Math.max(0, Math.min(80, network + reliability - penalty)));
}

/** On-time contribution ratio */
export function scoreRepaymentDiscipline(
  contributions: AlternativeInput["contributions"],
  memberSince: string,
  frequencyDays = 30,
): number {
  return Math.round(scoreRegularity(contributions, memberSince, frequencyDays) / 350 * 80);
}

/** KYC + account maturity */
export function scoreDigitalIdentity(kycStatus: string | null, createdAt: string): number {
  const kycPts = scoreKyc(kycStatus) / 100 * 35;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const months = ageMs / (30 * 86400000);
  const maturity = Math.min(25, months * 2);
  return Math.round(Math.min(60, kycPts + maturity));
}

export function computeAlternativeCredit(input: AlternativeInput): AlternativeCreditResult {
  const regional = getRegionalProfile(input.country);
  const savingsXaf = toReferenceXaf(input.savingsTotalLocal, input.savingsCurrency);
  const plateau = regional.savings_plateau_local;
  const normalizedSavings = input.savingsCurrency === regional.local_currency
    ? input.savingsTotalLocal
    : savingsXaf;

  const signals: AlternativeSignals = {
    mobile_velocity: scoreMobileVelocity(input.walletTopups),
    social_trust: scoreSocialTrust(
      input.groupsJoined,
      input.groupsCreated,
      input.tontineCyclesCompleted,
      input.infractionCount,
    ),
    repayment_discipline: scoreRepaymentDiscipline(
      input.contributions,
      input.memberSince,
      input.contributionFrequencyDays ?? 30,
    ),
    digital_identity: scoreDigitalIdentity(input.kycStatus, input.createdAt),
  };

  const alternative_score = Math.min(
    300,
    signals.mobile_velocity + signals.social_trust + signals.repayment_discipline + signals.digital_identity,
  );

  const composite_score = Math.min(1000, Math.round(input.baseScore + alternative_score * 0.25));

  return {
    alternative_score,
    signals,
    regional,
    composite_score,
    model_version: "hodix-alt-v1",
  };
}

/** Region-adjusted savings score using local plateau */
export function scoreSavingsVolumeRegional(amountLocal: number, regional: RegionalProfile): number {
  if (amountLocal <= 0) return 0;
  const refXaf = toReferenceXaf(amountLocal, regional.local_currency);
  const maxXaf = toReferenceXaf(regional.savings_plateau_local, regional.local_currency);
  const ratio = Math.log1p(refXaf) / Math.log1p(maxXaf);
  return Math.round(Math.min(250, ratio * 250));
}
