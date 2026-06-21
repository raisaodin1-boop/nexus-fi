import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";

export interface CollectiveGoal {
  id: string;
  name: string;
  description: string | null;
  target_amount: number;
  current_amount: number;
  progress_pct: number;
  deadline: string | null;
  creator_id: string;
  creator_name: string;
  members_count: number;
  is_completed: boolean;
  created_at: string;
}

export interface CollectiveContribution {
  id: string;
  goal_id: string;
  user_id: string;
  full_name: string;
  amount: number;
  created_at: string;
}

export async function createCollectiveGoal(params: {
  name: string;
  description?: string;
  target_amount: number;
  deadline?: string;
}): Promise<CollectiveGoal> {
  const me = await uid();
  const sb = getSupabase();

  const { data, error } = await sb
    .from("collective_goals")
    .insert({
      name: params.name.trim(),
      description: params.description?.trim() ?? null,
      target_amount: params.target_amount,
      deadline: params.deadline ?? null,
      creator_id: me,
      current_amount: 0,
    })
    .select("*")
    .single();
  throwSb(error);

  await sb.from("collective_goal_members").insert({ goal_id: data.id, user_id: me });

  return mapGoal(data, "Moi", 1);
}

export async function listCollectiveGoals(): Promise<CollectiveGoal[]> {
  const me = await uid();
  const sb = getSupabase();

  const { data: memberships } = await sb
    .from("collective_goal_members")
    .select("goal_id")
    .eq("user_id", me);

  const goalIds = (memberships ?? []).map((m: any) => m.goal_id);
  if (!goalIds.length) return [];

  const { data: goals } = await sb
    .from("collective_goals")
    .select("*, profiles!creator_id(full_name), collective_goal_members(count)")
    .in("id", goalIds)
    .order("created_at", { ascending: false });

  return (goals ?? []).map((g: any) =>
    mapGoal(g, g.profiles?.full_name ?? "?", g.collective_goal_members?.[0]?.count ?? 1),
  );
}

export async function getCollectiveGoal(id: string): Promise<{ goal: CollectiveGoal; contributions: CollectiveContribution[] }> {
  const sb = getSupabase();

  const [goalRes, contribRes] = await Promise.all([
    sb.from("collective_goals")
      .select("*, profiles!creator_id(full_name), collective_goal_members(count)")
      .eq("id", id)
      .single(),
    sb.from("collective_goal_contributions")
      .select("id, goal_id, user_id, amount, created_at, profiles(full_name)")
      .eq("goal_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  throwSb(goalRes.error);

  const goal = mapGoal(
    goalRes.data,
    goalRes.data.profiles?.full_name ?? "?",
    goalRes.data.collective_goal_members?.[0]?.count ?? 1,
  );

  const contributions: CollectiveContribution[] = (contribRes.data ?? []).map((c: any) => ({
    id: c.id,
    goal_id: c.goal_id,
    user_id: c.user_id,
    full_name: c.profiles?.full_name ?? "Membre",
    amount: Number(c.amount),
    created_at: c.created_at,
  }));

  return { goal, contributions };
}

export async function contributeToCollectiveGoal(goalId: string, amount: number): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Montant invalide.");
  const me = await uid();
  const sb = getSupabase();

  const { error } = await sb.from("collective_goal_contributions").insert({
    goal_id: goalId,
    user_id: me,
    amount,
  });
  throwSb(error);

  const { data: goal } = await sb.from("collective_goals").select("current_amount, target_amount").eq("id", goalId).single();
  const newAmount = Number(goal?.current_amount ?? 0) + amount;
  const isCompleted = newAmount >= Number(goal?.target_amount ?? 0);

  await sb.from("collective_goals").update({
    current_amount: newAmount,
    is_completed: isCompleted,
  }).eq("id", goalId);
}

export async function joinCollectiveGoal(goalId: string): Promise<void> {
  const me = await uid();
  const { error } = await getSupabase().from("collective_goal_members").upsert(
    { goal_id: goalId, user_id: me },
    { onConflict: "goal_id,user_id" },
  );
  throwSb(error);
}

function mapGoal(g: any, creatorName: string, membersCount: number): CollectiveGoal {
  const current = Number(g.current_amount ?? 0);
  const target = Number(g.target_amount ?? 1);
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    target_amount: target,
    current_amount: current,
    progress_pct: Math.min(100, Math.round((current / target) * 100)),
    deadline: g.deadline,
    creator_id: g.creator_id,
    creator_name: creatorName,
    members_count: Number(membersCount),
    is_completed: !!g.is_completed,
    created_at: g.created_at,
  };
}
