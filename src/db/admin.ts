import { getSupabase } from "@/src/supabase";
import { notifyUser } from "./notifications";
import { uid, cached, throwSb, invalidateCache, requireAdmin } from "./helpers";

const PENDING_KYC = ["pending", "pending_review"] as const;
const KYC_BUCKET = "kyc-documents";

async function signedKycUrl(path?: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await getSupabase().storage.from(KYC_BUCKET).createSignedUrl(path, 3600);
  if (error) {
    console.warn("signedKycUrl:", error.message);
    return null;
  }
  return data.signedUrl;
}

export function normalizeKycStatus(submissionStatus?: string | null, profileStatus?: string | null): string {
  const raw = profileStatus || submissionStatus || "not_submitted";
  if (raw === "pending") return "pending_review";
  if (raw === "verified") return "approved";
  return raw;
}

export function isKycPending(status?: string | null): boolean {
  return PENDING_KYC.includes((status ?? "") as (typeof PENDING_KYC)[number]);
}

export const EMPTY_ADMIN_ANALYTICS = {
  users: { total: 0, active: 0, new_7d: 0, new_30d: 0, managers: 0, admins: 0 },
  tontines: { total: 0, active: 0, closed: 0 },
  associations: 0,
  cooperatives: 0,
  savings_volume: 0,
  contributions_volume: 0,
  kyc: { pending: 0, approved: 0, level1: 0, level2_approved: 0, pending_review: 0 },
  user_series: [] as { date: string; value: number }[],
  active_groups: { tontines: 0, tontines_active: 0, associations: 0, cooperatives: 0 },
  score_distribution: { excellent: 0, very_good: 0, good: 0, emerging: 0, new: 0 },
  tier_distribution: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
  avg_trust_score: 0,
  savings_count: 0,
  tontine_contributions_volume: 0,
  tontine_contributions_count: 0,
  funds: { count: 0, balance: 0, collected: 0 },
  payments: { count: 0, amount_minor: 0, commission_minor: 0, currency: "XAF" },
};

export async function getAdminAnalytics() {
  try {
    await requireAdmin();
  } catch {
    return { ...EMPTY_ADMIN_ANALYTICS };
  }
  return cached("admin-analytics", 90_000, async () => {
    try {
    const safe = async <T>(fn: () => PromiseLike<T>, fallback: T): Promise<T> => {
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
      users: { total: (users as any[]).length, active: (users as any[]).length, new_7d: new7d, new_30d: new30d, managers: (users as any[]).filter(u => u.role === "tontine_manager").length, admins: (users as any[]).filter(u => u.role === "super_admin" || u.role === "admin").length },
      tontines: { total: (allTontines as any[]).length, active: (allTontines as any[]).length, closed: 0 },
      associations: assocCount as number, cooperatives: coopCount as number,
      savings_volume: savingsVol, contributions_volume: contribVol,
      kyc: { pending: kycPending, approved: kycApproved, level1: (users as any[]).length, level2_approved: kycApproved, pending_review: kycPending },
      user_series: userSeries,
      active_groups: { tontines: (allTontines as any[]).length, tontines_active: (allTontines as any[]).length, associations: assocCount as number, cooperatives: coopCount as number },
      score_distribution: { excellent: 0, very_good: 0, good: 0, emerging: 0, new: (users as any[]).length },
      tier_distribution: { bronze: (users as any[]).length, silver: 0, gold: 0, platinum: 0 },
      avg_trust_score: 0, savings_count: (savingsData as any[]).length, tontine_contributions_volume: contribVol, tontine_contributions_count: (contribData as any[]).length,
      funds: { count: 0, balance: 0, collected: 0 }, payments: { count: 0, amount_minor: 0, commission_minor: 0, currency: "XAF" },
    };
    } catch {
      return { ...EMPTY_ADMIN_ANALYTICS };
    }
  });
}

