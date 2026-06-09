/**
 * HODIX — Supabase data layer (replaces FastAPI/MongoDB backend)
 * All data operations go through this module using the Supabase JS client.
 */
import { getSupabase } from "@/src/supabase";

/* ── helpers ─────────────────────────────────────────────── */

// uid() reads from local session storage — NO network round-trip
async function uid(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session?.user) throw { status: 401, detail: "Non authentifié" };
  return data.session.user.id;
}

// Simple in-memory cache with TTL
const _cache = new Map<string, { v: any; ts: number }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.v as T;
  const v = await fn();
  _cache.set(key, { v, ts: Date.now() });
  return v;
}
export function invalidateCache(prefix?: string) {
  if (!prefix) { _cache.clear(); return; }
  for (const k of _cache.keys()) if (k.startsWith(prefix)) _cache.delete(k);
}

function inviteCode(len = 6): string {
  return Math.random().toString(36).toUpperCase().slice(2, 2 + len);
}

function throwSb(error: any) {
  if (!error) return;
  throw { status: 400, detail: error.message ?? "Erreur Supabase" };
}

/* ── PROFILES ────────────────────────────────────────────── */

export async function getMe() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .eq("id", me)
    .single();
  throwSb(error);
  const { data: sbUser } = await getSupabase().auth.getUser();
  return {
    ...data,
    id: me,
    email: sbUser.user?.email ?? "",
    is_email_verified: !!sbUser.user?.email_confirmed_at,
  };
}

export async function updateMe(body: Record<string, any>) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("profiles")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", me)
    .select()
    .maybeSingle();
  throwSb(error);
  return data ?? { id: me, ...body };
}

/* ── TONTINES ────────────────────────────────────────────── */

export async function listTontines() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("tontine_members")
    .select("tontines(*, tontine_members(count))")
    .eq("user_id", me);
  throwSb(error);
  return (data ?? []).map((row: any) => {
    const t = row.tontines;
    return {
      ...t,
      members_count: t?.tontine_members?.[0]?.count ?? 0,
    };
  });
}

export async function getTontine(id: string) {
  const { data: tontine, error } = await getSupabase()
    .from("tontines")
    .select("*")
    .eq("id", id)
    .single();
  throwSb(error);

  const { data: members } = await getSupabase()
    .from("tontine_members")
    .select("*, profiles(full_name)")
    .eq("tontine_id", id);

  const { data: contributions } = await getSupabase()
    .from("tontine_contributions")
    .select("*, profiles(full_name)")
    .eq("tontine_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    tontine,
    members: (members ?? []).map((m: any) => ({
      ...m,
      full_name: m.profiles?.full_name ?? "—",
    })),
    contributions: (contributions ?? []).map((c: any) => ({
      ...c,
      full_name: c.profiles?.full_name ?? "—",
    })),
  };
}

export async function createTontine(body: Record<string, any>) {
  const me = await uid();
  const code = inviteCode();
  const { data, error } = await getSupabase()
    .from("tontines")
    .insert({ ...body, owner_id: me, invite_code: code })
    .select()
    .single();
  throwSb(error);
  // Owner becomes first member (admin)
  await getSupabase().from("tontine_members").insert({
    tontine_id: data.id, user_id: me, role: "admin", rotation_position: 1,
  });
  return data;
}

export async function joinTontine(invite_code: string) {
  const me = await uid();
  const { data: tontine, error } = await getSupabase()
    .from("tontines")
    .select("*")
    .eq("invite_code", invite_code.trim().toUpperCase())
    .single();
  if (error || !tontine) throw { status: 404, detail: "Code d'invitation invalide" };

  const { count } = await getSupabase()
    .from("tontine_members")
    .select("*", { count: "exact", head: true })
    .eq("tontine_id", tontine.id);

  if ((count ?? 0) >= tontine.max_members)
    throw { status: 400, detail: "La tontine est complète" };

  const { error: e2 } = await getSupabase().from("tontine_members").insert({
    tontine_id: tontine.id, user_id: me, role: "member",
    rotation_position: (count ?? 0) + 1,
  });
  throwSb(e2);
  return { tontine_id: tontine.id };
}

export async function listPublicTontines(filters?: {
  min_amount?: number; max_amount?: number;
  frequency?: string; language?: string; country?: string;
}) {
  const sb = getSupabase();
  let q = sb.from("tontines")
    .select("id, name, amount_per_cycle, frequency, max_members, language, country, description, created_at, owner_id, tontine_members(count), tontine_contributions(amount)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (filters?.frequency) q = q.eq("frequency", filters.frequency);
  if (filters?.language) q = q.eq("language", filters.language);
  if (filters?.country) q = q.eq("country", filters.country);
  if (filters?.min_amount) q = q.gte("amount_per_cycle", filters.min_amount);
  if (filters?.max_amount) q = q.lte("amount_per_cycle", filters.max_amount);
  const { data, error } = await q;
  throwSb(error);
  return (data ?? []).map((t: any) => {
    const memberCount = t.tontine_members?.[0]?.count ?? 0;
    const contribs: number[] = (t.tontine_contributions ?? []).map((c: any) => Number(c.amount));
    const expectedTotal = Number(t.amount_per_cycle) * memberCount;
    const actualTotal = contribs.reduce((s: number, a: number) => s + a, 0);
    const complianceRate = expectedTotal > 0 ? Math.min(100, Math.round((actualTotal / expectedTotal) * 100)) : null;
    const fullness = t.max_members > 0 ? memberCount / t.max_members : 0;
    const reliability = Math.round(
      (complianceRate !== null ? complianceRate * 0.6 : 50) + fullness * 40
    );
    return {
      id: t.id, name: t.name,
      amount_per_cycle: t.amount_per_cycle,
      frequency: t.frequency,
      max_members: t.max_members,
      language: t.language ?? null,
      country: t.country ?? null,
      description: t.description ?? null,
      members_count: memberCount,
      compliance_rate: complianceRate,
      reliability_score: reliability,
      created_at: t.created_at,
    };
  });
}

export async function requestJoinTontine(tontine_id: string) {
  const me = await uid();
  const { count } = await getSupabase()
    .from("tontine_members")
    .select("*", { count: "exact", head: true })
    .eq("tontine_id", tontine_id)
    .eq("user_id", me);
  if ((count ?? 0) > 0) throw { status: 400, detail: "Vous êtes déjà membre de cette tontine" };
  const { error } = await getSupabase().from("notifications").insert({
    user_id: me,
    title: "Demande d'adhésion",
    body: `Demande d'adhésion à la tontine ${tontine_id}`,
    type: "join_request",
    metadata: { tontine_id },
  });
  throwSb(error);
  return { status: "pending", tontine_id };
}

export async function getPublicTontineProfile(id: string) {
  const sb = getSupabase();
  const [tontineRes, membersRes, contribsRes] = await Promise.all([
    sb.from("tontines").select("*").eq("id", id).eq("is_public", true).single(),
    sb.from("tontine_members").select("user_id, role, joined_at, profiles(full_name, country)").eq("tontine_id", id).limit(20),
    sb.from("tontine_contributions").select("amount, cycle, created_at").eq("tontine_id", id).order("created_at", { ascending: false }).limit(200),
  ]);
  if (tontineRes.error || !tontineRes.data) throw { status: 404, detail: "Tontine introuvable ou privée" };
  const t = tontineRes.data;
  const members = (membersRes.data ?? []).map((m: any) => ({
    role: m.role, joined_at: m.joined_at,
    full_name: m.profiles?.full_name ?? "Membre",
    country: m.profiles?.country ?? null,
  }));
  const contribs = contribsRes.data ?? [];
  const memberCount = members.length;
  const expectedTotal = Number(t.amount_per_cycle) * memberCount;
  const actualTotal = contribs.reduce((s: number, c: any) => s + Number(c.amount), 0);
  const complianceRate = expectedTotal > 0 ? Math.min(100, Math.round((actualTotal / expectedTotal) * 100)) : null;
  const fullness = t.max_members > 0 ? memberCount / t.max_members : 0;
  const reliability = Math.round(
    (complianceRate !== null ? complianceRate * 0.6 : 50) + fullness * 40
  );
  const now = new Date();
  const monthly: { label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("fr-FR", { month: "short" });
    const total = contribs
      .filter((c: any) => {
        const cd = new Date(c.created_at);
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
      })
      .reduce((s: number, c: any) => s + Number(c.amount), 0);
    monthly.push({ label, total });
  }
  return {
    tontine: t, members, compliance_rate: complianceRate,
    reliability_score: reliability, monthly_history: monthly,
    contribution_count: contribs.length, total_collected: actualTotal,
  };
}

export async function contributeTontine(id: string, amount: number) {
  const me = await uid();
  const { data: tontine } = await getSupabase().from("tontines").select("current_cycle").eq("id", id).single();
  const { error } = await getSupabase().from("tontine_contributions").insert({
    tontine_id: id, user_id: me, amount, cycle: tontine?.current_cycle ?? 1,
  });
  throwSb(error);
  await getSupabase().from("tontine_members")
    .update({ cycles_paid: getSupabase().rpc ? undefined : undefined, status: "a_jour" })
    .eq("tontine_id", id).eq("user_id", me);
  // Award identity points
  await addIdentityEvent(me, "tontine_contribution", amount >= 50000 ? 1 : 0.5);
  return { detail: "Contribution enregistrée" };
}

/* ── ASSOCIATIONS ────────────────────────────────────────── */

export async function listAssociations() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("association_members")
    .select("associations(*, association_members(count))")
    .eq("user_id", me);
  throwSb(error);
  return (data ?? []).map((row: any) => ({
    ...row.associations,
    members_count: row.associations?.association_members?.[0]?.count ?? 0,
  }));
}

export async function getAssociation(id: string) {
  const { data, error } = await getSupabase()
    .from("associations")
    .select("*, association_members(*, profiles(full_name)), association_contributions(*)")
    .eq("id", id)
    .single();
  throwSb(error);
  return { association: data };
}

export async function createAssociation(body: Record<string, any>) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("associations")
    .insert({ ...body, owner_id: me, invite_code: inviteCode() })
    .select().single();
  throwSb(error);
  await getSupabase().from("association_members").insert({ association_id: data.id, user_id: me, role: "admin" });
  return data;
}

export async function joinAssociation(invite_code: string) {
  const me = await uid();
  const { data: assoc, error } = await getSupabase()
    .from("associations")
    .select("id")
    .eq("invite_code", invite_code.trim().toUpperCase())
    .single();
  if (error || !assoc) throw { status: 404, detail: "Code d'invitation invalide" };
  const { error: e2 } = await getSupabase().from("association_members")
    .insert({ association_id: assoc.id, user_id: me, role: "member" });
  throwSb(e2);
  return { association_id: assoc.id };
}

export async function contributeAssociation(id: string, amount: number) {
  const me = await uid();
  const { error } = await getSupabase().from("association_contributions")
    .insert({ association_id: id, user_id: me, amount });
  throwSb(error);
  await getSupabase().from("associations")
    .update({ total_collected: (await getSupabase().from("association_contributions").select("amount").eq("association_id", id)) as any })
    .eq("id", id);
  return { detail: "Contribution enregistrée" };
}

/* ── COOPERATIVES ────────────────────────────────────────── */

export async function listCooperatives() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("cooperative_members")
    .select("cooperatives(*, cooperative_members(count))")
    .eq("user_id", me);
  throwSb(error);
  return (data ?? []).map((row: any) => ({
    ...row.cooperatives,
    members_count: row.cooperatives?.cooperative_members?.[0]?.count ?? 0,
  }));
}

export async function getCooperative(id: string) {
  const { data, error } = await getSupabase()
    .from("cooperatives")
    .select("*, cooperative_members(*, profiles(full_name)), cooperative_contributions(*)")
    .eq("id", id)
    .single();
  throwSb(error);
  return { cooperative: data };
}

export async function createCooperative(body: Record<string, any>) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("cooperatives")
    .insert({ ...body, owner_id: me, invite_code: inviteCode() })
    .select().single();
  throwSb(error);
  await getSupabase().from("cooperative_members").insert({ cooperative_id: data.id, user_id: me, role: "admin" });
  return data;
}

export async function joinCooperative(invite_code: string) {
  const me = await uid();
  const { data: coop, error } = await getSupabase()
    .from("cooperatives").select("id").eq("invite_code", invite_code.trim().toUpperCase()).single();
  if (error || !coop) throw { status: 404, detail: "Code invalide" };
  await getSupabase().from("cooperative_members").insert({ cooperative_id: coop.id, user_id: me, role: "member" });
  return { cooperative_id: coop.id };
}

