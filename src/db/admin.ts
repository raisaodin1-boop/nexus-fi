import { getSupabase } from "@/src/supabase";
import { uid, cached, throwSb } from "./helpers";

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
      users: { total: (users as any[]).length, new_7d: new7d, new_30d: new30d, managers: (users as any[]).filter(u => u.role === "tontine_manager").length, admins: (users as any[]).filter(u => u.role === "super_admin" || u.role === "admin").length },
      tontines: { total: (allTontines as any[]).length, active: (allTontines as any[]).length, closed: 0 },
      associations: assocCount as number, cooperatives: coopCount as number,
      savings_volume: savingsVol, contributions_volume: contribVol,
      kyc: { pending: kycPending, approved: kycApproved }, user_series: userSeries,
      active_groups: { tontines: (allTontines as any[]).length, tontines_active: (allTontines as any[]).length, associations: assocCount as number, cooperatives: coopCount as number },
      score_distribution: { excellent: 0, very_good: 0, good: 0, emerging: 0, new: (users as any[]).length },
      tier_distribution: { bronze: (users as any[]).length, silver: 0, gold: 0, platinum: 0 },
      avg_trust_score: 0, savings_count: 0, tontine_contributions_volume: contribVol, tontine_contributions_count: 0,
      funds: { count: 0, balance: 0, collected: 0 }, payments: { count: 0, amount_minor: 0, commission_minor: 0, currency: "XAF" },
    };
  });
}

