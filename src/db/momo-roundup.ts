import { getSupabase } from "@/src/supabase";
import { uid, cached, invalidateCache, throwSb } from "./helpers";
import type { RoundUpIncrement } from "@/src/momo-roundup";

export interface MomoRoundUpSettings {
  enabled: boolean;
  increment: RoundUpIncrement;
  goal_id: string | null;
  goal_name?: string | null;
}

export interface MomoRoundUpEvent {
  id: string;
  topup_amount: number;
  roundup_amount: number;
  increment_used: number;
  created_at: string;
  goal_id: string | null;
}

export async function getMomoRoundUpSettings(): Promise<MomoRoundUpSettings> {
  const me = await uid();
  return cached(`momo-roundup-${me}`, 30_000, async () => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("profiles")
      .select("momo_roundup_enabled, momo_roundup_increment, momo_roundup_goal_id")
      .eq("id", me)
      .single();
    throwSb(error);

    let goalName: string | null = null;
    const goalId = (data as any)?.momo_roundup_goal_id ?? null;
    if (goalId) {
      const { data: goal } = await sb.from("savings_goals").select("name").eq("id", goalId).maybeSingle();
      goalName = goal?.name ?? null;
    }

    const rawInc = Number((data as any)?.momo_roundup_increment ?? 500);
    const increment = ([100, 500, 1000] as const).includes(rawInc as RoundUpIncrement)
      ? (rawInc as RoundUpIncrement)
      : 500;

    return {
      enabled: !!(data as any)?.momo_roundup_enabled,
      increment,
      goal_id: goalId,
      goal_name: goalName,
    };
  });
}

export async function updateMomoRoundUpSettings(payload: {
  enabled?: boolean;
  increment?: RoundUpIncrement;
  goal_id?: string | null;
}) {
  const me = await uid();
  const sb = getSupabase();

  if (payload.goal_id) {
    const { data: goal } = await sb
      .from("savings_goals")
      .select("id")
      .eq("id", payload.goal_id)
      .eq("user_id", me)
      .eq("is_active", true)
      .maybeSingle();
    if (!goal) throw { status: 400, detail: "Objectif d'épargne introuvable." };
  }

  const patch: Record<string, unknown> = {};
  if (payload.enabled !== undefined) patch.momo_roundup_enabled = payload.enabled;
  if (payload.increment !== undefined) patch.momo_roundup_increment = payload.increment;
  if (payload.goal_id !== undefined) patch.momo_roundup_goal_id = payload.goal_id;

  const { error } = await sb.from("profiles").update(patch).eq("id", me);
  throwSb(error);
  invalidateCache(`momo-roundup-${me}`);
  return getMomoRoundUpSettings();
}

export async function listMomoRoundUpEvents(limit = 20): Promise<MomoRoundUpEvent[]> {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("momo_roundup_events")
    .select("id, topup_amount, roundup_amount, increment_used, created_at, goal_id")
    .eq("user_id", me)
    .order("created_at", { ascending: false })
    .limit(limit);
  throwSb(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    topup_amount: Number(r.topup_amount),
    roundup_amount: Number(r.roundup_amount),
    increment_used: Number(r.increment_used),
    created_at: r.created_at,
    goal_id: r.goal_id,
  }));
}