export async function contributeCooperative(id: string, amount: number) {
  const me = await uid();
  await getSupabase().from("cooperative_contributions").insert({ cooperative_id: id, user_id: me, amount });
  await getSupabase().from("cooperatives").rpc ? null : null; // balance updated via trigger ideally
  return { detail: "Contribution enregistrée" };
}

/* ── COMMUNITY FUNDS ─────────────────────────────────────── */

export async function listFunds() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("fund_members")
    .select("community_funds(*)")
    .eq("user_id", me);
  throwSb(error);
  return (data ?? []).map((r: any) => r.community_funds);
}

export async function getFund(id: string) {
  const { data, error } = await getSupabase()
    .from("community_funds")
    .select("*, fund_contributions(*, profiles(full_name)), fund_members(count)")
    .eq("id", id)
    .single();
  throwSb(error);
  return { fund: data, members_count: data?.fund_members?.[0]?.count ?? 0 };
}

export async function createFund(body: Record<string, any>) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("community_funds")
    .insert({ ...body, owner_id: me })
    .select().single();
  throwSb(error);
  await getSupabase().from("fund_members").insert({ fund_id: data.id, user_id: me });
  return data;
}

export async function contributeFund(id: string, amount: number) {
  const me = await uid();
  await getSupabase().from("fund_contributions").insert({ fund_id: id, user_id: me, amount });
  // Recalculate balance
  const { data: contribs } = await getSupabase()
    .from("fund_contributions").select("amount").eq("fund_id", id);
  const total = (contribs ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);
  await getSupabase().from("community_funds").update({ current_balance: total }).eq("id", id);
  return { detail: "Contribution enregistrée" };
}

/* ── SAVINGS SUMMARY / ANALYTICS ────────────────────────── */

export async function getSavingsSummary() {
  const me = await uid();
  return cached(`savings-summary-${me}`, 60_000, async () => {
  const { data } = await getSupabase()
    .from("savings_goals")
    .select("current_amount, target_amount, is_active")
    .eq("user_id", me)
    .eq("is_active", true);
  const goals = data ?? [];
  const total_saved = goals.reduce((s: number, g: any) => s + Number(g.current_amount), 0);
  const total_target = goals.reduce((s: number, g: any) => s + Number(g.target_amount), 0);
  const progress_pct = total_target > 0 ? Math.round((total_saved / total_target) * 100) : 0;
  return { total_saved, total_target, active_goals: goals.length, progress_pct, currency: "XAF" };
  });
}

export async function getTrustScore() {
  const me = await uid();
  return cached(`trust-score-${me}`, 120_000, async () => {
    const identity = await getIdentity();
    return identity.trust_score;
  });
}

/* ── Credit score (0-1000 weighted model) ────────────────────────────────── */

import {
  scoreRegularity, scoreSavingsVolume, scoreSeniority, scoreNetwork, scoreKyc,
  computeScore, generateTips, getTier,
  type CreditScoreResult, type MonthlySnapshot,
} from "@/src/credit-score";

