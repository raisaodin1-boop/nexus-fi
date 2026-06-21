import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";
import { notifyUser } from "./notifications";

export type CollectiveGoalType = "standard" | "emergency";
export type FundEventType = "mariage" | "deuil" | "urgence" | "autre";
export type FundRequestStatus = "pending" | "approved" | "rejected" | "released";

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
  goal_type: CollectiveGoalType;
  vote_threshold_pct: number;
  created_at: string;
}

export interface CollectiveContribution {
  id: string;
  goal_id: string;
  user_id: string;
  full_name: string;
  amount: number;
  is_anonymous: boolean;
  created_at: string;
}

export interface FundRequest {
  id: string;
  goal_id: string;
  requester_id: string;
  requester_name: string;
  amount: number;
  reason: string;
  event_type: FundEventType;
  status: FundRequestStatus;
  votes_yes: number;
  votes_no: number;
  threshold: number;
  approval_pct: number;
  created_at: string;
}

export async function createCollectiveGoal(params: {
  name: string;
  description?: string;
  target_amount: number;
  deadline?: string;
  goal_type?: CollectiveGoalType;
  vote_threshold_pct?: number;
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
      goal_type: params.goal_type ?? "standard",
      vote_threshold_pct: params.vote_threshold_pct ?? 60,
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
    .select("*")
    .in("id", goalIds)
    .order("created_at", { ascending: false });

  const creatorIds = [...new Set((goals ?? []).map((g: any) => g.creator_id))];
  const { data: profiles } = await sb.from("profiles").select("id, full_name").in("id", creatorIds);
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name ?? "?"]));

  const counts = await Promise.all(
    goalIds.map(async (gid) => {
      const { count } = await sb.from("collective_goal_members").select("*", { count: "exact", head: true }).eq("goal_id", gid);
      return [gid, count ?? 1] as const;
    }),
  );
  const memberCounts = Object.fromEntries(counts);

  return (goals ?? []).map((g: any) =>
    mapGoal(g, names[g.creator_id] ?? "?", memberCounts[g.id] ?? 1),
  );
}

export async function getCollectiveGoal(id: string): Promise<{
  goal: CollectiveGoal;
  contributions: CollectiveContribution[];
  requests: FundRequest[];
}> {
  const sb = getSupabase();

  const [goalRes, contribRes, requests] = await Promise.all([
    sb.from("collective_goals").select("*").eq("id", id).single(),
    sb.from("collective_goal_contributions")
      .select("id, goal_id, user_id, amount, is_anonymous, created_at")
      .eq("goal_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    listFundRequests(id),
  ]);

  throwSb(goalRes.error);

  const { data: creator } = await sb.from("profiles").select("full_name").eq("id", goalRes.data.creator_id).maybeSingle();
  const { count: membersCount } = await sb.from("collective_goal_members").select("*", { count: "exact", head: true }).eq("goal_id", id);

  const goal = mapGoal(goalRes.data, creator?.full_name ?? "?", membersCount ?? 1);

  const userIds = [...new Set((contribRes.data ?? []).map((c: any) => c.user_id))];
  const { data: profiles } = userIds.length
    ? await sb.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name ?? "Membre"]));

  const contributions: CollectiveContribution[] = (contribRes.data ?? []).map((c: any) => ({
    id: c.id,
    goal_id: c.goal_id,
    user_id: c.user_id,
    full_name: c.is_anonymous ? "Anonyme" : (names[c.user_id] ?? "Membre"),
    amount: Number(c.amount),
    is_anonymous: !!c.is_anonymous,
    created_at: c.created_at,
  }));

  return { goal, contributions, requests };
}