export async function getAdminStats() {
  const [users, tontines, kyc] = await Promise.all([
    getSupabase().from("profiles").select("*", { count: "exact", head: true }),
    getSupabase().from("tontines").select("*", { count: "exact", head: true }),
    getSupabase().from("kyc_submissions").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return { total_users: users.count ?? 0, total_tontines: tontines.count ?? 0, pending_kyc: kyc.count ?? 0 };
}

export async function adminListUsers(search = "") {
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
  let q = getSupabase().from("tontines")
    .select("id, name, amount_per_cycle, frequency, max_members, invite_code, created_at, owner_id")
    .order("created_at", { ascending: false }).limit(100);
  if (search) q = q.ilike("name", `%${search}%`);
  const { data, error } = await q;
  if (error) return [];
  const tontines = data ?? [];
  const ids = tontines.map((t: any) => t.id);

  const memberCounts: Record<string, number> = {};
  try {
    const { data: mc } = await getSupabase().from("tontine_members").select("tontine_id").in("tontine_id", ids);
    for (const m of mc ?? []) memberCounts[m.tontine_id] = (memberCounts[m.tontine_id] ?? 0) + 1;
  } catch {}

  const ownerIds = [...new Set(tontines.map((t: any) => t.owner_id))];
  const ownerNames: Record<string, string> = {};
  try {
    const { data: owners } = await getSupabase().from("profiles").select("id, full_name").in("id", ownerIds);
    for (const o of owners ?? []) ownerNames[o.id] = o.full_name ?? "—";
  } catch {}

  const statusMap: Record<string, { status: string; auto_close_date: string | null }> = {};
  try {
    const { data: sd } = await getSupabase().from("tontines").select("id, status, auto_close_date");
    if (sd) for (const t of sd) statusMap[t.id] = { status: t.status, auto_close_date: t.auto_close_date };
  } catch {}

  return tontines.map((t: any) => ({
    ...t, status: statusMap[t.id]?.status ?? "active", auto_close_date: statusMap[t.id]?.auto_close_date ?? null,
    owner_name: ownerNames[t.owner_id] ?? "—", members_count: memberCounts[t.id] ?? 0,
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
    .from("kyc_submissions").select("id, user_id, status, submitted_at").order("submitted_at", { ascending: false }).limit(100);
  if (error) return [];
  const userIds = [...new Set((data ?? []).map((k: any) => k.user_id))];
  const profileMap: Record<string, any> = {};
  try {
    const { data: profiles } = await getSupabase().from("profiles").select("id, full_name, phone, country").in("id", userIds);
    for (const p of profiles ?? []) profileMap[p.id] = p;
  } catch {}
  return (data ?? []).map((k: any) => ({
    ...k, full_name: profileMap[k.user_id]?.full_name ?? "—", phone: profileMap[k.user_id]?.phone ?? "—", country: profileMap[k.user_id]?.country ?? "—",
  }));
}

export async function adminHandleKyc(userId: string, approve: boolean) {
  const status = approve ? "approved" : "rejected";
  await getSupabase().from("kyc_submissions").update({ status, reviewed_at: new Date().toISOString() }).eq("user_id", userId);
  await getSupabase().from("profiles").update({ kyc_status: status }).eq("id", userId);
  const title = approve ? "KYC approuvé ✅" : "KYC refusé";
  const body = approve ? "Votre identité a été vérifiée avec succès." : "Votre dossier KYC a été refusé. Contactez le support.";
  await getSupabase().from("notifications").insert({ user_id: userId, title, body, type: "kyc" });
  return { detail: `KYC ${approve ? "approuvé" : "refusé"}` };
}

export async function createPromotionRequest(reason: string) {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw { status: 401, detail: "Non authentifié." };
  const { data: existing } = await getSupabase().from("notifications")
    .select("id, is_read, created_at").eq("user_id", user.id).eq("type", "promotion_request").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing && !existing.is_read) throw { status: 400, detail: "Vous avez déjà une demande en attente." };
  const { data, error } = await getSupabase().from("notifications")
    .insert({ user_id: user.id, title: "Demande de promotion Manager", body: reason, type: "promotion_request", is_read: false })
    .select("id, user_id, body, created_at, is_read").single();
  if (error) throw { status: 400, detail: error.message };
  return { id: data.id, user_id: data.user_id, reason: data.body, status: "pending", created_at: data.created_at };
}

export async function getMyPromotionRequest() {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw { status: 401, detail: "Non authentifié." };
  const { data } = await getSupabase().from("notifications")
    .select("id, user_id, body, created_at, is_read").eq("user_id", user.id).eq("type", "promotion_request").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return { id: data.id, user_id: data.user_id, reason: data.body, status: data.is_read ? "processed" : "pending", created_at: data.created_at };
}

export async function adminListPromotionRequests() {
  const { data } = await getSupabase().from("notifications")
    .select("id, user_id, body, created_at, is_read").eq("type", "promotion_request").order("created_at", { ascending: false }).limit(50);
  const userIds = [...new Set((data ?? []).map((n: any) => n.user_id))];
  const profileMap: Record<string, any> = {};
  try {
    const { data: profiles } = await getSupabase().from("profiles").select("id, full_name, phone").in("id", userIds);
    for (const p of profiles ?? []) profileMap[p.id] = p;
  } catch {}
  return (data ?? []).map((n: any) => ({
    id: n.id, user_id: n.user_id, full_name: profileMap[n.user_id]?.full_name ?? "—",
    phone: profileMap[n.user_id]?.phone ?? "—", body: n.body, created_at: n.created_at,
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
  for (let i = 0; i < rows.length; i += 100) {
    await getSupabase().from("notifications").insert(rows.slice(i, i + 100));
  }
  return { detail: `Message envoyé à ${profiles.length} membres` };
}

export async function getUsersSeries(days = 14) {
  return cached(`users-series`, 120_000, async () => {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await getSupabase().from("profiles").select("created_at").gte("created_at", since).order("created_at", { ascending: true });
    const byDate: Record<string, number> = {};
    for (const p of data ?? []) { const d = (p.created_at as string).slice(0, 10); byDate[d] = (byDate[d] ?? 0) + 1; }
    return { days, series: Object.entries(byDate).map(([date, value]) => ({ date, value })) };
  });
}