export async function getCreditScore(): Promise<CreditScoreResult> {
  const me = await uid();
  return cached(`credit-score-${me}`, 90_000, async () => {
    const sb = getSupabase();

    const [
      profileRes,
      contribRes,
      savingsRes,
      tontineMemRes,
      assocMemRes,
      coopMemRes,
      createdTontinesRes,
      createdAssocRes,
      createdCoopRes,
      kycRes,
    ] = await Promise.all([
      sb.from("profiles").select("created_at, kyc_status").eq("id", me).single(),
      sb.from("tontine_contributions").select("created_at, tontine_id").eq("user_id", me).order("created_at", { ascending: true }),
      sb.from("savings_goals").select("current_amount").eq("user_id", me),
      sb.from("tontine_members").select("tontine_id, joined_at").eq("user_id", me),
      sb.from("association_members").select("association_id").eq("user_id", me),
      sb.from("cooperative_members").select("cooperative_id").eq("user_id", me),
      sb.from("tontines").select("id").eq("owner_id", me),
      sb.from("associations").select("id").eq("owner_id", me),
      sb.from("cooperatives").select("id").eq("owner_id", me),
      sb.from("kyc_submissions").select("status").eq("user_id", me).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const profile = profileRes.data ?? {};
    const contributions = contribRes.data ?? [];
    const totalSavings = (savingsRes.data ?? []).reduce((s: number, g: any) => s + Number(g.current_amount), 0);
    const groupsJoined = (tontineMemRes.data?.length ?? 0) + (assocMemRes.data?.length ?? 0) + (coopMemRes.data?.length ?? 0);
    const groupsCreated = (createdTontinesRes.data?.length ?? 0) + (createdAssocRes.data?.length ?? 0) + (createdCoopRes.data?.length ?? 0);
    const kycStatus = kycRes.data?.status ?? (profile as any).kyc_status ?? null;
    const createdAt = (profile as any).created_at ?? new Date().toISOString();

    // Earliest tontine membership for regularity window
    const memberSince = (tontineMemRes.data ?? []).reduce((earliest: string, m: any) => {
      const d = m.joined_at ?? createdAt;
      return d < earliest ? d : earliest;
    }, createdAt);

    const breakdown = {
      regularity:     scoreRegularity(contributions, memberSince, 30),
      savings_volume: scoreSavingsVolume(totalSavings),
      seniority:      scoreSeniority(createdAt),
      network:        scoreNetwork(groupsJoined, groupsCreated),
      kyc:            scoreKyc(kycStatus),
    };

    const score = computeScore(breakdown);
    const tier  = getTier(score);

    // Persist snapshot in identity_events so history is available
    try {
      await sb.from("identity_events").insert({
        user_id: me,
        event_type: "credit_score_snapshot",
        points_delta: score,
        created_at: new Date().toISOString(),
      });
    } catch { /* non-blocking */ }

    return {
      score,
      breakdown,
      tier,
      is_loan_eligible: score >= 700,
      tips: generateTips(breakdown),
      computed_at: new Date().toISOString(),
    } as CreditScoreResult & { tips: string[] };
  });
}

export async function getCreditScoreHistory(): Promise<MonthlySnapshot[]> {
  const me = await uid();
  const { data } = await getSupabase()
    .from("identity_events")
    .select("points_delta, created_at")
    .eq("user_id", me)
    .eq("event_type", "credit_score_snapshot")
    .order("created_at", { ascending: true });

  // Collapse to one snapshot per month (latest of that month)
  const byMonth: Record<string, number> = {};
  for (const row of data ?? []) {
    const month = (row.created_at as string).slice(0, 7);
    byMonth[month] = row.points_delta;
  }
  return Object.entries(byMonth).map(([month, score]) => ({ month, score }));
}

export async function getInsights() {
  const me = await uid();
  return cached(`insights-${me}`, 120_000, async () => {
    const identity = await getIdentity();
    const tips = identity.trust_score.tips ?? [];
    return { items: tips.map((text: string) => ({ text, kind: "tip" })) };
  });
}

export async function getSavingsSeries(days = 14) {
  const me = await uid();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await getSupabase()
    .from("savings_transactions")
    .select("amount, created_at")
    .eq("user_id", me)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  const byDate: Record<string, number> = {};
  for (const tx of data ?? []) {
    const d = (tx.created_at as string).slice(0, 10);
    byDate[d] = (byDate[d] ?? 0) + Number(tx.amount);
  }
  const series = Object.entries(byDate).map(([date, value]) => ({ date, value }));
  return { days, series };
}

export async function getUsersSeries(days = 14) {
  return cached(`users-series`, 120_000, async () => {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await getSupabase()
      .from("profiles")
      .select("created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true });
    const byDate: Record<string, number> = {};
    for (const p of data ?? []) {
      const d = (p.created_at as string).slice(0, 10);
      byDate[d] = (byDate[d] ?? 0) + 1;
    }
    const series = Object.entries(byDate).map(([date, value]) => ({ date, value }));
    return { days, series };
  });
}

/* ── SAVINGS ─────────────────────────────────────────────── */

export async function listSavings() {
  const me = await uid();
  return cached(`savings-${me}`, 60_000, async () => {
    const { data, error } = await getSupabase()
      .from("savings_goals")
      .select("*")
      .eq("user_id", me)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    throwSb(error);
    return data ?? [];
  });
}

export async function getSaving(id: string) {
  const { data, error } = await getSupabase()
    .from("savings_goals")
    .select("*, savings_transactions(*)")
    .eq("id", id)
    .single();
  throwSb(error);
  return data;
}

export async function createSaving(body: Record<string, any>) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("savings_goals")
    .insert({ ...body, user_id: me, current_amount: 0 })
    .select().single();
  throwSb(error);
  return data;
}

export async function depositSaving(id: string, amount: number, note?: string) {
  const me = await uid();
  await getSupabase().from("savings_transactions").insert({ goal_id: id, user_id: me, amount, note });
  const { data: txs } = await getSupabase().from("savings_transactions").select("amount").eq("goal_id", id);
  const total = (txs ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
  await getSupabase().from("savings_goals").update({ current_amount: total }).eq("id", id);
  await addIdentityEvent(me, "savings_deposit", amount >= 50000 ? 1 : 0.5);
  invalidateCache(`savings-${me}`);
  invalidateCache(`identity-${me}`);
  return { detail: "Dépôt enregistré" };
}

/* ── Savings Analytics ───────────────────────────────────── */

import { analyzePattern, predictGoal, buildPeerStats, buildMonthlyHistogram } from "@/src/savings-ai";

export async function getSavingsAnalytics(goalId: string) {
  const me = await uid();
  const sb = getSupabase();

  // Fetch goal + all its deposits
  const [goalRes, txRes] = await Promise.all([
    sb.from("savings_goals").select("*").eq("id", goalId).eq("user_id", me).single(),
    sb.from("savings_transactions").select("amount, created_at").eq("goal_id", goalId).order("created_at", { ascending: true }),
  ]);
  if (goalRes.error || !goalRes.data) throw new Error("Objectif introuvable.");

  const goal = goalRes.data;
  const deposits = (txRes.data ?? []).map((t: any) => ({ amount: Number(t.amount), created_at: t.created_at as string }));

  const prediction = predictGoal(goal, deposits);
  const histogram = buildMonthlyHistogram(deposits, 6);

  // Peer comparison — fetch anonymous aggregate data for goals in same target range
  const rangeMin = goal.target_amount * 0.5;
  const rangeMax = goal.target_amount * 2;
  const { data: peerGoals } = await sb
    .from("savings_goals")
    .select("id, current_amount, created_at")
    .neq("user_id", me)
    .gte("target_amount", rangeMin)
    .lte("target_amount", rangeMax)
    .eq("is_active", true)
    .limit(100);

  // For each peer goal, estimate monthly avg from current_amount / months active
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
    .from("savings_goals")
    .select("id, name, current_amount, target_amount, deadline, created_at, is_active")
    .eq("user_id", me)
    .order("created_at", { ascending: false });

  if (!goals?.length) return [];

  // Fetch all transactions for all goals in one query
  const goalIds = goals.map((g: any) => g.id);
  const { data: allTxs } = await getSupabase()
    .from("savings_transactions")
    .select("goal_id, amount, created_at")
    .in("goal_id", goalIds)
    .order("created_at", { ascending: true });

  const txsByGoal: Record<string, { amount: number; created_at: string }[]> = {};
  for (const tx of allTxs ?? []) {
    if (!txsByGoal[tx.goal_id]) txsByGoal[tx.goal_id] = [];
    txsByGoal[tx.goal_id].push({ amount: Number(tx.amount), created_at: tx.created_at });
  }

  return goals.map((g: any) => ({
    goal: g,
    prediction: predictGoal(g, txsByGoal[g.id] ?? []),
  }));
}

/* ── IDENTITY ────────────────────────────────────────────── */

async function addIdentityEvent(user_id: string, event_type: string, points: number) {
  await getSupabase().from("identity_events").insert({ user_id, event_type, points_delta: points });
}

export async function getIdentity() {
  const me = await uid();
  return cached(`identity-${me}`, 90_000, async () => {
  const { data: sbUser } = await getSupabase().auth.getSession();

  const [profileRes, savingsRes, tontineRes, assocRes, coopRes, eventsRes, txRes] = await Promise.all([
    getSupabase().from("profiles").select("*").eq("id", me).single(),
    getSupabase().from("savings_goals").select("current_amount").eq("user_id", me),
    getSupabase().from("tontine_members").select("tontine_id").eq("user_id", me),
    getSupabase().from("association_members").select("association_id").eq("user_id", me),
    getSupabase().from("cooperative_members").select("cooperative_id").eq("user_id", me),
    getSupabase().from("identity_events").select("points_delta, event_type, created_at").eq("user_id", me),
    getSupabase().from("tontine_contributions").select("amount").eq("user_id", me),
  ]);

  const profile = profileRes.data ?? {};
  const totalSavings = (savingsRes.data ?? []).reduce((s: number, g: any) => s + Number(g.current_amount), 0);
  const tontineCount = tontineRes.data?.length ?? 0;
  const assocCount = assocRes.data?.length ?? 0;
  const coopCount = coopRes.data?.length ?? 0;
  const groupCount = tontineCount + assocCount + coopCount;
  const tontineContribs = (txRes.data ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);

  // Trust score calculation
  const events = eventsRes.data ?? [];
  const signupBonus = events.filter((e: any) => e.event_type === "signup_bonus").reduce((s: number, e: any) => s + e.points_delta, 0);
  const txPoints = events.filter((e: any) => e.event_type !== "signup_bonus" && e.event_type !== "yearly_bonus").reduce((s: number, e: any) => s + e.points_delta, 0);

  const createdAt = sbUser.session?.user?.created_at ?? new Date().toISOString();
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = Math.floor(ageMs / 86400000);
  const yearlyBonus = Math.floor(ageDays / 365) * 5;

  const score = Math.min(1000, signupBonus + txPoints + yearlyBonus);

  // Tier based on score
  const levelConfig = score >= 810 ? { level: "Platinum", color: "#8B5CF6", risk: "Très faible" }
    : score >= 610 ? { level: "Or", color: "#D4AF37", risk: "Faible" }
    : score >= 310 ? { level: "Argent", color: "#8B9EB0", risk: "Modéré" }
    : { level: "Bronze", color: "#CD7F32", risk: "Standard" };

  // Participation/longevity/engagement components (0-100 scale)
  const participation = Math.min(100, groupCount * 20);
  const longevity = Math.min(100, ageDays / 3.65);
  const regularity = Math.min(100, (events.filter((e: any) => e.event_type === "tontine_contribution").length) * 10);
  const engagement = Math.min(100, events.length * 5);

  return {
    user: {
      full_name: profile.full_name ?? sbUser.session?.user?.user_metadata?.full_name ?? "",
      email: sbUser.session?.user?.email ?? "",
      phone: profile.phone ?? null,
      country: profile.country ?? null,
      city: profile.city ?? null,
      occupation: profile.occupation ?? null,
      created_at: createdAt,
    },
    trust_score: {
      score,
      score_max: 1000,
      level: levelConfig.level,
      risk: levelConfig.risk,
      color: levelConfig.color,
      components: {
        signup_bonus: signupBonus,
        transaction_points: txPoints,
        yearly_bonus: yearlyBonus,
        regularity,
        longevity,
        participation,
        engagement,
      },
      tips: score < 100
        ? ["Effectuez des contributions régulières pour augmenter votre score", "Rejoignez une tontine ou association pour booster votre identité"]
        : score < 500
        ? ["Continuez vos contributions régulièrement", "Complétez votre profil pour +10 points"]
        : ["Excellent score ! Partagez vos certificats avec confiance"],
      stats: { total_saved: totalSavings, tontines: tontineCount, associations: assocCount, cooperatives: coopCount, account_age_days: ageDays },
    },
    totals: {
      total_savings: totalSavings,
      deposits_count: events.filter((e: any) => e.event_type === "savings_deposit").length,
      tontine_contributions: tontineContribs,
      groups: groupCount,
      tontines: tontineCount,
      associations: assocCount,
      cooperatives: coopCount,
    },
    currency: "XAF",
  };
  });
}

export async function getIdentityProfile() {
  const me = await uid();
  const { data: events } = await getSupabase()
    .from("identity_events")
    .select("*")
    .eq("user_id", me)
    .order("created_at", { ascending: false });

  const allEvents = events ?? [];
  const points = allEvents.reduce((s: number, e: any) => s + e.points_delta, 0);
  const displayPoints = Math.round(points * 10) / 10;

  const tierConfig = points >= 81 ? { level: "Platinum", level_key: "platinum", color: "#8B5CF6", next: null, nextPts: 0, range: [81, 1000] }
    : points >= 61 ? { level: "Or", level_key: "gold", color: "#D4AF37", next: "Platinum", nextPts: 81, range: [61, 80] }
    : points >= 31 ? { level: "Argent", level_key: "silver", color: "#8B9EB0", next: "Or", nextPts: 61, range: [31, 60] }
    : { level: "Bronze", level_key: "bronze", color: "#CD7F32", next: "Argent", nextPts: 31, range: [0, 30] };

  const [lo, hi] = tierConfig.range;
  const pct = hi > lo ? Math.min(100, ((points - lo) / (hi - lo)) * 100) : 100;

  return {
    profile: {
      points,
      display_points: displayPoints,
      level: tierConfig.level,
      level_key: tierConfig.level_key,
      level_color: tierConfig.color,
      next_level: tierConfig.next,
      points_to_next: tierConfig.next ? Math.max(0, tierConfig.nextPts - points) : 0,
      progress_within_level_pct: Math.max(0, pct),
      events_recorded: allEvents.length,
    },
    recent_events: allEvents.slice(0, 10),
  };
}

/* ── FINANCIAL ANALYTICS ─────────────────────────────────── */

export async function getFinancialAnalytics() {
  const me = await uid();
  const sb = getSupabase();
  const now = new Date();

  // Fetch last 12 months of data in parallel
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();
  const [savingsTxRes, tontineContribRes, savingsGoalsRes, identityEventsRes] = await Promise.all([
    sb.from("savings_transactions").select("amount, type, created_at").eq("user_id", me).gte("created_at", twelveMonthsAgo),
    sb.from("tontine_contributions").select("amount, created_at").eq("user_id", me).gte("created_at", twelveMonthsAgo),
    sb.from("savings_goals").select("current_amount, target_amount, created_at, name").eq("user_id", me),
    sb.from("identity_events").select("score_delta, event_type, created_at").eq("user_id", me).eq("event_type", "credit_score_snapshot").order("created_at", { ascending: true }).limit(24),
  ]);

  const savingsTx = savingsTxRes.data ?? [];
  const tontineContribs = tontineContribRes.data ?? [];
  const goals = savingsGoalsRes.data ?? [];

  // Monthly cash flow: inflows (deposits) vs outflows (withdrawals) for last 6 months
  const cashFlow: { label: string; inflow: number; outflow: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("fr-FR", { month: "short" });
    const monthTx = savingsTx.filter((t: any) => {
      const cd = new Date(t.created_at);
      return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
    });
    const monthContribs = tontineContribs.filter((t: any) => {
      const cd = new Date(t.created_at);
      return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
    });
    const inflow = monthTx.filter((t: any) => t.type === "deposit").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const outflow = monthTx.filter((t: any) => t.type !== "deposit").reduce((s: number, t: any) => s + Number(t.amount), 0)
      + monthContribs.reduce((s: number, t: any) => s + Number(t.amount), 0);
    cashFlow.push({ label, inflow, outflow });
  }

  // Total saved vs total contributed (for donut)
  const totalSaved = goals.reduce((s: number, g: any) => s + Number(g.current_amount), 0);
  const totalContributed = tontineContribs.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalOut = totalSaved + totalContributed;

  // Trust score history (12 months)
  const trustHistory: { label: string; score: number }[] = (identityEventsRes.data ?? []).map((e: any) => ({
    label: new Date(e.created_at).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }),
    score: Number(e.score_delta ?? 0),
  }));

  // Goal projections: for each goal with a deadline, compute linear trend
  const projections = goals
    .filter((g: any) => g.target_amount > 0)
    .map((g: any) => {
      const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100);
      const depositRate = savingsTx
        .filter((t: any) => t.type === "deposit")
        .reduce((s: number, t: any) => s + Number(t.amount), 0) / 12; // avg monthly
      const remaining = Number(g.target_amount) - Number(g.current_amount);
      const monthsToGo = depositRate > 0 ? Math.ceil(remaining / depositRate) : null;
      return { name: g.name, pct: Math.round(pct), months_to_go: monthsToGo, target: Number(g.target_amount), current: Number(g.current_amount) };
    });

  // Raw transactions for CSV export
  const rawRows = [
    ...savingsTx.map((t: any) => ({ date: t.created_at, type: t.type, amount: t.amount, category: "Épargne" })),
    ...tontineContribs.map((t: any) => ({ date: t.created_at, type: "contribution", amount: t.amount, category: "Tontine" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    cash_flow: cashFlow,
    donut: { saved: totalSaved, contributed: totalContributed, total: totalOut },
    trust_history: trustHistory,
    projections,
    raw_rows: rawRows,
  };
}

/* ── NOTIFICATIONS ───────────────────────────────────────── */

export async function listNotifications() {
  const me = await uid();
  return cached(`notifs-${me}`, 30_000, async () => {
    const { data, error } = await getSupabase()
      .from("notifications")
      .select("*")
      .eq("user_id", me)
      .order("created_at", { ascending: false })
      .limit(50);
    throwSb(error);
    return data ?? [];
  });
}

export async function markNotifRead(id: string) {
  await getSupabase().from("notifications").update({ is_read: true }).eq("id", id);
}

export async function savePushToken(token: string) {
  const me = await uid();
  await getSupabase().from("push_tokens")
    .upsert({ user_id: me, token, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return { detail: "Token enregistré" };
}

/* ── Wallet ──────────────────────────────────────────────── */

import * as walletDb from "@/src/wallet-db";
import { getRates } from "@/src/exchange-rates";

export async function getWallet() { return walletDb.getWallet(); }
export async function getWalletTransactions() { return walletDb.getWalletTransactions(); }
export async function getExchangeRates() { return getRates(); }
export async function topupWallet(body: any) { return walletDb.topupFromMobileMoney(body); }
export async function withdrawWallet(body: any) { return walletDb.withdrawToMobileMoney(body); }
export async function transferWallet(body: any) { return walletDb.transferToMember(body); }
export async function payContributionWallet(body: any) {
  return walletDb.payContributionFromWallet(body?.tontine_id, Number(body?.amount), Number(body?.cycle));
}

/* ── KYC ──────────────────────────────────────────────────── */

export async function getKycStatus() {
  const me = await uid();
  const { data } = await getSupabase()
    .from("kyc_submissions").select("*").eq("user_id", me).single();
  return data ?? { status: "not_submitted" };
}

export async function submitKyc() {
  const me = await uid();
  const { error } = await getSupabase().from("kyc_submissions")
    .upsert({ user_id: me, status: "pending", submitted_at: new Date().toISOString() }, { onConflict: "user_id" });
  throwSb(error);
  await getSupabase().from("profiles").update({ kyc_status: "pending" }).eq("id", me);
  return { detail: "Demande KYC soumise" };
}

/* ── PAYMENTS ────────────────────────────────────────────── */

export async function listPayments() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("payments")
    .select("*")
    .eq("user_id", me)
    .order("created_at", { ascending: false })
    .limit(50);
  throwSb(error);
  return data ?? [];
}

/* ── ADMIN ───────────────────────────────────────────────── */

export async function getAdminAnalytics() {
  return cached("admin-analytics", 90_000, async () => {
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };

  const [users, allTontines, assocCount, coopCount, savingsData, contribData, kycData] = await Promise.all([
    safe(() => getSupabase().from("profiles").select("id, created_at, role").then(r => r.data ?? []), []),
    safe(() => getSupabase().from("tontines").select("id").then(r => r.data ?? []), []),
    safe(() => getSupabase().from("associations").select("id", { count: "exact", head: true }).then(r => r.count ?? 0), 0),
    safe(() => getSupabase().from("cooperatives").select("id", { count: "exact", head: true }).then(r => r.count ?? 0), 0),
    safe(() => getSupabase().from("savings_goals").select("current_amount").then(r => r.data ?? []), []),
    safe(() => getSupabase().from("tontine_contributions").select("amount").then(r => r.data ?? []), []),
    safe(() => getSupabase().from("kyc_submissions").select("status").then(r => r.data ?? []), []),
  ]);

  const now = Date.now();
  const d7 = new Date(now - 7 * 86400000).toISOString();
  const d30 = new Date(now - 30 * 86400000).toISOString();
  const new7d = (users as any[]).filter(u => u.created_at >= d7).length;
  const new30d = (users as any[]).filter(u => u.created_at >= d30).length;

  const savingsVol = (savingsData as any[]).reduce((s, g) => s + Number(g.current_amount), 0);
  const contribVol = (contribData as any[]).reduce((s, c) => s + Number(c.amount), 0);
  const kycArr = kycData as any[];
  const kycPending = kycArr.filter(k => k.status === "pending").length;
  const kycApproved = kycArr.filter(k => k.status === "approved").length;

  const userSeries: { date: string; value: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
    userSeries.push({ date: d, value: (users as any[]).filter(u => (u.created_at ?? "").slice(0, 10) <= d).length });
  }

  return {
    users: {
      total: (users as any[]).length,
      new_7d: new7d,
      new_30d: new30d,
      managers: (users as any[]).filter(u => u.role === "tontine_manager").length,
      admins: (users as any[]).filter(u => u.role === "super_admin" || u.role === "admin").length,
    },
    tontines: { total: (allTontines as any[]).length, active: (allTontines as any[]).length, closed: 0 },
    associations: assocCount as number,
    cooperatives: coopCount as number,
    savings_volume: savingsVol,
    contributions_volume: contribVol,
    kyc: { pending: kycPending, approved: kycApproved },
    user_series: userSeries,
    // Defensive fallbacks for fields admin-dashboard.tsx accesses
    active_groups: { tontines: (allTontines as any[]).length, tontines_active: (allTontines as any[]).length, associations: assocCount as number, cooperatives: coopCount as number },
    score_distribution: { excellent: 0, very_good: 0, good: 0, emerging: 0, new: (users as any[]).length },
    tier_distribution: { bronze: (users as any[]).length, silver: 0, gold: 0, platinum: 0 },
    avg_trust_score: 0,
    savings_count: 0,
    tontine_contributions_volume: contribVol,
    tontine_contributions_count: 0,
    funds: { count: 0, balance: 0, collected: 0 },
    payments: { count: 0, amount_minor: 0, commission_minor: 0, currency: "XAF" },
  };
  });
}

export async function adminListUsers(search = "") {
  // Select only guaranteed columns (no kyc_status which may not exist)
  let q = getSupabase().from("profiles").select("id, full_name, phone, role, created_at, country, city").order("created_at", { ascending: false }).limit(100);
  if (search) q = q.ilike("full_name", `%${search}%`);
  const { data, error } = await q;
  if (error) return [];
  return data ?? [];
}

export async function adminUpdateUserRole(userId: string, role: string) {
  const { error } = await getSupabase().from("profiles").update({ role }).eq("id", userId);
  throwSb(error);
  return { detail: "Rôle mis à jour" };
}

export async function adminDeactivateUser(userId: string) {
  const { error } = await getSupabase().from("profiles").update({ role: "suspended" }).eq("id", userId);
  throwSb(error);
  return { detail: "Utilisateur suspendu" };
}

export async function adminListTontines(search = "") {
  let q = getSupabase()
    .from("tontines")
    .select("id, name, amount_per_cycle, frequency, max_members, invite_code, created_at, owner_id")
    .order("created_at", { ascending: false })
    .limit(100);
  if (search) q = q.ilike("name", `%${search}%`);
  const { data, error } = await q;
  if (error) return [];

  const tontines = data ?? [];
  const ids = tontines.map((t: any) => t.id);

  // Get member counts
  const memberCounts: Record<string, number> = {};
  try {
    const { data: mc } = await getSupabase().from("tontine_members").select("tontine_id").in("tontine_id", ids);
    for (const m of mc ?? []) memberCounts[m.tontine_id] = (memberCounts[m.tontine_id] ?? 0) + 1;
  } catch {}

  // Get owner names
  const ownerIds = [...new Set(tontines.map((t: any) => t.owner_id))];
  const ownerNames: Record<string, string> = {};
  try {
    const { data: owners } = await getSupabase().from("profiles").select("id, full_name").in("id", ownerIds);
    for (const o of owners ?? []) ownerNames[o.id] = o.full_name ?? "—";
  } catch {}

  // Try to get status/auto_close_date (columns may not exist yet)
  const statusMap: Record<string, { status: string; auto_close_date: string | null }> = {};
  try {
    const { data: sd } = await getSupabase().from("tontines").select("id, status, auto_close_date");
    if (sd) for (const t of sd) statusMap[t.id] = { status: t.status, auto_close_date: t.auto_close_date };
  } catch {}

  return tontines.map((t: any) => ({
    ...t,
    status: statusMap[t.id]?.status ?? "active",
    auto_close_date: statusMap[t.id]?.auto_close_date ?? null,
    owner_name: ownerNames[t.owner_id] ?? "—",
    members_count: memberCounts[t.id] ?? 0,
  }));
}

export async function adminUpdateTontine(id: string, updates: { status?: string; auto_close_date?: string | null }) {
  const { error } = await getSupabase().from("tontines").update(updates).eq("id", id);
  if (error) throw { status: 400, detail: "Erreur mise à jour — exécutez d'abord le SQL d'initialisation dans Supabase." };
  return { detail: "Tontine mise à jour" };
}

export async function adminDeleteTontine(id: string) {
  await getSupabase().from("tontine_contributions").delete().eq("tontine_id", id);
  await getSupabase().from("tontine_members").delete().eq("tontine_id", id);
  const { error } = await getSupabase().from("tontines").delete().eq("id", id);
  throwSb(error);
  return { detail: "Tontine supprimée" };
}

export async function adminListKyc() {
  const { data, error } = await getSupabase()
    .from("kyc_submissions")
    .select("id, user_id, status, submitted_at")
    .order("submitted_at", { ascending: false })
    .limit(100);
  if (error) return [];

  const userIds = [...new Set((data ?? []).map((k: any) => k.user_id))];
  const profileMap: Record<string, any> = {};
  try {
    const { data: profiles } = await getSupabase().from("profiles").select("id, full_name, phone, country").in("id", userIds);
    for (const p of profiles ?? []) profileMap[p.id] = p;
  } catch {}

  return (data ?? []).map((k: any) => ({
    ...k,
    full_name: profileMap[k.user_id]?.full_name ?? "—",
    phone: profileMap[k.user_id]?.phone ?? "—",
    country: profileMap[k.user_id]?.country ?? "—",
  }));
}

export async function adminHandleKyc(userId: string, approve: boolean) {
  const status = approve ? "approved" : "rejected";
  await getSupabase().from("kyc_submissions").update({ status, reviewed_at: new Date().toISOString() }).eq("user_id", userId);
  await getSupabase().from("profiles").update({ kyc_status: status }).eq("id", userId);
  if (approve) {
    await getSupabase().from("notifications").insert({ user_id: userId, title: "KYC approuvé ✅", body: "Votre identité a été vérifiée avec succès.", type: "kyc" });
  } else {
    await getSupabase().from("notifications").insert({ user_id: userId, title: "KYC refusé", body: "Votre dossier KYC a été refusé. Contactez le support.", type: "kyc" });
  }
  return { detail: `KYC ${approve ? "approuvé" : "refusé"}` };
}

export async function createPromotionRequest(reason: string) {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw { status: 401, detail: "Non authentifié." };

  // Check for existing pending request
  const { data: existing } = await getSupabase()
    .from("notifications")
    .select("id, is_read, created_at")
    .eq("user_id", user.id)
    .eq("type", "promotion_request")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && !existing.is_read) {
    throw { status: 400, detail: "Vous avez déjà une demande en attente." };
  }

  const { data, error } = await getSupabase()
    .from("notifications")
    .insert({ user_id: user.id, title: "Demande de promotion Manager", body: reason, type: "promotion_request", is_read: false })
    .select("id, user_id, body, created_at, is_read")
    .single();

  if (error) throw { status: 400, detail: error.message };
  return { id: data.id, user_id: data.user_id, reason: data.body, status: "pending", created_at: data.created_at };
}

export async function getMyPromotionRequest() {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw { status: 401, detail: "Non authentifié." };

  const { data } = await getSupabase()
    .from("notifications")
    .select("id, user_id, body, created_at, is_read")
    .eq("user_id", user.id)
    .eq("type", "promotion_request")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, user_id: data.user_id, reason: data.body, status: data.is_read ? "processed" : "pending", created_at: data.created_at };
}

export async function adminListPromotionRequests() {
  const { data } = await getSupabase()
    .from("notifications")
    .select("id, user_id, body, created_at, is_read")
    .eq("type", "promotion_request")
    .order("created_at", { ascending: false })
    .limit(50);

  const userIds = [...new Set((data ?? []).map((n: any) => n.user_id))];
  const profileMap: Record<string, any> = {};
  try {
    const { data: profiles } = await getSupabase().from("profiles").select("id, full_name, phone").in("id", userIds);
    for (const p of profiles ?? []) profileMap[p.id] = p;
  } catch {}

  return (data ?? []).map((n: any) => ({
    id: n.id,
    user_id: n.user_id,
    full_name: profileMap[n.user_id]?.full_name ?? "—",
    phone: n.profiles?.phone ?? "—",
    body: n.body,
    created_at: n.created_at,
    status: n.is_read ? "processed" : "pending",
  }));
}

export async function adminHandlePromotion(userId: string, approve: boolean) {
  if (approve) {
    await getSupabase().from("profiles").update({ role: "tontine_manager" }).eq("id", userId);
    await getSupabase().from("notifications").insert({ user_id: userId, title: "Promotion accordée 🎉", body: "Félicitations ! Vous êtes maintenant Tontine Manager.", type: "promotion" });
  } else {
    await getSupabase().from("notifications").insert({ user_id: userId, title: "Promotion refusée", body: "Votre demande de promotion Manager a été examinée et refusée.", type: "promotion" });
  }
  await getSupabase().from("notifications").update({ is_read: true }).eq("user_id", userId).eq("type", "promotion_request");
  return { detail: `Promotion ${approve ? "accordée" : "refusée"}` };
}

export async function adminBroadcast(title: string, body: string) {
  const { data: profiles } = await getSupabase().from("profiles").select("id");
  if (!profiles?.length) return { detail: "Aucun membre trouvé" };
  const rows = profiles.map((p: any) => ({ user_id: p.id, title, body, type: "broadcast", is_read: false }));
  // Insert in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    await getSupabase().from("notifications").insert(rows.slice(i, i + 100));
  }
  return { detail: `Message envoyé à ${profiles.length} membres` };
}

