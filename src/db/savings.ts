import { getSupabase } from "@/src/supabase";
import { uid, cached, invalidateCache, throwSb } from "./helpers";
import { addIdentityEvent } from "./identity";
import { analyzePattern, predictGoal, buildPeerStats, buildMonthlyHistogram } from "@/src/savings-ai";

export async function getSavingsSummary() {
  const me = await uid();
  return cached(`savings-summary-${me}`, 60_000, async () => {
    const { data } = await getSupabase()
      .from("savings_goals").select("current_amount, target_amount, is_active").eq("user_id", me).eq("is_active", true);
    const goals = data ?? [];
    const total_saved = goals.reduce((s: number, g: any) => s + Number(g.current_amount), 0);
    const total_target = goals.reduce((s: number, g: any) => s + Number(g.target_amount), 0);
    const progress_pct = total_target > 0 ? Math.round((total_saved / total_target) * 100) : 0;
    return { total_saved, total_target, active_goals: goals.length, progress_pct, currency: "XAF" };
  });
}

export async function listSavings() {
  const me = await uid();
  return cached(`savings-${me}`, 60_000, async () => {
    const { data, error } = await getSupabase()
      .from("savings_goals").select("*").eq("user_id", me).eq("is_active", true).order("created_at", { ascending: false });
    throwSb(error);
    return data ?? [];
  });
}

export async function getSaving(id: string) {
  const { data, error } = await getSupabase()
    .from("savings_goals").select("*, savings_transactions(*)").eq("id", id).single();
  throwSb(error);
  return data;
}

export async function createSaving(body: Record<string, any>) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("savings_goals").insert({ ...body, user_id: me, current_amount: 0 }).select().single();
  throwSb(error);
  invalidateCache(`savings-${me}`);
  return data;
}

export async function depositSaving(id: string, amount: number, note?: string) {
  const me = await uid();
  await getSupabase().from("savings_transactions").insert({ goal_id: id, user_id: me, amount, note });
  const { data: txs } = await getSupabase().from("savings_transactions").select("amount").eq("goal_id", id);
  const total = (txs ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
  await getSupabase().from("savings_goals").update({ current_amount: total }).eq("id", id);
  await addIdentityEvent(me, "savings_deposit", 1);
  invalidateCache(`savings-${me}`);
  invalidateCache(`savings-summary-${me}`);
  invalidateCache(`credit-score-${me}`);
  invalidateCache(`identity-${me}`);
  return { detail: "Dépôt enregistré" };
}

export async function savingsGoalTransaction(
  goalId: string,
  body: { amount?: number; kind?: "withdraw" | "deposit" },
) {
  const me = await uid();
  const sb = getSupabase();
  const amount = Math.abs(Number(body.amount ?? 0));
  const kind = body.kind ?? "deposit";
  if (amount <= 0) throw { status: 400, detail: "Montant invalide." };

  const { data: goal } = await sb.from("savings_goals").select("current_amount").eq("id", goalId).eq("user_id", me).single();
  if (!goal) throw { status: 404, detail: "Objectif introuvable." };
  if (kind === "withdraw" && Number(goal.current_amount) < amount) {
    throw { status: 400, detail: "Solde insuffisant sur cet objectif." };
  }

  const signed = kind === "withdraw" ? -amount : amount;
  await sb.from("savings_transactions").insert({
    goal_id: goalId,
    user_id: me,
    amount: signed,
    note: kind === "withdraw" ? "Retrait" : "Dépôt",
  });

  const { data: txs } = await sb.from("savings_transactions").select("amount").eq("goal_id", goalId);
  const total = (txs ?? []).reduce((s, t) => s + Number(t.amount), 0);
  await sb.from("savings_goals").update({ current_amount: Math.max(0, total) }).eq("id", goalId);

  if (kind === "deposit") {
    await addIdentityEvent(me, "savings_deposit", 1);
    invalidateCache(`credit-score-${me}`);
    invalidateCache(`identity-${me}`);
  }

  invalidateCache(`savings-${me}`);
  invalidateCache(`savings-summary-${me}`);
  return { detail: kind === "withdraw" ? "Retrait enregistré" : "Dépôt enregistré" };
}

export async function getSavingsAnalytics(goalId: string) {
  const me = await uid();
  const sb = getSupabase();
  const [goalRes, txRes] = await Promise.all([
    sb.from("savings_goals").select("*").eq("id", goalId).eq("user_id", me).single(),
    sb.from("savings_transactions").select("amount, created_at").eq("goal_id", goalId).order("created_at", { ascending: true }),
  ]);
  if (goalRes.error || !goalRes.data) throw new Error("Objectif introuvable.");
  const goal = goalRes.data;
  const deposits = (txRes.data ?? []).map((t: any) => ({ amount: Number(t.amount), created_at: t.created_at as string }));
  const prediction = predictGoal(goal, deposits);
  const histogram = buildMonthlyHistogram(deposits, 6);
  const rangeMin = goal.target_amount * 0.5;
  const rangeMax = goal.target_amount * 2;
  const { data: peerGoals } = await sb
    .from("savings_goals").select("id, current_amount, created_at")
    .neq("user_id", me).gte("target_amount", rangeMin).lte("target_amount", rangeMax).eq("is_active", true).limit(100);
  const peerRates = (peerGoals ?? []).map((g: any) => {
    const ageMonths = Math.max(1, (Date.now() - new Date(g.created_at).getTime()) / (30 * 86400000));
    return { avg_monthly: Number(g.current_amount) / ageMonths };
  });
  const peerStats = buildPeerStats(prediction.pattern.avg_monthly_xaf, peerRates);
  return { goal, prediction, histogram, peer_stats: peerStats };
}

export async function getAllSavingsAnalytics() {
  const me = await uid();
  const { data: goals } = await getSupabase()
    .from("savings_goals").select("id, name, current_amount, target_amount, deadline, created_at, is_active")
    .eq("user_id", me).order("created_at", { ascending: false });
  if (!goals?.length) return [];
  const goalIds = goals.map((g: any) => g.id);
  const { data: allTxs } = await getSupabase()
    .from("savings_transactions").select("goal_id, amount, created_at").in("goal_id", goalIds).order("created_at", { ascending: true });
  const txsByGoal: Record<string, { amount: number; created_at: string }[]> = {};
  for (const tx of allTxs ?? []) {
    if (!txsByGoal[tx.goal_id]) txsByGoal[tx.goal_id] = [];
    txsByGoal[tx.goal_id].push({ amount: Number(tx.amount), created_at: tx.created_at });
  }
  return goals.map((g: any) => ({ goal: g, prediction: predictGoal(g, txsByGoal[g.id] ?? []) }));
}

export async function getSavingsSeries(days = 14) {
  const me = await uid();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await getSupabase()
    .from("savings_transactions").select("amount, created_at")
    .eq("user_id", me).gte("created_at", since).order("created_at", { ascending: true });
  const byDate: Record<string, number> = {};
  for (const tx of data ?? []) {
    const d = (tx.created_at as string).slice(0, 10);
    byDate[d] = (byDate[d] ?? 0) + Number(tx.amount);
  }
  return { days, series: Object.entries(byDate).map(([date, value]) => ({ date, value })) };
}