export async function getAdminStats() {
  await requireAdmin();
  const [users, tontines, kyc, promos] = await Promise.all([
    getSupabase().from("profiles").select("*", { count: "exact", head: true }),
    getSupabase().from("tontines").select("*", { count: "exact", head: true }),
    getSupabase().from("kyc_submissions").select("*", { count: "exact", head: true }).eq("status", "pending"),
    getSupabase().from("promotion_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return {
    total_users: users.count ?? 0,
    total_tontines: tontines.count ?? 0,
    pending_kyc: kyc.count ?? 0,
    pending_promotions: promos.count ?? 0,
  };
}

export async function adminListUsers(search = "", offset = 0, limit = 50) {
  await requireAdmin();
  const pageSize = Math.min(Math.max(limit, 1), 100);
  const from = Math.max(offset, 0);
  let q = getSupabase().from("profiles")
    .select("id, full_name, phone, email, role, created_at, country, city, kyc_status", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  const term = search.trim();
  if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data, error, count } = await q;
  if (error) return { items: [], total: 0, offset: from, limit: pageSize, has_more: false };
  const items = (data ?? []).map((u: any) => ({
    ...u,
    email: u.email ?? "",
    is_active: u.role !== "suspended",
  }));
  const total = count ?? items.length;
  return { items, total, offset: from, limit: pageSize, has_more: from + items.length < total };
}

export async function adminUpdateUserRole(userId: string, role: string) {
  await requireAdmin();
  const { error } = await getSupabase().from("profiles").update({ role }).eq("id", userId);
  throwSb(error);
  return { detail: "Rôle mis à jour" };
}

export async function adminDeactivateUser(userId: string) {
  await requireAdmin();
  const { error } = await getSupabase().from("profiles").update({ role: "suspended" }).eq("id", userId);
  throwSb(error);
  return { detail: "Utilisateur suspendu" };
}

export async function adminListTontines(search = "") {
  await requireAdmin();
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
  await requireAdmin();
  const { error } = await getSupabase().from("tontines").update(updates).eq("id", id);
  if (error) throw { status: 400, detail: "Erreur mise à jour — exécutez d'abord le SQL d'initialisation dans Supabase." };
  return { detail: "Tontine mise à jour" };
}

export async function adminDeleteTontine(id: string) {
  await requireAdmin();
  await getSupabase().from("tontine_contributions").delete().eq("tontine_id", id);
  await getSupabase().from("tontine_members").delete().eq("tontine_id", id);
  const { error } = await getSupabase().from("tontines").delete().eq("id", id);
  throwSb(error);
  return { detail: "Tontine supprimée" };
}

export async function adminListKyc() {
  await requireAdmin();
  const sb = getSupabase();
  const { data: submissions, error } = await sb
    .from("kyc_submissions")
    .select("id, user_id, status, submitted_at, verification_mode, provider, id_type, country_code, id_front_path, id_back_path, selfie_path")
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("adminListKyc:", error.message);
    return [];
  }

  const { data: pendingProfiles } = await sb
    .from("profiles")
    .select("id, full_name, phone, email, country, kyc_status, created_at")
    .in("kyc_status", [...PENDING_KYC]);

  const submissionUserIds = new Set((submissions ?? []).map((k: any) => k.user_id));
  const userIds = [...new Set([
    ...(submissions ?? []).map((k: any) => k.user_id),
    ...(pendingProfiles ?? []).filter((p: any) => !submissionUserIds.has(p.id)).map((p: any) => p.id),
  ])];

  const profileMap: Record<string, any> = {};
  if (userIds.length) {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, full_name, phone, email, country, kyc_status, created_at")
      .in("id", userIds);
    for (const p of profiles ?? []) profileMap[p.id] = p;
  }

  const fromSubmissions = (submissions ?? []).map((k: any) => {
    const p = profileMap[k.user_id] ?? {};
    return {
      id: k.id,
      user_id: k.user_id,
      full_name: p.full_name ?? "—",
      email: p.email ?? "—",
      phone: p.phone ?? "—",
      country: p.country ?? k.country_code ?? "—",
      kyc_status: normalizeKycStatus(k.status, p.kyc_status),
      submission_status: k.status,
      submitted_at: k.submitted_at,
      created_at: k.submitted_at ?? p.created_at,
      verification_mode: k.verification_mode,
      provider: k.provider,
      id_type: k.id_type,
      id_front_path: k.id_front_path,
      id_back_path: k.id_back_path,
      selfie_path: k.selfie_path,
    };
  });

  const orphanProfiles = (pendingProfiles ?? [])
    .filter((p: any) => !submissionUserIds.has(p.id))
    .map((p: any) => ({
      id: null,
      user_id: p.id,
      full_name: p.full_name ?? "—",
      email: p.email ?? "—",
      phone: p.phone ?? "—",
      country: p.country ?? "—",
      kyc_status: normalizeKycStatus(null, p.kyc_status),
      submission_status: null,
      submitted_at: null,
      created_at: p.created_at,
      verification_mode: "manual",
      provider: null,
      id_type: null,
      id_front_path: null,
      id_back_path: null,
      selfie_path: null,
    }));

  return [...fromSubmissions, ...orphanProfiles].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
  );
}