export async function getAdminStats() {
  const [users, tontines, kyc] = await Promise.all([
    getSupabase().from("profiles").select("*", { count: "exact", head: true }),
    getSupabase().from("tontines").select("*", { count: "exact", head: true }),
    getSupabase().from("kyc_submissions").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return {
    total_users: users.count ?? 0,
    total_tontines: tontines.count ?? 0,
    pending_kyc: kyc.count ?? 0,
  };
}

/* ── MESSAGING ───────────────────────────────────────────── */

export async function listMessages(conversationType: "admin" | "tontine", tontineId?: string) {
  const me = await uid();
  const sb = getSupabase();

  if (conversationType === "admin") {
    // Messages between this user and any admin, or broadcast from admin
    const { data } = await sb
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
      .is("tontine_id", null)
      .order("created_at", { ascending: true })
      .limit(100);
    return data ?? [];
  }

  if (conversationType === "tontine" && tontineId) {
    const { data } = await sb
      .from("messages")
      .select("*")
      .eq("tontine_id", tontineId)
      .order("created_at", { ascending: true })
      .limit(100);
    return data ?? [];
  }

  return [];
}

export async function sendMessage(body: { recipient_id?: string; tontine_id?: string; content: string }) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("messages")
    .insert({
      sender_id: me,
      recipient_id: body.recipient_id ?? null,
      tontine_id: body.tontine_id ?? null,
      content: body.content,
      is_read: false,
    })
    .select()
    .single();
  throwSb(error);
  return data;
}

export async function markMessageRead(id: string) {
  await getSupabase().from("messages").update({ is_read: true }).eq("id", id);
}

export async function listConversations() {
  const me = await uid();

  // My tontines (as member or owner)
  const { data: memberOf } = await getSupabase()
    .from("tontine_members")
    .select("tontine_id, tontines(id, name)")
    .eq("user_id", me);
  const { data: ownerOf } = await getSupabase()
    .from("tontines")
    .select("id, name")
    .eq("owner_id", me);

  const tontineMap: Record<string, string> = {};
  for (const m of memberOf ?? []) {
    const t = (m as any).tontines;
    if (t) tontineMap[t.id] = t.name;
  }
  for (const t of ownerOf ?? []) tontineMap[t.id] = t.name;

  return {
    admin_thread: true,
    tontines: Object.entries(tontineMap).map(([id, name]) => ({ id, name })),
  };
}

export async function adminListAllMessages() {
  const { data } = await getSupabase()
    .from("messages")
    .select("*")
    .is("tontine_id", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const userIds = [...new Set([
    ...(data ?? []).map((m: any) => m.sender_id),
    ...(data ?? []).map((m: any) => m.recipient_id).filter(Boolean),
  ])];
  const profileMap: Record<string, string> = {};
  try {
    const { data: profiles } = await getSupabase().from("profiles").select("id, full_name").in("id", userIds);
    for (const p of profiles ?? []) profileMap[p.id] = p.full_name ?? "—";
  } catch {}

  return (data ?? []).map((m: any) => ({
    ...m,
    sender_name: profileMap[m.sender_id] ?? "—",
    recipient_name: m.recipient_id ? (profileMap[m.recipient_id] ?? "—") : "Admin",
  }));
}

export async function adminSendMessageToUser(userId: string, content: string) {
  const me = await uid();
  const { error } = await getSupabase().from("messages").insert({
    sender_id: me,
    recipient_id: userId,
    tontine_id: null,
    content,
    is_read: false,
  });
  throwSb(error);
  return { detail: "Message envoyé" };
}

/* ── REFERRAL ────────────────────────────────────────────── */

function genReferralCode(): string {
  return Math.random().toString(36).toUpperCase().slice(2, 9);
}

export async function getReferralInfo() {
  const me = await uid();
  const { data: profile } = await getSupabase().from("profiles").select("referral_code, referral_bonus").eq("id", me).single();

  let referralCode = profile?.referral_code;
  if (!referralCode) {
    referralCode = genReferralCode();
    await getSupabase().from("profiles").update({ referral_code: referralCode }).eq("id", me);
  }

  const { data: referrals } = await getSupabase()
    .from("profiles")
    .select("full_name, created_at")
    .eq("referred_by", referralCode);

  return {
    invite_code: referralCode,
    referral_count: referrals?.length ?? 0,
    bonus_fcfa: profile?.referral_bonus ?? 0,
    bonus_points: referrals?.length ?? 0,
    referrals: (referrals ?? []).map((r: any) => ({ full_name: r.full_name, joined_at: r.created_at })),
  };
}

export async function applyReferralBonus(newUserId: string, referralCode: string) {
  // Find referrer
  const { data: referrer } = await getSupabase()
    .from("profiles")
    .select("id, referral_bonus")
    .eq("referral_code", referralCode)
    .single();
  if (!referrer) return;

  // Mark new user as referred
  await getSupabase().from("profiles").update({ referred_by: referralCode }).eq("id", newUserId);
  // Give referrer 500 FCFA bonus
  const current = Number(referrer.referral_bonus ?? 0);
  await getSupabase().from("profiles").update({ referral_bonus: current + 500 }).eq("id", referrer.id);
  // Notify referrer
  await getSupabase().from("notifications").insert({
    user_id: referrer.id,
    title: "Bonus de parrainage 🎁",
    body: "Un nouveau membre a rejoint HODIX avec votre code ! +500 FCFA bonus ajoutés à votre compte.",
    type: "referral",
  });
}

export async function sendWelcomeMessage(userId: string, fullName: string) {
  // Generate referral code for new user
  const code = genReferralCode();
  await getSupabase().from("profiles").update({ referral_code: code }).eq("id", userId);

  await getSupabase().from("notifications").insert({
    user_id: userId,
    title: `Bienvenue sur HODIX, ${fullName} ! 🎉`,
    body: `Votre compte est créé. Votre code de parrainage personnel est : ${code}\n\nPartagez-le à vos proches et gagnez 500 FCFA de bonus par inscription ! Ce bonus est utilisable directement en cotisation dans vos tontines.`,
    type: "welcome",
    is_read: false,
  });
}

/* ── STREAKS ─────────────────────────────────────────────── */

export interface StreakData {
  current_streak: number;       // consecutive weeks/months with a contribution
  best_streak: number;
  total_contributions: number;
  last_contribution_at: string | null;
  milestones: number[];         // streaks at which user earned badge (4, 8, 12, 26, 52)
  is_at_risk: boolean;          // no contribution this cycle yet
}

export async function getStreakData(): Promise<StreakData> {
  const me = await uid();
  const sb = getSupabase();

  const { data: contribs } = await sb
    .from("tontine_contributions")
    .select("created_at, amount")
    .eq("user_id", me)
    .order("created_at", { ascending: true });

  const rows = contribs ?? [];

  // Build weekly buckets (ISO week strings "YYYY-WW")
  function isoWeek(d: Date): string {
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const week = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7);
    return `${d.getFullYear()}-${String(week).padStart(2, "0")}`;
  }

  const weekSet = new Set(rows.map((r: any) => isoWeek(new Date(r.created_at))));
  const weeks = Array.from(weekSet).sort();

  let current = 0; let best = 0; let run = 0;
  const now = new Date();
  const thisWeek = isoWeek(now);
  const lastWeek = isoWeek(new Date(now.getTime() - 7 * 86400000));

  for (let i = 0; i < weeks.length; i++) {
    if (i === 0) { run = 1; continue; }
    const prev = new Date(weeks[i - 1] + "-1");
    const curr = new Date(weeks[i] + "-1");
    const diffWeeks = Math.round((curr.getTime() - prev.getTime()) / (7 * 86400000));
    if (diffWeeks <= 1) { run++; } else { run = 1; }
    if (run > best) best = run;
  }
  current = run;
  if (best < current) best = current;

  const milestones = [4, 8, 12, 26, 52].filter(m => best >= m);
  const last = rows.length > 0 ? rows[rows.length - 1].created_at : null;
  const isAtRisk = !weekSet.has(thisWeek) && !weekSet.has(lastWeek) && rows.length > 0;

  // Award +10 trust points for each NEW monthly milestone (12, 26, 52 weeks)
  if ([12, 26, 52].includes(current)) {
    const eventKey = `streak_${current}`;
    const { count } = await sb.from("identity_events").select("*", { count: "exact", head: true })
      .eq("user_id", me).eq("event_type", eventKey);
    if ((count ?? 0) === 0) {
      await sb.from("identity_events").insert({ user_id: me, event_type: eventKey, score_delta: 10 });
      await sb.from("notifications").insert({
        user_id: me,
        title: `🔥 ${current} semaines consécutives !`,
        body: `Incroyable ! Vous avez cotisé ${current} semaines d'affilée. +10 pts Trust Score gagné !`,
        type: "streak_milestone",
      });
    }
  }

  return {
    current_streak: current,
    best_streak: best,
    total_contributions: rows.length,
    last_contribution_at: last,
    milestones,
    is_at_risk: isAtRisk,
  };
}

/* ── LEADERBOARD ─────────────────────────────────────────── */

export async function getTontineLeaderboard(tontineId: string) {
  const { data, error } = await getSupabase()
    .from("tontine_contributions")
    .select("user_id, amount, profiles(full_name, country)")
    .eq("tontine_id", tontineId);
  throwSb(error);

  // Aggregate by user
  const totals: Record<string, { name: string; country: string | null; total: number }> = {};
  for (const c of (data ?? []) as any[]) {
    const uid = c.user_id;
    if (!totals[uid]) totals[uid] = { name: c.profiles?.full_name ?? "Membre", country: c.profiles?.country ?? null, total: 0 };
    totals[uid].total += Number(c.amount);
  }

  return Object.entries(totals)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([, v], i) => {
      // Mask name: "Marie Dupont" → "Marie D."
      const parts = v.name.trim().split(" ");
      const masked = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : v.name;
      return { rank: i + 1, display_name: masked, country: v.country, total: v.total };
    });
}