export async function contributeToCollectiveGoal(
  goalId: string,
  amount: number,
  isAnonymous = false,
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Montant invalide.");
  const me = await uid();
  const sb = getSupabase();

  const { error } = await sb.from("collective_goal_contributions").insert({
    goal_id: goalId,
    user_id: me,
    amount,
    is_anonymous: isAnonymous,
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

export async function requestFundRelease(params: {
  goalId: string;
  amount: number;
  reason: string;
  event_type?: FundEventType;
}): Promise<FundRequest> {
  const me = await uid();
  const sb = getSupabase();

  const { data: goal } = await sb.from("collective_goals").select("*").eq("id", params.goalId).single();
  if (!goal) throw new Error("Caisse introuvable.");
  if (goal.goal_type !== "emergency") throw new Error("Les demandes de déblocage sont réservées aux caisses secours.");
  if (Number(params.amount) > Number(goal.current_amount)) {
    throw new Error("Montant supérieur au solde disponible.");
  }

  const { data, error } = await sb.from("collective_fund_requests").insert({
    goal_id: params.goalId,
    requester_id: me,
    amount: params.amount,
    reason: params.reason.trim(),
    event_type: params.event_type ?? "urgence",
    status: "pending",
  }).select("*").single();
  throwSb(error);

  const { data: members } = await sb.from("collective_goal_members").select("user_id").eq("goal_id", params.goalId);
  for (const m of members ?? []) {
    if (m.user_id === me) continue;
    await notifyUser({
      user_id: m.user_id,
      title: "🗳️ Vote caisse secours",
      body: `Nouvelle demande de ${Number(params.amount).toLocaleString("fr-FR")} XAF — « ${params.reason.slice(0, 60)} »`,
      type: "fund_request",
      metadata: { goal_id: params.goalId, request_id: data.id },
    });
  }

  return (await listFundRequests(params.goalId)).find((r) => r.id === data.id)!;
}

export async function voteFundRequest(requestId: string, approve: boolean): Promise<FundRequest> {
  const me = await uid();
  const sb = getSupabase();

  const { data: req } = await sb.from("collective_fund_requests").select("*").eq("id", requestId).single();
  if (!req) throw new Error("Demande introuvable.");
  if (req.status !== "pending") throw new Error("Cette demande n'est plus en vote.");

  const { error } = await sb.from("collective_fund_votes").upsert(
    { request_id: requestId, voter_id: me, approve },
    { onConflict: "request_id,voter_id" },
  );
  throwSb(error);

  const updated = await refreshFundRequestStatus(requestId);
  return updated;
}

export async function releaseFundRequest(requestId: string): Promise<void> {
  const me = await uid();
  const sb = getSupabase();

  const { data: req } = await sb.from("collective_fund_requests").select("*, collective_goals(creator_id, current_amount)").eq("id", requestId).single();
  if (!req) throw new Error("Demande introuvable.");
  const goal = (req as any).collective_goals;
  if (goal.creator_id !== me) throw new Error("Seul le créateur peut libérer les fonds.");
  if (req.status !== "approved") throw new Error("La demande doit être approuvée par vote avant libération.");

  const newBalance = Math.max(0, Number(goal.current_amount) - Number(req.amount));
  await sb.from("collective_goals").update({ current_amount: newBalance }).eq("id", req.goal_id);
  await sb.from("collective_fund_requests").update({
    status: "released",
    released_at: new Date().toISOString(),
  }).eq("id", requestId);

  await notifyUser({
    user_id: req.requester_id,
    title: "✅ Fonds libérés",
    body: `Votre demande de ${Number(req.amount).toLocaleString("fr-FR")} XAF a été débloquée.`,
    type: "fund_released",
    metadata: { request_id: requestId, goal_id: req.goal_id },
  });
}

async function refreshFundRequestStatus(requestId: string): Promise<FundRequest> {
  const sb = getSupabase();
  const { data: req } = await sb.from("collective_fund_requests").select("*").eq("id", requestId).single();
  if (!req) throw new Error("Demande introuvable.");

  const { data: votes } = await sb.from("collective_fund_votes").select("approve").eq("request_id", requestId);
  const yes = (votes ?? []).filter((v) => v.approve).length;
  const no = (votes ?? []).filter((v) => !v.approve).length;

  const { count: memberCount } = await sb.from("collective_goal_members").select("*", { count: "exact", head: true }).eq("goal_id", req.goal_id);
  const { data: goal } = await sb.from("collective_goals").select("vote_threshold_pct").eq("id", req.goal_id).single();
  const threshold = Math.ceil(((memberCount ?? 1) * (goal?.vote_threshold_pct ?? 60)) / 100);
  const approvalPct = memberCount ? Math.round((yes / (memberCount ?? 1)) * 100) : 0;

  let status = req.status as FundRequestStatus;
  if (status === "pending") {
    if (yes >= threshold) status = "approved";
    else if (no > (memberCount ?? 1) - threshold) status = "rejected";
    if (status !== req.status) {
      await sb.from("collective_fund_requests").update({ status }).eq("id", requestId);
    }
  }

  const list = await listFundRequests(req.goal_id);
  return list.find((r) => r.id === requestId)!;
}

export async function listFundRequests(goalId: string): Promise<FundRequest[]> {
  const sb = getSupabase();
  const { data: requests } = await sb.from("collective_fund_requests")
    .select("*")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false });

  if (!requests?.length) return [];

  const requesterIds = [...new Set(requests.map((r) => r.requester_id))];
  const { data: profiles } = await sb.from("profiles").select("id, full_name").in("id", requesterIds);
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name ?? "Membre"]));

  const { count: memberCount } = await sb.from("collective_goal_members").select("*", { count: "exact", head: true }).eq("goal_id", goalId);
  const { data: goal } = await sb.from("collective_goals").select("vote_threshold_pct").eq("id", goalId).single();
  const threshold = Math.ceil(((memberCount ?? 1) * (goal?.vote_threshold_pct ?? 60)) / 100);

  const results: FundRequest[] = [];
  for (const req of requests) {
    const { data: votes } = await sb.from("collective_fund_votes").select("approve").eq("request_id", req.id);
    const yes = (votes ?? []).filter((v) => v.approve).length;
    const no = (votes ?? []).filter((v) => !v.approve).length;
    const approvalPct = memberCount ? Math.round((yes / (memberCount ?? 1)) * 100) : 0;
    results.push({
      id: req.id,
      goal_id: req.goal_id,
      requester_id: req.requester_id,
      requester_name: names[req.requester_id] ?? "Membre",
      amount: Number(req.amount),
      reason: req.reason,
      event_type: req.event_type as FundEventType,
      status: req.status as FundRequestStatus,
      votes_yes: yes,
      votes_no: no,
      threshold,
      approval_pct: approvalPct,
      created_at: req.created_at,
    });
  }
  return results;
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
    goal_type: (g.goal_type ?? "standard") as CollectiveGoalType,
    vote_threshold_pct: Number(g.vote_threshold_pct ?? 60),
    created_at: g.created_at,
  };
}
