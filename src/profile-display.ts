import { getSupabase } from "@/src/supabase";

export type ProfileDisplay = {
  full_name: string;
  kyc_verified: boolean;
};

export function isKycVerified(status?: string | null): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "approved" || s === "verified";
}

/** Resolve display names + KYC without PostgREST profiles embed (no FK required). */
export async function profileDisplayMap(userIds: string[]): Promise<Map<string, ProfileDisplay>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await getSupabase()
    .from("profiles")
    .select("id, full_name, kyc_status")
    .in("id", unique);
  return new Map(
    (data ?? []).map((p: { id: string; full_name: string | null; kyc_status?: string | null }) => [
      p.id,
      {
        full_name: p.full_name ?? "—",
        kyc_verified: isKycVerified(p.kyc_status),
      },
    ]),
  );
}

export function profileFromMap(map: Map<string, ProfileDisplay>, userId: string): ProfileDisplay {
  return map.get(userId) ?? { full_name: "—", kyc_verified: false };
}