export async function getRegionalRanking(country: string) {
  const sb = getSupabase();
  // Get all users from this country with their trust score snapshots
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, full_name, country")
    .eq("country", country)
    .limit(200);

  if (!profiles?.length) return { ranking: [], my_rank: null, is_pillar: false, total_users: 0 };

  const me = await uid();
  const userIds = profiles.map((p: any) => p.id);

  // Get latest trust score for each user from identity_events
  const { data: events } = await sb
    .from("identity_events")
    .select("user_id, score_delta, created_at")
    .in("user_id", userIds)
    .eq("event_type", "credit_score_snapshot")
    .order("created_at", { ascending: false });

  const scoreMap: Record<string, number> = {};
  for (const e of (events ?? []) as any[]) {
    if (!(e.user_id in scoreMap)) scoreMap[e.user_id] = e.score_delta ?? 0;
  }

  const ranked = profiles
    .map((p: any) => ({ id: p.id, name: p.full_name, score: scoreMap[p.id] ?? 0, country: p.country }))
    .sort((a, b) => b.score - a.score)
    .map((u, i) => {
      const parts = u.name?.trim().split(" ") ?? ["Membre"];
      const masked = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : u.name;
      return { rank: i + 1, display_name: masked, score: u.score, is_me: u.id === me };
    });

  const myEntry = ranked.find(r => r.is_me);
  const myRank = myEntry?.rank ?? null;
  const isPillar = myRank !== null && myRank <= Math.ceil(ranked.length * 0.05);

  // Award "Pilier" title if newly earned
  if (isPillar) {
    const { count } = await sb.from("identity_events").select("*", { count: "exact", head: true })
      .eq("user_id", me).eq("event_type", "pillar_earned");
    if ((count ?? 0) === 0) {
      await sb.from("identity_events").insert({ user_id: me, event_type: "pillar_earned", score_delta: 0 });
      await sb.from("notifications").insert({
        user_id: me,
        title: "🏆 Pilier de la communauté !",
        body: `Vous faites partie du top 5% des épargnants de votre région. Titre spécial ajouté à votre profil !`,
        type: "pillar_earned",
      });
    }
  }

  return {
    ranking: ranked.slice(0, 10),
    my_rank: myRank,
    total_users: ranked.length,
    is_pillar: isPillar,
  };
}

/* ── FAMILY ACCOUNTS ─────────────────────────────────────── */

export async function linkFamilyMember(childEmail: string, relationship: "enfant" | "conjoint" | "parent") {
  const me = await uid();
  const sb = getSupabase();

  const { data: child } = await sb.from("profiles").select("id, full_name").eq("email", childEmail).single();
  if (!child) throw { status: 404, detail: "Aucun compte trouvé avec cet email" };

  // Store in notifications table as family_link request (same pattern as join_request)
  const { error } = await sb.from("notifications").insert({
    user_id: child.id,
    title: "Invitation famille HODIX",
    body: `Un membre vous invite à rejoindre son compte famille (${relationship}).`,
    type: "family_link_request",
    metadata: { requester_id: me, relationship },
  });
  throwSb(error);
  return { status: "pending", child_name: child.full_name };
}

export async function getFamilyOverview() {
  const me = await uid();
  const sb = getSupabase();

  // Look for family links where I am the primary or secondary
  const { data: links } = await sb
    .from("notifications")
    .select("user_id, metadata, created_at")
    .eq("type", "family_link_accepted")
    .or(`user_id.eq.${me},metadata->>requester_id.eq.${me}`);

  if (!links?.length) return { members: [], combined_savings: 0, goals: [] };

  const memberIds = new Set<string>([me]);
  for (const l of links as any[]) {
    memberIds.add(l.user_id);
    if (l.metadata?.requester_id) memberIds.add(l.metadata.requester_id);
  }

  const ids = Array.from(memberIds);
  const [profilesRes, goalsRes] = await Promise.all([
    sb.from("profiles").select("id, full_name, country").in("id", ids),
    sb.from("savings_goals").select("user_id, name, current_amount, target_amount, savings_type").in("user_id", ids),
  ]);

  const profiles = profilesRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const combinedSavings = goals.reduce((s: number, g: any) => s + Number(g.current_amount), 0);

  return {
    members: profiles.map((p: any) => ({ id: p.id, name: p.full_name, is_me: p.id === me })),
    combined_savings: combinedSavings,
    goals: goals.map((g: any) => ({
      ...g,
      owner_name: profiles.find((p: any) => p.id === g.user_id)?.full_name ?? "Membre",
    })),
  };
}

/* ── SMART ALERTS ────────────────────────────────────────── */

export interface SmartAlert {
  id: string;
  type: "savings_drop" | "missed_contribution" | "streak_risk" | "goal_behind";
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  action_label?: string;
  action_route?: string;
}

