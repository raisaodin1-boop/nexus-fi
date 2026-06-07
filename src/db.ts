/**
 * HODIX — Supabase data layer (replaces FastAPI/MongoDB backend)
 * All data operations go through this module using the Supabase JS client.
 */
import { getSupabase } from "@/src/supabase";

/* ── helpers ─────────────────────────────────────────────── */

async function uid(): Promise<string> {
  const { data } = await getSupabase().auth.getUser();
  if (!data.user) throw { status: 401, detail: "Non authentifié" };
  return data.user.id;
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

/* ── SAVINGS ─────────────────────────────────────────────── */

export async function listSavings() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("savings_goals")
    .select("*")
    .eq("user_id", me)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  throwSb(error);
  return data ?? [];
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
  return { detail: "Dépôt enregistré" };
}

/* ── IDENTITY ────────────────────────────────────────────── */

async function addIdentityEvent(user_id: string, event_type: string, points: number) {
  await getSupabase().from("identity_events").insert({ user_id, event_type, points_delta: points });
}

export async function getIdentity() {
  const me = await uid();
  const { data: sbUser } = await getSupabase().auth.getUser();

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

  const createdAt = sbUser.user?.created_at ?? new Date().toISOString();
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
      full_name: profile.full_name ?? sbUser.user?.user_metadata?.full_name ?? "",
      email: sbUser.user?.email ?? "",
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
  const { data, error } = await getSupabase()
    .from("notifications")
    .select("*")
    .eq("user_id", me)
    .order("created_at", { ascending: false })
    .limit(50);
  throwSb(error);
  return data ?? [];
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
