import { getSupabase } from "@/src/supabase";

export type PublicPlatformStats = {
  users_count: number;
  groups_count: number;
  savings_volume_xaf: number;
  participation_rate_pct: number | null;
  repayment_rate_pct: number | null;
};

const FALLBACK: PublicPlatformStats = {
  users_count: 12000,
  groups_count: 2400,
  savings_volume_xaf: 850_000_000,
  participation_rate_pct: 87,
  repayment_rate_pct: 96,
};

export async function getPublicPlatformStats(): Promise<PublicPlatformStats> {
  try {
    const { data, error } = await getSupabase().rpc("public_platform_stats");
    if (error || !data) return FALLBACK;
    const raw = data as Record<string, unknown>;
    return {
      users_count: Number(raw.users_count ?? FALLBACK.users_count),
      groups_count: Number(raw.groups_count ?? FALLBACK.groups_count),
      savings_volume_xaf: Number(raw.savings_volume_xaf ?? FALLBACK.savings_volume_xaf),
      participation_rate_pct: raw.participation_rate_pct != null
        ? Number(raw.participation_rate_pct) : FALLBACK.participation_rate_pct,
      repayment_rate_pct: raw.repayment_rate_pct != null
        ? Number(raw.repayment_rate_pct) : FALLBACK.repayment_rate_pct,
    };
  } catch {
    return FALLBACK;
  }
}

export function formatStatCount(n: number): string {
  if (n >= 1_000_000) {
    const m = Math.round(n / 100_000) / 10;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M+`;
  }
  if (n >= 10_000) return `${Math.round(n / 1000)}k+`;
  if (n >= 1000) return `${(Math.round(n / 100) / 10).toFixed(1).replace(".0", "")}k+`;
  return n > 0 ? `${n}+` : "—";
}

export function formatSavingsVolumeXaf(n: number): string {
  if (n >= 1_000_000) {
    const m = Math.round(n / 100_000) / 10;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M+ XAF`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)}k+ XAF`;
  return `${Math.round(n)} XAF`;
}

export function formatRatePct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}