export async function getSmartAlerts(): Promise<SmartAlert[]> {
  const me = await uid();
  const sb = getSupabase();
  const now = new Date();
  const alerts: SmartAlert[] = [];

  const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();

  const [savingsTxRes, goalsRes, contribRes] = await Promise.all([
    sb.from("savings_transactions").select("amount, type, created_at").eq("user_id", me).gte("created_at", twoMonthsAgo),
    sb.from("savings_goals").select("id, name, current_amount, target_amount, deadline").eq("user_id", me),
    sb.from("tontine_contributions").select("created_at, tontine_id").eq("user_id", me).gte("created_at", twoMonthsAgo),
  ]);

  const tx = savingsTxRes.data ?? [];
  const goals = goalsRes.data ?? [];

  // 1. Savings drop detection: compare last month vs month before
  const thisMonthDeposits = tx.filter((t: any) => t.type === "deposit" && t.created_at >= oneMonthAgo)
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const prevMonthDeposits = tx.filter((t: any) => t.type === "deposit" && t.created_at < oneMonthAgo)
    .reduce((s: number, t: any) => s + Number(t.amount), 0);

  if (prevMonthDeposits > 0 && thisMonthDeposits < prevMonthDeposits * 0.6) {
    const dropPct = Math.round((1 - thisMonthDeposits / prevMonthDeposits) * 100);
    alerts.push({
      id: "savings_drop",
      type: "savings_drop",
      severity: "warning",
      title: `📉 Épargne en baisse de ${dropPct}%`,
      body: `Vous avez déposé ${dropPct}% de moins ce mois par rapport au mois dernier. Restez sur la bonne voie !`,
      action_label: "Déposer maintenant",
      action_route: "/(tabs)/savings",
    });
  }

  // 2. Goal behind schedule
  for (const g of goals as any[]) {
    if (!g.deadline || !g.target_amount) continue;
    const deadline = new Date(g.deadline);
    const monthsLeft = (deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth());
    const remaining = Number(g.target_amount) - Number(g.current_amount);
    if (monthsLeft > 0 && remaining > 0) {
      const neededPerMonth = remaining / monthsLeft;
      const actualPerMonth = thisMonthDeposits;
      if (actualPerMonth > 0 && actualPerMonth < neededPerMonth * 0.7) {
        alerts.push({
          id: `goal_behind_${g.id}`,
          type: "goal_behind",
          severity: "warning",
          title: `🎯 "${g.name}" en retard`,
          body: `Il vous faut ${Math.round(neededPerMonth).toLocaleString()} XAF/mois pour atteindre votre objectif à temps.`,
          action_label: "Voir l'objectif",
          action_route: `/savings/${g.id}`,
        });
      }
    }
  }

  // 3. Streak at risk (no contribution this week)
  const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const contribs = contribRes.data ?? [];
  const contribThisWeek = contribs.some((c: any) => new Date(c.created_at) >= thisWeekStart);
  const hadPreviousContribs = contribs.length > 0;
  if (!contribThisWeek && hadPreviousContribs && now.getDay() >= 4) {
    alerts.push({
      id: "streak_risk",
      type: "streak_risk",
      severity: "critical",
      title: "🔥 Votre streak est en danger !",
      body: "Vous n'avez pas encore cotisé cette semaine. Cotisez avant dimanche pour maintenir votre série !",
      action_label: "Cotiser maintenant",
      action_route: "/(tabs)/community",
    });
  }

  return alerts;
}

/* ── NFT CERTIFICATES (hash-based verification) ─────────── */

export async function mintCertificateHash(docId: string, docType: string): Promise<{ hash: string; verify_url: string; polygon_stub: string }> {
  const me = await uid();
  const { data: profile } = await getSupabase().from("profiles").select("full_name").eq("id", me).single();

  // Deterministic hash from user + doc + timestamp
  const payload = `${me}:${docId}:${docType}:${profile?.full_name ?? ""}`;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) - hash) + payload.charCodeAt(i);
    hash |= 0;
  }
  const hexHash = Math.abs(hash).toString(16).padStart(8, "0") + docId.replace(/-/g, "").slice(0, 24);

  // Store hash in identity_events for on-chain verification simulation
  await getSupabase().from("identity_events").insert({
    user_id: me,
    event_type: "nft_certificate",
    score_delta: 0,
    metadata: { doc_id: docId, doc_type: docType, hash: hexHash },
  } as any);

  return {
    hash: hexHash,
    verify_url: `https://hodix.app/verify/${hexHash}`,
    polygon_stub: `0x${hexHash}`, // Stub — production would be actual Polygon tx hash
  };
}

/* ══════════════════════════════════════════════════════════════
   TONTINE SECURITY SYSTEM
   Level 1 — Opportunist prevention
   Level 2 — Recidivist friction
   Level 3 — Community coverage
   ══════════════════════════════════════════════════════════════ */

/* ── Constants ───────────────────────────────────────────────── */

const TRUST_SCORE_PUBLIC_TONTINE = 300;     // minimum to create a public tontine
const TRUST_SCORE_HIGH_VALUE     = 600;     // minimum for tontines > HIGH_VALUE_THRESHOLD
const HIGH_VALUE_THRESHOLD       = 100_000; // XAF per cycle
const KYC_REQUIRED_THRESHOLD     = 50_000;  // XAF per cycle requires KYC
const ESCROW_HOURS               = 72;      // first cycle held for 72h
const RESERVE_FUND_PCT           = 0.02;    // 2% of each contribution → reserve

/* ── Level 1: Security-aware createTontine ───────────────────── */

export async function createTontineSecure(body: Record<string, any>) {
  const me = await uid();
  const sb = getSupabase();

  // Check blacklist
  const { data: profile } = await sb.from("profiles").select("trust_flags, kyc_status, phone").eq("id", me).single();
  if ((profile?.trust_flags ?? []).includes("blacklisted"))
    throw { status: 403, detail: "Votre compte est suspendu pour fraude. Contactez le support." };

  // Fetch user role for admin bypass
  const { data: profileData } = await sb.from("profiles").select("role").eq("id", me).single();
  const isAdmin = profileData?.role === "admin" || profileData?.role === "superadmin";

  const amountPerCycle = Number(body.amount_per_cycle ?? 0);

  if (!isAdmin) {
    // Trust Score gate for public tontines
    if (body.is_public) {
      const tsRes = await sb.from("identity_scores").select("score").eq("user_id", me).maybeSingle();
      const score = tsRes?.data?.score ?? 0;
      const required = amountPerCycle >= HIGH_VALUE_THRESHOLD
        ? TRUST_SCORE_HIGH_VALUE
        : TRUST_SCORE_PUBLIC_TONTINE;
      if (score < required)
        throw { status: 403, detail: `Trust Score insuffisant pour une tontine publique (requis: ${required}, votre score: ${score}). Participez à des tontines privées d'abord.` };
    }

    // KYC gate for high-value tontines
    if (amountPerCycle >= KYC_REQUIRED_THRESHOLD) {
      const kycStatus = profile?.kyc_status ?? null;
      if (kycStatus !== "approved")
        throw { status: 403, detail: `Vérification d'identité (KYC) obligatoire pour les tontines supérieures à ${KYC_REQUIRED_THRESHOLD.toLocaleString()} XAF/cycle.` };
    }
  }

  const code = inviteCode();
  const { data, error } = await sb.from("tontines")
    .insert({
      ...body,
      owner_id: me,
      invite_code: code,
      reserve_fund: 0,
      security_level: amountPerCycle >= HIGH_VALUE_THRESHOLD ? "high" : "standard",
    })
    .select()
    .single();
  throwSb(error);

  // ── RULE: Creator goes LAST (position = max_members)
  // We don't know how many will join, so we set a sentinel value.
  // When all members have joined, the creator's position is updated to max.
  const maxMembers = Number(body.max_members ?? 12);
  await sb.from("tontine_members").insert({
    tontine_id: data.id,
    user_id: me,
    role: "admin",
    rotation_position: maxMembers, // creator always last
    is_creator: true,
  });

  return data;
}

/* ── Level 1: Security-aware joinTontine ────────────────────── */

export async function joinTontineSecure(invite_code: string) {
  const me = await uid();
  const sb = getSupabase();

  // Check blacklist
  const { data: profile } = await sb.from("profiles").select("trust_flags, kyc_status, device_fingerprint").eq("id", me).single();
  if ((profile?.trust_flags ?? []).includes("blacklisted"))
    throw { status: 403, detail: "Votre compte est suspendu. Contactez le support." };

  const { data: tontine, error } = await sb.from("tontines")
    .select("*").eq("invite_code", invite_code.trim().toUpperCase()).single();
  if (error || !tontine) throw { status: 404, detail: "Code d'invitation invalide" };

  // KYC gate
  if (Number(tontine.amount_per_cycle) >= KYC_REQUIRED_THRESHOLD) {
    if ((profile?.kyc_status ?? null) !== "approved")
      throw { status: 403, detail: `Cette tontine requiert une vérification d'identité (cotisation ≥ ${KYC_REQUIRED_THRESHOLD.toLocaleString()} XAF).` };
  }

  // Check if device is flagged
  if (profile?.device_fingerprint) {
    const { data: flaggedDevice } = await sb.from("flagged_devices")
      .select("id").eq("fingerprint", profile.device_fingerprint).maybeSingle();
    if (flaggedDevice)
      throw { status: 403, detail: "Appareil signalé pour activité frauduleuse." };
  }

  const { count } = await sb.from("tontine_members")
    .select("*", { count: "exact", head: true }).eq("tontine_id", tontine.id);
  if ((count ?? 0) >= tontine.max_members)
    throw { status: 400, detail: "La tontine est complète" };

  // Already a member?
  const { count: alreadyIn } = await sb.from("tontine_members")
    .select("*", { count: "exact", head: true }).eq("tontine_id", tontine.id).eq("user_id", me);
  if ((alreadyIn ?? 0) > 0)
    throw { status: 400, detail: "Vous êtes déjà membre de cette tontine" };

  // Assign next available position (skip the creator's reserved last slot)
  const nextPosition = (count ?? 0) + 1;
  const { error: e2 } = await sb.from("tontine_members").insert({
    tontine_id: tontine.id, user_id: me, role: "member", rotation_position: nextPosition,
  });
  throwSb(e2);

  // Notify creator of new member
  await sb.from("notifications").insert({
    user_id: tontine.owner_id,
    title: "Nouveau membre 🎉",
    body: `Un nouveau membre a rejoint votre tontine "${tontine.name}".`,
    type: "new_member",
    metadata: { tontine_id: tontine.id },
  });

  return { tontine_id: tontine.id };
}

/* ── Level 1: Security-aware contributeTontine ──────────────── */

export async function contributeTontineSecure(id: string, amount: number) {
  const me = await uid();
  const sb = getSupabase();

  const { data: tontine } = await sb.from("tontines")
    .select("current_cycle, amount_per_cycle, max_members, reserve_fund, owner_id, name")
    .eq("id", id).single();
  if (!tontine) throw { status: 404, detail: "Tontine introuvable" };

  const cycle = tontine.current_cycle ?? 1;
  const isFirstCycle = cycle === 1;

  // Reserve fund: 2% withheld automatically
  const reserveAmount = Math.round(amount * RESERVE_FUND_PCT);
  const netAmount = amount - reserveAmount;

  // Insert contribution
  const { error } = await sb.from("tontine_contributions").insert({
    tontine_id: id, user_id: me, amount: netAmount, cycle,
    gross_amount: amount, reserve_amount: reserveAmount,
  });
  throwSb(error);

  // Increment reserve fund on tontine
  const currentReserve = Number(tontine.reserve_fund ?? 0);
  await sb.from("tontines").update({ reserve_fund: currentReserve + reserveAmount }).eq("id", id);

  // Mark member as up-to-date
  await sb.from("tontine_members")
    .update({ status: "a_jour", last_paid_cycle: cycle })
    .eq("tontine_id", id).eq("user_id", me);

  // If first cycle: create escrow record (hold disbursement for 72h)
  if (isFirstCycle) {
    const { count: paidCount } = await sb.from("tontine_contributions")
      .select("*", { count: "exact", head: true }).eq("tontine_id", id).eq("cycle", 1);

    const membersCount = Number(tontine.max_members ?? 12);
    // When all members have paid cycle 1, create escrow
    if ((paidCount ?? 0) >= membersCount - 1) { // -1 because we just inserted
      const releaseAt = new Date(Date.now() + ESCROW_HOURS * 3600 * 1000).toISOString();
      await sb.from("tontine_escrow").upsert({
        tontine_id: id,
        cycle: 1,
        amount: netAmount * membersCount,
        release_at: releaseAt,
        status: "held",
        dispute_count: 0,
      });
    }
  }

  await addIdentityEvent(me, "tontine_contribution", amount >= 50000 ? 1 : 0.5);
  return { detail: "Contribution enregistrée", reserve_deducted: reserveAmount, net_amount: netAmount };
}