export async function adminGetKycDetail(userId: string) {
  await requireAdmin();
  const sb = getSupabase();
  const [{ data: profile, error: profErr }, { data: submission, error: subErr }] = await Promise.all([
    sb.from("profiles")
      .select("id, full_name, phone, email, gender, country, city, neighborhood, address, date_of_birth, birth_place, occupation, kyc_status, created_at")
      .eq("id", userId)
      .maybeSingle(),
    sb.from("kyc_submissions")
      .select("id, user_id, status, submitted_at, reviewed_at, verification_mode, provider, id_type, country_code, id_front_path, id_back_path, selfie_path, rejection_reason")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (profErr) throwSb(profErr);
  if (subErr) throwSb(subErr);
  if (!profile && !submission) throw { status: 404, detail: "Dossier KYC introuvable" };

  const [idFrontUrl, idBackUrl, selfieUrl] = await Promise.all([
    signedKycUrl(submission?.id_front_path),
    signedKycUrl(submission?.id_back_path),
    signedKycUrl(submission?.selfie_path),
  ]);

  const addressParts = [profile?.address, profile?.neighborhood, profile?.city, profile?.country].filter(Boolean);

  return {
    user_id: userId,
    full_name: profile?.full_name ?? "—",
    email: profile?.email ?? "—",
    phone: profile?.phone ?? "—",
    gender: profile?.gender ?? null,
    country: profile?.country ?? submission?.country_code ?? "—",
    city: profile?.city ?? "—",
    neighborhood: profile?.neighborhood ?? null,
    address: profile?.address ?? "—",
    address_full: addressParts.join(", ") || "—",
    date_of_birth: profile?.date_of_birth ?? null,
    birth_place: profile?.birth_place ?? null,
    occupation: profile?.occupation ?? null,
    kyc_status: normalizeKycStatus(submission?.status, profile?.kyc_status),
    submission_status: submission?.status ?? null,
    submitted_at: submission?.submitted_at ?? null,
    reviewed_at: submission?.reviewed_at ?? null,
    verification_mode: submission?.verification_mode ?? "manual",
    provider: submission?.provider ?? null,
    id_type: submission?.id_type ?? null,
    country_code: submission?.country_code ?? null,
    rejection_reason: submission?.rejection_reason ?? null,
    documents: {
      id_front: submission?.id_front_path
        ? { path: submission.id_front_path, url: idFrontUrl }
        : null,
      id_back: submission?.id_back_path
        ? { path: submission.id_back_path, url: idBackUrl }
        : null,
      selfie: submission?.selfie_path
        ? { path: submission.selfie_path, url: selfieUrl }
        : null,
    },
  };
}

export async function adminHandleKyc(userId: string, approve: boolean, rejectionReason?: string) {
  await requireAdmin();
  const submissionStatus = approve ? "approved" : "rejected";
  const profileStatus = approve ? "approved" : "rejected";
  const reviewedAt = new Date().toISOString();
  const sb = getSupabase();
  const reason = rejectionReason?.trim() || null;

  if (!approve && !reason) {
    throw { status: 400, detail: "Indiquez ce que l'utilisateur doit corriger avant de rejeter le dossier." };
  }

  const { data: existing } = await sb.from("kyc_submissions").select("id").eq("user_id", userId).maybeSingle();
  if (existing) {
    const { error } = await sb.from("kyc_submissions")
      .update({
        status: submissionStatus,
        reviewed_at: reviewedAt,
        rejection_reason: approve ? null : reason,
      })
      .eq("user_id", userId);
    throwSb(error);
  } else {
    const { error } = await sb.from("kyc_submissions").insert({
      user_id: userId,
      status: submissionStatus,
      reviewed_at: reviewedAt,
      verification_mode: "manual",
      provider: "manual",
      rejection_reason: approve ? null : reason,
    });
    throwSb(error);
  }

  const { error: profErr } = await sb.from("profiles").update({ kyc_status: profileStatus }).eq("id", userId);
  throwSb(profErr);

  if (approve) {
    await notifyUser({
      user_id: userId,
      title: "KYC approuvé ✅",
      body: "Félicitations ! Votre identité a été vérifiée. Vous pouvez maintenant effectuer des retraits et accéder aux limites complètes.",
      type: "kyc",
      metadata: { action_url: "/kyc" },
    });
  } else {
    await notifyUser({
      user_id: userId,
      title: "KYC refusé — action requise",
      body: `Votre dossier n'a pas pu être validé. À corriger : ${reason}. Soumettez un nouveau dossier depuis votre profil.`,
      type: "kyc_rejected",
      metadata: { action_url: "/kyc", rejection_reason: reason },
    });
  }

  invalidateCache("admin");
  return { detail: `KYC ${approve ? "approuvé" : "refusé"}` };
}

export async function adminDeleteKyc(userId: string) {
  await requireAdmin();
  const sb = getSupabase();
  const { error } = await sb.from("kyc_submissions").delete().eq("user_id", userId);
  throwSb(error);
  const { error: profErr } = await sb.from("profiles").update({ kyc_status: "not_submitted" }).eq("id", userId);
  throwSb(profErr);
  invalidateCache("admin");
  return { detail: "Dossier KYC supprimé" };
}

export async function createPromotionRequest(reason: string) {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 10) throw { status: 400, detail: "Veuillez fournir une motivation d'au moins 10 caractères." };

  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw { status: 401, detail: "Non authentifié." };

  const sb = getSupabase();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "member") {
    throw { status: 400, detail: "Seuls les membres peuvent demander une promotion Manager." };
  }

  const { data: existing } = await sb.from("promotion_requests")
    .select("id").eq("user_id", user.id).eq("status", "pending").maybeSingle();
  if (existing) throw { status: 400, detail: "Vous avez déjà une demande en attente." };

  const { data, error } = await sb.from("promotion_requests")
    .insert({ user_id: user.id, reason: trimmed, status: "pending" })
    .select("id, user_id, reason, status, created_at").single();
  if (error) throw { status: 400, detail: error.message };

  await notifyUser({
    user_id: user.id,
    title: "Demande envoyée",
    body: "Votre demande de promotion Tontine Manager est en cours d'examen par l'équipe HODIX.",
    type: "promotion_request",
  });

  invalidateCache("admin");
  return data;
}

