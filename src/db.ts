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
    .single();
  throwSb(error);
  return data;
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
  // Group by date
  const byDate: Record<string, number> = {};
  for (const tx of data ?? []) {
    const d = (tx.created_at as string).slice(0, 10);
    byDate[d] = (byDate[d] ?? 0) + Number(tx.amount);
  }
  const series = Object.entries(byDate).map(([date, value]) => ({ date, value }));
  return { days, series };
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

/* ── KYC ─────────────────────────────────────────────────── */

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
  // Use individual try/catch so one missing column doesn't kill everything
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
  };
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