/* ── Level 1: Escrow management ─────────────────────────────── */

export async function getEscrowStatus(tontineId: string) {
  const { data } = await getSupabase().from("tontine_escrow")
    .select("*").eq("tontine_id", tontineId).eq("cycle", 1).maybeSingle();
  if (!data) return { status: "none" };

  const now = new Date();
  const releaseAt = new Date(data.release_at);
  const hoursLeft = Math.max(0, (releaseAt.getTime() - now.getTime()) / 3600000);

  return {
    status: data.status,
    release_at: data.release_at,
    hours_left: Math.round(hoursLeft),
    dispute_count: data.dispute_count ?? 0,
    is_frozen: data.status === "disputed",
    amount: data.amount,
  };
}

export async function reportEscrowDispute(tontineId: string, reason: string) {
  const me = await uid();
  const sb = getSupabase();

  const { data: escrow } = await sb.from("tontine_escrow")
    .select("*").eq("tontine_id", tontineId).eq("cycle", 1).maybeSingle();
  if (!escrow) throw { status: 404, detail: "Aucun escrow actif pour cette tontine" };

  const newCount = (escrow.dispute_count ?? 0) + 1;
  const newStatus = newCount >= 2 ? "disputed" : "held";

  await sb.from("tontine_escrow").update({
    dispute_count: newCount,
    status: newStatus,
  }).eq("tontine_id", tontineId).eq("cycle", 1);

  // Log dispute
  await sb.from("notifications").insert({
    user_id: escrow.tontine_id,
    title: `⚠️ Litige signalé — ${reason}`,
    body: `Un membre a signalé un litige pour le cycle 1 de la tontine. Fonds gelés en attente de résolution.`,
    type: "escrow_dispute",
    metadata: { tontine_id: tontineId, reporter_id: me, reason, dispute_count: newCount },
  });

  return { status: newStatus, dispute_count: newCount, frozen: newStatus === "disputed" };
}

/* ── Level 2: Device fingerprint registration ───────────────── */

export async function registerDeviceFingerprint(fingerprint: string) {
  const me = await uid();
  await getSupabase().from("profiles")
    .update({ device_fingerprint: fingerprint }).eq("id", me);
  return { registered: true };
}

/* ── Level 2: Blacklist & trust flags ───────────────────────── */

export async function flagUserAsFraud(targetUserId: string, reason: string) {
  const me = await uid();
  const sb = getSupabase();

  // Only admins or tontine managers can flag
  const { data: caller } = await sb.from("profiles").select("role").eq("id", me).single();
  if (!["super_admin", "tontine_manager"].includes(caller?.role ?? ""))
    throw { status: 403, detail: "Accès refusé" };

  // Update trust_flags array
  const { data: target } = await sb.from("profiles").select("trust_flags, full_name").eq("id", targetUserId).single();
  const currentFlags: string[] = target?.trust_flags ?? [];
  if (!currentFlags.includes("blacklisted")) currentFlags.push("blacklisted");
  if (!currentFlags.includes("fraud_confirmed")) currentFlags.push("fraud_confirmed");

  await sb.from("profiles").update({
    trust_flags: currentFlags,
    is_active: false,
  }).eq("id", targetUserId);

  // Store device fingerprint in flagged_devices
  const { data: targetProfile } = await sb.from("profiles")
    .select("device_fingerprint, phone").eq("id", targetUserId).single();
  if (targetProfile?.device_fingerprint) {
    await sb.from("flagged_devices").upsert({
      fingerprint: targetProfile.device_fingerprint,
      user_id: targetUserId,
      reason,
      flagged_at: new Date().toISOString(),
    });
  }

  // Record in identity events — Trust Score → 0
  await sb.from("identity_events").insert({
    user_id: targetUserId,
    event_type: "fraud_flag",
    score_delta: -9999, // effectively zeroes the score
    metadata: { reason, flagged_by: me },
  } as any);

  // Notify target
  await sb.from("notifications").insert({
    user_id: targetUserId,
    title: "⛔ Compte suspendu",
    body: `Votre compte a été suspendu pour activité frauduleuse : ${reason}. Contactez support@hodix.app.`,
    type: "account_suspended",
  });

  return { flagged: true, name: target?.full_name };
}

export async function getUserTrustFlags(userId: string) {
  const { data } = await getSupabase().from("profiles")
    .select("trust_flags, full_name, phone").eq("id", userId).single();
  return {
    flags: data?.trust_flags ?? [],
    is_blacklisted: (data?.trust_flags ?? []).includes("blacklisted"),
    has_fraud_confirmed: (data?.trust_flags ?? []).includes("fraud_confirmed"),
    name: data?.full_name,
  };
}

/* ── Level 3: Exclusion vote ────────────────────────────────── */

export async function voteExclusion(tontineId: string, targetUserId: string, reason: string) {
  const me = await uid();
  const sb = getSupabase();

  // Verify voter is a member
  const { count: isMember } = await sb.from("tontine_members")
    .select("*", { count: "exact", head: true })
    .eq("tontine_id", tontineId).eq("user_id", me);
  if (!isMember) throw { status: 403, detail: "Vous devez être membre pour voter" };

  // Record vote (upsert prevents double voting)
  await sb.from("exclusion_votes").upsert({
    tontine_id: tontineId,
    target_user_id: targetUserId,
    voter_id: me,
    reason,
    voted_at: new Date().toISOString(),
  });

  // Count total votes vs total members
  const [{ count: voteCount }, { count: memberCount }] = await Promise.all([
    sb.from("exclusion_votes").select("*", { count: "exact", head: true })
      .eq("tontine_id", tontineId).eq("target_user_id", targetUserId),
    sb.from("tontine_members").select("*", { count: "exact", head: true })
      .eq("tontine_id", tontineId),
  ]);

  const threshold = Math.ceil((memberCount ?? 1) * 0.6); // 60% majority
  const excluded = (voteCount ?? 0) >= threshold;

  if (excluded) {
    // Execute exclusion
    await sb.from("tontine_members")
      .update({ status: "exclu", excluded_at: new Date().toISOString(), exclusion_reason: reason })
      .eq("tontine_id", tontineId).eq("user_id", targetUserId);

    // Drop Trust Score
    await addIdentityEvent(targetUserId, "exclusion_vote_lost", -50);

    // Notify excluded
    const { data: tontine } = await sb.from("tontines").select("name").eq("id", tontineId).single();
    await sb.from("notifications").insert({
      user_id: targetUserId,
      title: "⛔ Exclusion de tontine",
      body: `Vous avez été exclu(e) de la tontine "${tontine?.name ?? ""}" par vote des membres.`,
      type: "exclusion",
      metadata: { tontine_id: tontineId, reason },
    });
  }

  return {
    votes: voteCount ?? 0,
    threshold,
    excluded,
    percent: Math.round(((voteCount ?? 0) / (memberCount ?? 1)) * 100),
  };
}

export async function getExclusionVotes(tontineId: string) {
  const sb = getSupabase();
  const { data } = await sb.from("exclusion_votes")
    .select("target_user_id, voter_id, reason, voted_at, profiles!target_user_id(full_name)")
    .eq("tontine_id", tontineId);

  // Group by target
  const grouped: Record<string, { name: string; count: number; reasons: string[] }> = {};
  for (const v of (data ?? []) as any[]) {
    const tid = v.target_user_id;
    if (!grouped[tid]) grouped[tid] = { name: v.profiles?.full_name ?? "Membre", count: 0, reasons: [] };
    grouped[tid].count++;
    if (v.reason && !grouped[tid].reasons.includes(v.reason)) grouped[tid].reasons.push(v.reason);
  }

  const { count: memberCount } = await sb.from("tontine_members")
    .select("*", { count: "exact", head: true }).eq("tontine_id", tontineId);
  const threshold = Math.ceil((memberCount ?? 1) * 0.6);

  return Object.entries(grouped).map(([userId, g]) => ({
    user_id: userId,
    display_name: g.name,
    vote_count: g.count,
    threshold,
    percent: Math.round((g.count / (memberCount ?? 1)) * 100),
    reasons: g.reasons,
    will_be_excluded: g.count >= threshold,
  }));
}

/* ── Level 3: Creator rating ────────────────────────────────── */

export async function rateCreator(tontineId: string, rating: number, comment?: string) {
  const me = await uid();
  const sb = getSupabase();

  if (rating < 1 || rating > 5) throw { status: 400, detail: "Note entre 1 et 5" };

  const { data: tontine } = await sb.from("tontines").select("owner_id").eq("id", tontineId).single();
  if (!tontine) throw { status: 404, detail: "Tontine introuvable" };

  // Voter must be a past/current member
  const { count } = await sb.from("tontine_members")
    .select("*", { count: "exact", head: true }).eq("tontine_id", tontineId).eq("user_id", me);
  if (!count) throw { status: 403, detail: "Vous devez avoir été membre pour noter" };

  await sb.from("creator_ratings").upsert({
    tontine_id: tontineId,
    rater_id: me,
    creator_id: tontine.owner_id,
    rating,
    comment: comment ?? null,
    rated_at: new Date().toISOString(),
  });

  return { rated: true };
}

export async function getCreatorReputation(creatorId: string) {
  const { data } = await getSupabase().from("creator_ratings")
    .select("rating, comment, rated_at").eq("creator_id", creatorId);

  const ratings = (data ?? []).map((r: any) => Number(r.rating));
  if (!ratings.length) return { avg: null, count: 0, distribution: {}, comments: [] };

  const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratings) distribution[r] = (distribution[r] ?? 0) + 1;

  return {
    avg: Math.round(avg * 10) / 10,
    count: ratings.length,
    distribution,
    comments: (data ?? [])
      .filter((r: any) => r.comment)
      .slice(0, 5)
      .map((r: any) => ({ text: r.comment, date: r.rated_at })),
  };
}

/* ── Level 3: Reserve fund status ───────────────────────────── */

export async function getTontineReserveFund(tontineId: string) {
  const me = await uid();
  const sb = getSupabase();

  const { data: tontine } = await sb.from("tontines")
    .select("reserve_fund, amount_per_cycle, max_members, owner_id, name")
    .eq("id", tontineId).single();
  if (!tontine) throw { status: 404, detail: "Tontine introuvable" };

  const memberCount = Number(tontine.max_members ?? 1);
  const fullCycleFund = Number(tontine.amount_per_cycle) * memberCount;
  const coveragePercent = fullCycleFund > 0
    ? Math.min(100, Math.round((Number(tontine.reserve_fund) / fullCycleFund) * 100))
    : 0;

  return {
    reserve: Number(tontine.reserve_fund ?? 0),
    full_cycle_cost: fullCycleFund,
    coverage_percent: coveragePercent,
    covers_full_cycle: Number(tontine.reserve_fund) >= fullCycleFund,
    is_owner: tontine.owner_id === me,
  };
}

/* ── Overdue detection ───────────────────────────────────────── */

export async function getOverdueMembers(tontineId: string) {
  const sb = getSupabase();
  const { data: tontine } = await sb.from("tontines")
    .select("current_cycle, cycle_deadline, owner_id").eq("id", tontineId).single();
  if (!tontine) return [];

  const cycle = tontine.current_cycle ?? 1;
  const deadline = tontine.cycle_deadline ? new Date(tontine.cycle_deadline) : null;
  const now = new Date();
  const isOverdue = deadline && now > deadline;

  const { data: members } = await sb.from("tontine_members")
    .select("user_id, last_paid_cycle, status, profiles(full_name)")
    .eq("tontine_id", tontineId)
    .neq("status", "exclu");

  return (members ?? [])
    .filter((m: any) => (m.last_paid_cycle ?? 0) < cycle)
    .map((m: any) => ({
      user_id: m.user_id,
      name: m.profiles?.full_name ?? "Membre",
      last_paid_cycle: m.last_paid_cycle ?? 0,
      cycles_late: cycle - (m.last_paid_cycle ?? 0),
      is_overdue: isOverdue,
      days_overdue: deadline && isOverdue
        ? Math.round((now.getTime() - deadline.getTime()) / 86400000)
        : 0,
    }));
}

/* ── TONTINE CREATOR CONSENT ─────────────────────────────────── */

export async function recordTontineConsent(version: string, tontineId?: string) {
  const me = await uid();
  const { error } = await getSupabase().from("tontine_consents").insert({
    user_id: me,
    version,
    tontine_id: tontineId ?? null,
    signed_at: new Date().toISOString(),
    // Store minimal context for legal proof
    platform: "hodix-mobile",
  });
  throwSb(error);
  return { signed: true, signed_at: new Date().toISOString(), version };
}