export async function getMyPromotionRequest() {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw { status: 401, detail: "Non authentifié." };
  const { data } = await getSupabase().from("promotion_requests")
    .select("id, user_id, reason, status, created_at, decided_at, decision_note")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (data.status === "cancelled") return null;
  return data;
}

export async function adminListPromotionRequests() {
  await requireAdmin();
  const { data, error } = await getSupabase().from("promotion_requests")
    .select("id, user_id, reason, status, created_at, decided_at, decision_note")
    .order("created_at", { ascending: false })
    .limit(100);
  throwSb(error);

  const userIds = [...new Set((data ?? []).map((r: { user_id: string }) => r.user_id))];
  const profileMap: Record<string, { full_name: string; email: string; phone: string; kyc_status: string }> = {};
  if (userIds.length) {
    const { data: profiles } = await getSupabase()
      .from("profiles")
      .select("id, full_name, email, phone, kyc_status")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileMap[p.id] = {
        full_name: p.full_name ?? "—",
        email: p.email ?? "—",
        phone: p.phone ?? "—",
        kyc_status: p.kyc_status ?? "not_submitted",
      };
    }
  }

  return (data ?? []).map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    full_name: profileMap[r.user_id]?.full_name ?? "—",
    email: profileMap[r.user_id]?.email ?? "—",
    phone: profileMap[r.user_id]?.phone ?? "—",
    kyc_status: profileMap[r.user_id]?.kyc_status ?? "not_submitted",
    reason: r.reason,
    status: r.status,
    created_at: r.created_at,
    decided_at: r.decided_at,
    decision_note: r.decision_note,
  }));
}

