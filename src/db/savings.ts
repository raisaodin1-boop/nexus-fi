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
  const me = await uid();
  const sb = getSupabase();
  const { data: goal, error } = await sb
    .from("savings_goals")
    .select("*")
    .eq("id", id)
    .eq("user_id", me)
    .single();
  throwSb(error);

  const { data: txs, error: txErr } = await sb
    .from("savings_transactions")
    .select("id, amount, note, type, created_at")
    .eq("goal_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  throwSb(txErr);

  const transactions = (txs ?? []).map((t: any) => {
    const amount = Number(t.amount ?? 0);
    const rawType = String(t.type ?? "").toLowerCase();
    const note = String(t.note ?? "").toLowerCase();
    const isWithdraw =
      rawType === "withdraw"
      || rawType === "withdrawal"
      || amount < 0
      || note.includes("retrait")
      || note.includes("withdraw");
    return {
      id: t.id as string,
      amount: Math.abs(amount),
      direction: isWithdraw ? "out" as const : "in" as const,
      type: isWithdraw ? "withdraw" : "deposit",
      note: t.note as string | null,
      created_at: t.created_at as string,
    };
  });

  return { goal, transactions };
}

export async function createSaving(body: Record<string, any>) {
  const me = await uid();
  const sb = getSupabase();
  const insertBody: Record<string, any> = { ...body, user_id: me, current_amount: 0 };

  if (body.guardian_phone_or_email && body.savings_type === "locked") {
    const search = String(body.guardian_phone_or_email).trim();
    const isEmail = search.includes("@");
    const { data: guardianRows } = isEmail
      ? await sb.rpc("lookup_profile_by_email", { p_email: search.toLowerCase() })
      : await sb.rpc("lookup_profile_by_phone", { p_phone: search });
    const guardian = (guardianRows as { id: string }[] | null)?.[0];
    if (guardian?.id && guardian.id !== me) {
      insertBody.lock_guardian_id = guardian.id;
    }
    delete insertBody.guardian_phone_or_email;
  }

  const { data, error } = await sb
    .from("savings_goals").insert(insertBody).select().single();
  throwSb(error);
  invalidateCache(`savings-${me}`);
  return data;
}

export async function depositSaving(id: string, amount: number, note?: string, paymentId?: string) {
  const me = await uid();
  const sb = getSupabase();

  if (paymentId) {
    const { error } = await sb.rpc("savings_deposit_paid", {
      p_goal_id: id,
      p_amount: amount,
      p_payment_id: paymentId,
      p_note: note ?? "Dépôt CinetPay",
    });
    throwSb(error);
  } else {
    throw { status: 403, detail: "Paiement électronique requis pour un dépôt d'épargne." };
  }

  await addIdentityEvent(me, "savings_deposit", 1);
  invalidateCache(`savings-${me}`);
  invalidateCache(`savings-summary-${me}`);
  invalidateCache(`credit-score-${me}`);
  invalidateCache(`identity-${me}`);
  return { detail: "Dépôt enregistré" };
}

export async function savingsGoalTransaction(
  goalId: string,
  body: { amount?: number; kind?: "withdraw" | "deposit"; early?: boolean },
) {
  const me = await uid();
  const amount = Math.abs(Number(body.amount ?? 0));
  const kind = body.kind ?? "deposit";
  if (amount <= 0) throw { status: 400, detail: "Montant invalide." };

  if (kind === "deposit") {
    throw {
      status: 403,
      detail: "Dépôt électronique requis. Utilisez la page de paiement — aucun crédit sans débit confirmé.",
    };
  }

  const { data, error } = await getSupabase().rpc("savings_withdraw_goal", {
    p_goal_id: goalId,
    p_amount: amount,
    p_early: !!body.early,
  });
  if (error) {
    throw { status: 400, detail: error.message };
  }

  invalidateCache(`savings-${me}`);
  invalidateCache(`savings-summary-${me}`);
  return data ?? { detail: "Retrait enregistré" };
}

export async function grantSavingsEarlyUnlock(goalId: string) {
  const me = await uid();
  const { error } = await getSupabase().rpc("savings_grant_early_unlock", {
    p_goal_id: goalId,
  });
  if (error) throw { status: 403, detail: error.message };
  invalidateCache(`savings-${me}`);
  return { detail: "Déblocage anticipé approuvé pour 48 h." };
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