export async function hasSignedConsent(version: string): Promise<boolean> {
  const me = await uid();
  const { count } = await getSupabase()
    .from("tontine_consents")
    .select("*", { count: "exact", head: true })
    .eq("user_id", me)
    .eq("version", version);
  return (count ?? 0) > 0;
}

/* ══════════════════════════════════════════════════════════════
   WALLET SECURITY ENGINE — server-side enforcement
   ══════════════════════════════════════════════════════════════ */

/* ── Limits config ───────────────────────────────────────────── */
const LIMITS = {
  per_tx: 500_000,       // XAF max per single transaction
  daily: 1_000_000,      // XAF max per day
  weekly: 2_500_000,     // XAF max per week
  new_recipient: 100_000, // XAF max for first transfer to new number
  cooling_hours: 2,       // hours before first transfer to new recipient
};
const OTP_TTL_MIN = 10; // OTP valid for 10 minutes

/* ── PIN management (server-side hash storage) ───────────────── */

export async function setWalletPin(pinHash: string) {
  const me = await uid();
  await getSupabase().from("profiles").update({ wallet_pin_hash: pinHash }).eq("id", me);
  // Log security event
  await logSecurityEvent(me, "pin_set", {});
  return { ok: true };
}

export async function verifyWalletPin(pinHash: string): Promise<{ valid: boolean }> {
  const me = await uid();
  const { data } = await getSupabase().from("profiles")
    .select("wallet_pin_hash").eq("id", me).single();
  const valid = !!data?.wallet_pin_hash && data.wallet_pin_hash === pinHash;
  await logSecurityEvent(me, valid ? "pin_ok" : "pin_fail", {});
  return { valid };
}

export async function hasWalletPin(): Promise<boolean> {
  const me = await uid();
  const { data } = await getSupabase().from("profiles")
    .select("wallet_pin_hash").eq("id", me).single();
  return !!data?.wallet_pin_hash;
}

/* ── OTP for sensitive transactions ─────────────────────────── */

export async function generateTransactionOtp(): Promise<{ code: string; expires_at: string }> {
  const me = await uid();
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();

  // Store in notifications table (re-using existing table, type = "otp")
  await getSupabase().from("notifications").upsert({
    user_id: me,
    title: "Code de vérification HODIX",
    body: `Votre code : ${code}. Valable ${OTP_TTL_MIN} min. Ne le communiquez jamais.`,
    type: "otp",
    metadata: { code, expires_at: expiresAt },
    is_read: false,
  });

  await logSecurityEvent(me, "otp_generated", {});
  return { code, expires_at: expiresAt };
}

export async function verifyTransactionOtp(inputCode: string): Promise<{ valid: boolean; reason?: string }> {
  const me = await uid();
  const { data } = await getSupabase().from("notifications")
    .select("metadata, created_at")
    .eq("user_id", me).eq("type", "otp")
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();

  if (!data?.metadata) return { valid: false, reason: "Aucun OTP actif" };

  const meta = data.metadata as any;
  const expired = new Date() > new Date(meta.expires_at);
  if (expired) return { valid: false, reason: "Code expiré. Demandez un nouveau code." };
  if (meta.code !== inputCode.trim()) {
    await logSecurityEvent(me, "otp_fail", {});
    return { valid: false, reason: "Code incorrect" };
  }

  // Invalidate OTP after use
  await getSupabase().from("notifications").update({ is_read: true, metadata: { ...meta, used: true } })
    .eq("user_id", me).eq("type", "otp");

  await logSecurityEvent(me, "otp_ok", {});
  return { valid: true };
}

/* ── Transaction limits enforcement ─────────────────────────── */

export async function checkTransactionLimits(amountXaf: number): Promise<{ allowed: boolean; reason?: string }> {
  const me = await uid();
  const sb = getSupabase();

  if (amountXaf > LIMITS.per_tx)
    return { allowed: false, reason: `Montant max par transaction : ${LIMITS.per_tx.toLocaleString()} XAF` };

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();

  const [dayRes, weekRes] = await Promise.all([
    sb.from("wallet_transactions")
      .select("amount_xaf").eq("user_id", me)
      .in("type", ["withdraw", "transfer_out"]).gte("created_at", dayStart),
    sb.from("wallet_transactions")
      .select("amount_xaf").eq("user_id", me)
      .in("type", ["withdraw", "transfer_out"]).gte("created_at", weekStart),
  ]);

  const todayTotal = (dayRes.data ?? []).reduce((s: number, t: any) => s + Number(t.amount_xaf), 0);
  const weekTotal = (weekRes.data ?? []).reduce((s: number, t: any) => s + Number(t.amount_xaf), 0);

  if (todayTotal + amountXaf > LIMITS.daily)
    return { allowed: false, reason: `Plafond journalier atteint (${LIMITS.daily.toLocaleString()} XAF/jour)` };
  if (weekTotal + amountXaf > LIMITS.weekly)
    return { allowed: false, reason: `Plafond hebdomadaire atteint (${LIMITS.weekly.toLocaleString()} XAF/semaine)` };

  return { allowed: true };
}

/* ── Cooling period for new recipients ───────────────────────── */

export async function checkCoolingPeriod(recipientPhone: string): Promise<{ allowed: boolean; wait_minutes?: number }> {
  const me = await uid();
  const { data } = await getSupabase().from("wallet_transactions")
    .select("created_at").eq("user_id", me).eq("type", "transfer_out")
    .eq("mobile_money_number", recipientPhone)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();

  if (!data) {
    // First ever transfer to this number — apply cooling period
    const coolMs = LIMITS.cooling_hours * 3_600_000;
    // Check if there's a "recipient registered" event within cooling window
    const { data: regEvent } = await getSupabase().from("identity_events")
      .select("created_at").eq("user_id", me)
      .eq("event_type", `new_recipient:${recipientPhone}`)
      .maybeSingle();

    if (!regEvent) {
      // Register new recipient + start cooling
      await getSupabase().from("identity_events").insert({
        user_id: me,
        event_type: `new_recipient:${recipientPhone}`,
        score_delta: 0,
        metadata: { phone: recipientPhone, registered_at: new Date().toISOString() },
      } as any);
      return { allowed: false, wait_minutes: LIMITS.cooling_hours * 60 };
    }

    const elapsed = Date.now() - new Date(regEvent.created_at).getTime();
    if (elapsed < coolMs) {
      return { allowed: false, wait_minutes: Math.ceil((coolMs - elapsed) / 60000) };
    }
  }

  return { allowed: true };
}

/* ── Anomaly detection ───────────────────────────────────────── */

export interface AnomalyResult {
  risk: "low" | "medium" | "high";
  flags: string[];
  should_freeze: boolean;
}

export async function detectTransactionAnomalies(amountXaf: number, deviceFp?: string): Promise<AnomalyResult> {
  const me = await uid();
  const sb = getSupabase();
  const flags: string[] = [];

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  const [monthlyTxRes, hourlyTxRes, profileRes] = await Promise.all([
    sb.from("wallet_transactions").select("amount_xaf").eq("user_id", me)
      .in("type", ["withdraw", "transfer_out"]).gte("created_at", thirtyDaysAgo),
    sb.from("wallet_transactions").select("id").eq("user_id", me)
      .in("type", ["withdraw", "transfer_out"]).gte("created_at", oneHourAgo),
    sb.from("profiles").select("device_fingerprint").eq("id", me).single(),
  ]);

  const monthlyAmounts = (monthlyTxRes.data ?? []).map((t: any) => Number(t.amount_xaf));
  const avgMonthly = monthlyAmounts.length > 0
    ? monthlyAmounts.reduce((s, a) => s + a, 0) / monthlyAmounts.length : 0;
  const hourlyCount = hourlyTxRes.data?.length ?? 0;

  // Flag: amount 3× above average
  if (avgMonthly > 0 && amountXaf > avgMonthly * 3) flags.push("unusual_amount");
  // Flag: more than 3 withdrawals in 1 hour
  if (hourlyCount >= 3) flags.push("high_frequency");
  // Flag: new device
  if (deviceFp && profileRes.data?.device_fingerprint !== deviceFp) flags.push("new_device");
  // Flag: very large amount
  if (amountXaf >= 300_000) flags.push("large_amount");

  // Auto-freeze if high frequency or (new device + large amount)
  const shouldFreeze =
    flags.includes("high_frequency") ||
    (flags.includes("new_device") && flags.includes("large_amount"));

  if (shouldFreeze) {
    await sb.from("profiles").update({ wallet_frozen: true }).eq("id", me);
    await sb.from("notifications").insert({
      user_id: me,
      title: "⚠️ Wallet temporairement gelé",
      body: "Activité inhabituelle détectée sur votre wallet. Vérifiez vos transactions récentes ou contactez le support.",
      type: "security_freeze",
    });
    await logSecurityEvent(me, "wallet_frozen", { flags, amount: amountXaf });
  }

  const risk = shouldFreeze || flags.length >= 3 ? "high"
    : flags.length >= 1 ? "medium" : "low";

  return { risk, flags, should_freeze: shouldFreeze };
}

/* ── Wallet freeze / unfreeze ────────────────────────────────── */

export async function getWalletFreezeStatus(): Promise<{ frozen: boolean; reason?: string }> {
  const me = await uid();
  const { data } = await getSupabase().from("profiles")
    .select("wallet_frozen, trust_flags").eq("id", me).single();
  const frozen = !!(data?.wallet_frozen);
  const blacklisted = (data?.trust_flags ?? []).includes("blacklisted");
  return {
    frozen: frozen || blacklisted,
    reason: blacklisted ? "Compte suspendu pour fraude"
      : frozen ? "Activité suspecte détectée" : undefined,
  };
}

export async function unfreezeWallet(userId?: string) {
  const me = userId ?? await uid();
  await getSupabase().from("profiles").update({ wallet_frozen: false }).eq("id", me);
  await logSecurityEvent(me, "wallet_unfrozen", {});
  return { ok: true };
}

/* ── Security audit log ──────────────────────────────────────── */

export async function logSecurityEvent(userId: string, eventType: string, metadata: Record<string, any>) {
  // Re-use identity_events table — score_delta 0 for security events
  await getSupabase().from("identity_events").insert({
    user_id: userId,
    event_type: `sec:${eventType}`,
    score_delta: 0,
    metadata,
  } as any).throwOnError().then(() => {}).catch(() => {}); // fire-and-forget, never block
}

export async function getSecurityLog() {
  const me = await uid();
  const { data } = await getSupabase().from("identity_events")
    .select("event_type, created_at, metadata")
    .eq("user_id", me)
    .like("event_type", "sec:%")
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((e: any) => ({
    type: e.event_type.replace("sec:", ""),
    at: e.created_at,
    meta: e.metadata ?? {},
  }));
}

/* ── Combined pre-transaction security gate ──────────────────── */

export async function preTransactionCheck(amountXaf: number, recipientPhone?: string): Promise<{
  allowed: boolean;
  reason?: string;
  requires_pin: boolean;
  requires_otp: boolean;
  risk: string;
}> {
  // 1. Freeze check
  const freeze = await getWalletFreezeStatus();
  if (freeze.frozen) return { allowed: false, reason: freeze.reason, requires_pin: false, requires_otp: false, risk: "blocked" };

  // 2. Limits check
  const limits = await checkTransactionLimits(amountXaf);
  if (!limits.allowed) return { allowed: false, reason: limits.reason, requires_pin: false, requires_otp: false, risk: "blocked" };

  // 3. Cooling period check
  if (recipientPhone) {
    const cooling = await checkCoolingPeriod(recipientPhone);
    if (!cooling.allowed)
      return { allowed: false, reason: `Nouveau bénéficiaire — délai de sécurité de ${cooling.wait_minutes} min requis`, requires_pin: false, requires_otp: false, risk: "cooling" };
  }

  // 4. Anomaly detection
  const anomaly = await detectTransactionAnomalies(amountXaf);
  if (anomaly.should_freeze) return { allowed: false, reason: "Activité suspecte — wallet gelé. Contactez le support.", requires_pin: false, requires_otp: false, risk: "high" };

  // 5. Determine PIN/OTP requirement
  const requiresPin = amountXaf >= 5_000;
  const requiresOtp = amountXaf >= 100_000 || anomaly.risk === "high";

  return { allowed: true, requires_pin: requiresPin, requires_otp: requiresOtp, risk: anomaly.risk };
}