export async function adminHandlePromotion(userId: string, approve: boolean, requestId?: string) {
  await requireAdmin();
  const me = await uid();
  const sb = getSupabase();

  let req: any = null;
  if (requestId) {
    const { data } = await sb.from("promotion_requests").select("*").eq("id", requestId).maybeSingle();
    req = data;
  } else {
    const { data } = await sb.from("promotion_requests")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    req = data;
  }
  if (!req || req.status !== "pending") {
    throw { status: 404, detail: "Aucune demande en attente pour ce membre." };
  }

  const targetUserId = req.user_id as string;
  const { data: profile } = await sb.from("profiles").select("kyc_status, role, full_name").eq("id", targetUserId).single();
  const now = new Date().toISOString();

  if (approve) {
    if (profile?.role === "member") {
      const { error: roleErr } = await sb.from("profiles").update({ role: "tontine_manager" }).eq("id", targetUserId);
      throwSb(roleErr);
    }
    await sb.from("promotion_requests").update({
      status: "approved",
      decided_by: me,
      decided_at: now,
      updated_at: now,
    }).eq("id", req.id);

    await notifyUser({
      user_id: targetUserId,
      title: "Promotion accordée 🎉",
      body: "Félicitations ! Vous êtes maintenant Tontine Manager. Vous pouvez créer des tontines et accéder au tableau de bord communautaire.",
      type: "promotion",
    });
  } else {
    const kycApproved = profile?.kyc_status === "approved";
    const rejectBody = kycApproved
      ? "Votre demande de promotion Manager a été examinée et refusée. Vous pourrez soumettre une nouvelle demande depuis votre profil lorsque vous le souhaiterez."
      : "Votre demande de promotion Manager a été examinée. Pour devenir Tontine Manager, complétez d'abord la vérification d'identité (KYC) dans Profil → KYC, puis soumettez une nouvelle demande.";

    await sb.from("promotion_requests").update({
      status: "rejected",
      decided_by: me,
      decided_at: now,
      decision_note: kycApproved ? "Refusée par l'admin" : "KYC requis avant nouvelle demande",
      updated_at: now,
    }).eq("id", req.id);

    await notifyUser({
      user_id: targetUserId,
      title: "Promotion refusée",
      body: rejectBody,
      type: "promotion_rejected",
    });
  }

  await sb.from("notifications")
    .update({ is_read: true })
    .eq("user_id", targetUserId)
    .eq("type", "promotion_request");

  invalidateCache("admin");
  return { detail: approve ? "Promotion accordée" : "Demande refusée" };
}

export async function adminDeletePromotionRequest(requestId: string) {
  await requireAdmin();
  const sb = getSupabase();
  const { data: req } = await sb.from("promotion_requests").select("id, user_id").eq("id", requestId).maybeSingle();
  if (!req) throw { status: 404, detail: "Demande introuvable." };

  const { error } = await sb.from("promotion_requests").delete().eq("id", requestId);
  throwSb(error);

  await sb.from("notifications")
    .delete()
    .eq("user_id", req.user_id)
    .eq("type", "promotion_request");

  invalidateCache("admin");
  return { detail: "Demande supprimée" };
}

let _lastBroadcastAt = 0;
const BROADCAST_COOLDOWN_MS = 60 * 60 * 1000; // 1 broadcast max par heure

export async function adminBroadcast(title: string, body: string) {
  await requireAdmin();
  const now = Date.now();
  if (now - _lastBroadcastAt < BROADCAST_COOLDOWN_MS) {
    const waitMin = Math.ceil((BROADCAST_COOLDOWN_MS - (now - _lastBroadcastAt)) / 60000);
    throw { status: 429, detail: `Attendez encore ${waitMin} min avant le prochain broadcast.` };
  }
  const { data: profiles } = await getSupabase().from("profiles").select("id");
  if (!profiles?.length) return { detail: "Aucun membre trouvé" };
  const rows = profiles.map((p: any) => ({ user_id: p.id, title, body, type: "broadcast", is_read: false }));
  for (let i = 0; i < rows.length; i += 100) {
    await getSupabase().from("notifications").insert(rows.slice(i, i + 100));
  }
  _lastBroadcastAt = Date.now();
  return { detail: `Message envoyé à ${profiles.length} membres` };
}

export async function getUsersSeries(days = 14) {
  await requireAdmin();
  return cached(`users-series`, 120_000, async () => {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await getSupabase().from("profiles").select("created_at").gte("created_at", since).order("created_at", { ascending: true });
    const byDate: Record<string, number> = {};
    for (const p of data ?? []) { const d = (p.created_at as string).slice(0, 10); byDate[d] = (byDate[d] ?? 0) + 1; }
    return { days, series: Object.entries(byDate).map(([date, value]) => ({ date, value })) };
  });
}
