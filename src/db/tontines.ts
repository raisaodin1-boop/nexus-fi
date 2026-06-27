import { getSupabase } from "@/src/supabase";
import { uid, throwSb, inviteCode, invalidateCache, isUniqueViolation } from "./helpers";
import { addIdentityEvent } from "./identity";
import { notifyUser } from "./notifications";
import { profileDisplayMap, profileFromMap } from "@/src/profile-display";

const FREQ_DAYS: Record<string, number> = {
  weekly: 7, biweekly: 14, monthly: 30, quarterly: 90,
};

/* ── Basic CRUD ─────────────────────────────────────────────── */

export async function listTontines() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("tontine_members")
    .select("tontines(*, tontine_members(count))")
    .eq("user_id", me);
  throwSb(error);
  return (data ?? []).map((row: any) => {
    const t = row.tontines;
    return { ...t, members_count: t?.tontine_members?.[0]?.count ?? 0 };
  });
}

export async function getTontine(id: string) {
  const me = await uid();
  const sb = getSupabase();

  const { data: tontine, error } = await sb.from("tontines").select("*").eq("id", id).single();
  throwSb(error);

  const { data: members, error: membersErr } = await sb
    .from("tontine_members")
    .select("*")
    .eq("tontine_id", id);
  throwSb(membersErr);

  const memberProfiles = await profileDisplayMap((members ?? []).map((m: { user_id: string }) => m.user_id));

  const { data: contributions, error: contribErr } = await sb
    .from("tontine_contributions")
    .select("*")
    .eq("tontine_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  throwSb(contribErr);

  const contribProfiles = await profileDisplayMap((contributions ?? []).map((c: { user_id: string }) => c.user_id));

  const membersList = (members ?? [])
    .map((m: any) => {
      const prof = profileFromMap(memberProfiles, m.user_id);
      return {
        ...m,
        full_name: prof.full_name,
        kyc_verified: prof.kyc_verified,
        cycles_paid: m.cycles_paid ?? 0,
        status: m.status ?? "a_jour",
      };
    })
    .sort((a: { rotation_position?: number | null }, b: { rotation_position?: number | null }) =>
      (a.rotation_position ?? 999) - (b.rotation_position ?? 999));

  const contributionsList = (contributions ?? []).map((c: any) => {
    const prof = profileFromMap(contribProfiles, c.user_id);
    return {
      id: c.id,
      user_id: c.user_id,
      full_name: prof.full_name,
      kyc_verified: prof.kyc_verified,
      amount: Number(c.amount ?? 0),
      created_at: c.created_at,
      cycle: c.cycle ?? null,
      payment_method: c.payment_method ?? null,
    };
  });

  const contributionAmount = Number(tontine.amount_per_cycle ?? tontine.contribution_amount ?? 0);
  const totalCollected = contributionsList.reduce((sum, c) => sum + c.amount, 0);
  const membersCount = membersList.length;
  const currentCycle = tontine.current_cycle ?? 1;
  const totalCycles = Math.max(membersCount, tontine.max_members ?? 1);
  const paidThisCycle = contributionsList.filter((c) => c.cycle === currentCycle).length;
  const compliancePct = membersCount > 0 ? Math.round((paidThisCycle / membersCount) * 100) : 0;

  const myMember = membersList.find((m) => m.user_id === me);
  const isAdmin = tontine.owner_id === me || myMember?.role === "admin";

  const rotationOrder = [...membersList].sort((a, b) => (a.rotation_position ?? 0) - (b.rotation_position ?? 0));
  const currentBeneficiary = rotationOrder.find((m) => !m.has_received) ?? null;
  const beneficiaryIdx = currentBeneficiary ? rotationOrder.indexOf(currentBeneficiary) : -1;
  const nextBeneficiary = beneficiaryIdx >= 0 && beneficiaryIdx < rotationOrder.length - 1
    ? rotationOrder[beneficiaryIdx + 1]
    : null;

  return {
    tontine: {
      ...tontine,
      contribution_amount: contributionAmount,
      members_count: membersCount,
      total_collected: totalCollected,
      total_cycles: totalCycles,
      current_cycle: currentCycle,
      status: tontine.status ?? (tontine.is_active ? "active" : "inactive"),
      rotation_mode: tontine.rotation_mode ?? "rotation",
      currency: tontine.currency ?? "XAF",
    },
    is_admin: isAdmin,
    members: membersList,
    contributions: contributionsList,
    compliance_pct: compliancePct,
    cycle: {
      current_cycle: currentCycle,
      total_cycles: totalCycles,
      current_beneficiary_id: currentBeneficiary?.user_id ?? null,
      current_beneficiary_name: currentBeneficiary?.full_name ?? null,
      next_beneficiary_name: nextBeneficiary?.full_name ?? null,
      current_beneficiary_kyc_verified: currentBeneficiary?.kyc_verified ?? false,
      next_beneficiary_kyc_verified: nextBeneficiary?.kyc_verified ?? false,
      rotation_mode: (tontine.rotation_mode ?? "rotation") as "rotation" | "random" | "custom",
      cycle_start_date: null,
      compliance_pct: compliancePct,
    },
  };
}

export async function createTontine(body: Record<string, any>) {
  // Vérifier la limite du plan abonnement
  const { checkTontineCreationAllowed } = await import("@/src/db/subscriptions");
  await checkTontineCreationAllowed();

  const me = await uid();
  const sb = getSupabase();
  let data: any;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error } = await sb
      .from("tontines")
      .insert({ ...body, owner_id: me, invite_code: inviteCode() })
      .select().single();
    if (!error) { data = row; break; }
    if (!isUniqueViolation(error) || attempt === 4) throwSb(error);
  }
  await sb.from("tontine_members").insert({
    tontine_id: data.id, user_id: me, role: "admin", rotation_position: 1,
  });
  return data;
}

export async function joinTontine(invite_code: string) {
  const me = await uid();
  const { data: tontine, error } = await getSupabase()
    .from("tontines").select("*").eq("invite_code", invite_code.trim().toUpperCase()).single();
  if (error || !tontine) throw { status: 404, detail: "Code d'invitation invalide" };

  const { count } = await getSupabase()
    .from("tontine_members").select("*", { count: "exact", head: true }).eq("tontine_id", tontine.id);

  if ((count ?? 0) >= tontine.max_members)
    throw { status: 400, detail: "La tontine est complète" };

  const { error: e2 } = await getSupabase().from("tontine_members").insert({
    tontine_id: tontine.id, user_id: me, role: "member", rotation_position: (count ?? 0) + 1,
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
    const reliability = Math.round((complianceRate !== null ? complianceRate * 0.6 : 50) + fullness * 40);
    return {
      id: t.id, name: t.name, amount_per_cycle: t.amount_per_cycle,
      frequency: t.frequency, max_members: t.max_members,
      language: t.language ?? null, country: t.country ?? null,
      description: t.description ?? null, members_count: memberCount,
      compliance_rate: complianceRate, reliability_score: reliability, created_at: t.created_at,
    };
  });
}

export async function requestJoinTontine(tontine_id: string) {
  const me = await uid();
  const sb = getSupabase();
  const { count } = await sb
    .from("tontine_members").select("*", { count: "exact", head: true })
    .eq("tontine_id", tontine_id).eq("user_id", me);
  if ((count ?? 0) > 0) throw { status: 400, detail: "Vous êtes déjà membre de cette tontine" };

  const { data: tontine, error: tErr } = await sb
    .from("tontines")
    .select("owner_id, name")
    .eq("id", tontine_id)
    .single();
  if (tErr || !tontine?.owner_id) throw { status: 404, detail: "Tontine introuvable" };

  const requesterProfiles = await profileDisplayMap([me]);
  const requesterName = profileFromMap(requesterProfiles, me).full_name;
  const tontineName = tontine.name ?? "votre tontine";

  const { error: ownerErr } = await sb.from("notifications").insert({
    user_id: tontine.owner_id,
    title: "Demande d'adhésion",
    body: `${requesterName} souhaite rejoindre « ${tontineName} ».`,
    type: "join_request",
    metadata: { tontine_id, requester_id: me, requester_name: requesterName },
  });
  throwSb(ownerErr);

  await sb.from("notifications").insert({
    user_id: me,
    title: "Demande envoyée",
    body: `Votre demande pour « ${tontineName} » a été transmise au manager.`,
    type: "join_request_sent",
    metadata: { tontine_id },
  });

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
    full_name: m.profiles?.full_name ?? "Membre", country: m.profiles?.country ?? null,
  }));
  const contribs = contribsRes.data ?? [];
  const memberCount = members.length;
  const expectedTotal = Number(t.amount_per_cycle) * memberCount;
  const actualTotal = contribs.reduce((s: number, c: any) => s + Number(c.amount), 0);
  const complianceRate = expectedTotal > 0 ? Math.min(100, Math.round((actualTotal / expectedTotal) * 100)) : null;
  const fullness = t.max_members > 0 ? memberCount / t.max_members : 0;
  const reliability = Math.round((complianceRate !== null ? complianceRate * 0.6 : 50) + fullness * 40);
  const now = new Date();
  const monthly: { label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("fr-FR", { month: "short" });
    const total = contribs
      .filter((c: any) => { const cd = new Date(c.created_at); return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth(); })
      .reduce((s: number, c: any) => s + Number(c.amount), 0);
    monthly.push({ label, total });
  }
  return {
    tontine: t, members, compliance_rate: complianceRate,
    reliability_score: reliability, monthly_history: monthly,
    contribution_count: contribs.length, total_collected: actualTotal,
  };
}

/** @deprecated Use CinetPay flow via contributeTontineSecure after payment confirmation. */
export async function contributeTontine(_id: string, _amount: number) {
  throw { status: 403, detail: "Paiement électronique requis. Utilisez la page de paiement CinetPay." };
}

/* ── Security-aware operations ──────────────────────────────── */

const TRUST_SCORE_PUBLIC_TONTINE = 300;
const TRUST_SCORE_HIGH_VALUE     = 600;
const HIGH_VALUE_THRESHOLD       = 100_000;
const KYC_REQUIRED_THRESHOLD     = 50_000;
const ESCROW_HOURS               = 72;
const RESERVE_FUND_PCT           = 0.02;

export async function createTontineSecure(body: Record<string, any>) {
  const { checkTontineCreationAllowed } = await import("@/src/db/subscriptions");
  await checkTontineCreationAllowed();

  const me = await uid();
  const sb = getSupabase();

  const { data: profile } = await sb.from("profiles").select("trust_flags, kyc_status, phone").eq("id", me).single();
  if ((profile?.trust_flags ?? []).includes("blacklisted"))
    throw { status: 403, detail: "Votre compte est suspendu pour fraude. Contactez le support." };

  const { data: profileData } = await sb.from("profiles").select("role").eq("id", me).single();
  const isAdmin = profileData?.role === "admin" || profileData?.role === "super_admin";
  const amountPerCycle = Number(body.amount_per_cycle ?? 0);

  if (!isAdmin) {
    if (body.is_public) {
      const tsRes = await sb.from("identity_scores").select("score").eq("user_id", me).maybeSingle();
      const score = tsRes?.data?.score ?? 0;
      const required = amountPerCycle >= HIGH_VALUE_THRESHOLD ? TRUST_SCORE_HIGH_VALUE : TRUST_SCORE_PUBLIC_TONTINE;
      if (score < required)
        throw { status: 403, detail: `Trust Score insuffisant pour une tontine publique (requis: ${required}, votre score: ${score}).` };
    }
    if (amountPerCycle >= KYC_REQUIRED_THRESHOLD) {
      if ((profile?.kyc_status ?? null) !== "approved")
        throw { status: 403, detail: `Vérification d'identité (KYC) obligatoire pour les tontines supérieures à ${KYC_REQUIRED_THRESHOLD.toLocaleString()} XAF/cycle.` };
    }
  }

  const insertRow: Record<string, any> = {
    name: body.name, description: body.description ?? null,
    amount_per_cycle: amountPerCycle,
    contribution_amount: amountPerCycle,
    frequency: body.frequency ?? "monthly",
    max_members: Number(body.max_members ?? 12), is_public: body.is_public ?? false,
    owner_id: me,
  };
  if (body.language) insertRow.language = body.language;
  if (body.country) insertRow.country = body.country;

  let data: any;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error } = await sb.from("tontines")
      .insert({ ...insertRow, invite_code: inviteCode() })
      .select().single();
    if (!error) { data = row; break; }
    if (!isUniqueViolation(error) || attempt === 4) throwSb(error);
  }

  const maxMembers = Number(body.max_members ?? 12);
  const memberRow: Record<string, any> = {
    tontine_id: data.id,
    user_id: me,
    role: "admin",
    rotation_position: 1,
  };
  const { error: memErr } = await sb.from("tontine_members").insert(memberRow);
  if (memErr) throwSb(memErr);

  invalidateCache("tontines");
  invalidateCache(`identity-${me}`);
  const { checkReferralMilestones } = await import("./misc");
  checkReferralMilestones(me).catch(() => {});
  return data;
}

export async function joinTontineSecure(invite_code: string) {
  const me = await uid();
  const sb = getSupabase();

  const { data: profile } = await sb.from("profiles").select("trust_flags, kyc_status, device_fingerprint").eq("id", me).single();
  if ((profile?.trust_flags ?? []).includes("blacklisted"))
    throw { status: 403, detail: "Votre compte est suspendu. Contactez le support." };

  const { data: tontine, error } = await sb.from("tontines").select("*").eq("invite_code", invite_code.trim().toUpperCase()).single();
  if (error || !tontine) throw { status: 404, detail: "Code d'invitation invalide" };

  if (Number(tontine.amount_per_cycle) >= KYC_REQUIRED_THRESHOLD) {
    if ((profile?.kyc_status ?? null) !== "approved")
      throw { status: 403, detail: `Cette tontine requiert une vérification d'identité (cotisation ≥ ${KYC_REQUIRED_THRESHOLD.toLocaleString()} XAF).` };
  }

  if (profile?.device_fingerprint) {
    const { data: flaggedDevice } = await sb.from("flagged_devices").select("id").eq("fingerprint", profile.device_fingerprint).maybeSingle();
    if (flaggedDevice) throw { status: 403, detail: "Appareil signalé pour activité frauduleuse." };
  }

  const { count } = await sb.from("tontine_members").select("*", { count: "exact", head: true }).eq("tontine_id", tontine.id);
  if ((count ?? 0) >= tontine.max_members) throw { status: 400, detail: "La tontine est complète" };

  const { count: alreadyIn } = await sb.from("tontine_members").select("*", { count: "exact", head: true }).eq("tontine_id", tontine.id).eq("user_id", me);
  if ((alreadyIn ?? 0) > 0) throw { status: 400, detail: "Vous êtes déjà membre de cette tontine" };

  const { error: e2 } = await sb.from("tontine_members").insert({
    tontine_id: tontine.id, user_id: me, role: "member", rotation_position: (count ?? 0) + 1,
  });
  throwSb(e2);

  await sb.from("notifications").insert({
    user_id: tontine.owner_id, title: "Nouveau membre 🎉",
    body: `Un nouveau membre a rejoint votre tontine "${tontine.name}".`,
    type: "new_member", metadata: { tontine_id: tontine.id },
  });

  invalidateCache("tontines");
  invalidateCache(`identity-${me}`);
  const { checkReferralMilestones } = await import("./misc");
  checkReferralMilestones(me).catch(() => {});
  return { tontine_id: tontine.id };
}

export async function contributeTontineSecure(id: string, amount: number, paymentId: string) {
  if (!paymentId) throw { status: 403, detail: "Paiement électronique requis." };

  const me = await uid();
  const sb = getSupabase();

  const { error: rpcErr } = await sb.rpc("contribute_tontine_paid", {
    p_tontine_id: id,
    p_amount: amount,
    p_payment_id: paymentId,
  });
  if (rpcErr) throwSb(rpcErr);

  invalidateCache("tontines");
  invalidateCache(`identity-${me}`);
  await addIdentityEvent(me, "tontine_contribution", 1);

  const reserveAmount = Math.round(amount * RESERVE_FUND_PCT);
  return { detail: "Contribution enregistrée", reserve_deducted: reserveAmount, net_amount: amount - reserveAmount };
}

function nextCycleDeadline(frequency?: string | null): string {
  const days = FREQ_DAYS[(frequency ?? "monthly").toLowerCase()] ?? 30;
  return new Date(Date.now() + days * 86400000).toISOString();
}

export async function advanceTontineCycle(tontineId: string) {
  const me = await uid();
  const sb = getSupabase();
  const { data: tontine } = await sb.from("tontines")
    .select("id, owner_id, name, current_cycle, max_members, frequency, auto_advance, invite_code")
    .eq("id", tontineId).single();
  if (!tontine) throw { status: 404, detail: "Tontine introuvable." };
  if (tontine.owner_id !== me) throw { status: 403, detail: "Réservé au gestionnaire de la tontine." };

  const cycle = tontine.current_cycle ?? 1;
  const { count: memberCount } = await sb.from("tontine_members")
    .select("*", { count: "exact", head: true }).eq("tontine_id", tontineId).neq("status", "exclu");
  const { count: paidCount } = await sb.from("tontine_contributions")
    .select("*", { count: "exact", head: true }).eq("tontine_id", tontineId).eq("cycle", cycle);

  if ((paidCount ?? 0) < (memberCount ?? 1)) {
    throw { status: 400, detail: "Tous les membres n'ont pas encore cotisé pour ce cycle." };
  }

  const nextCycle = cycle + 1;
  await sb.from("tontines").update({
    current_cycle: nextCycle,
    cycle_deadline: nextCycleDeadline(tontine.frequency),
  }).eq("id", tontineId);

  const { data: members } = await sb.from("tontine_members").select("user_id").eq("tontine_id", tontineId);
  for (const m of members ?? []) {
    await notifyUser({
      user_id: m.user_id,
      title: `Nouveau cycle — ${tontine.name}`,
      body: `Le cycle ${nextCycle} a commencé. Pensez à votre cotisation !`,
      type: "tontine_cycle",
    });
  }

  invalidateCache("tontines");
  return {
    current_cycle: nextCycle,
    detail: `Cycle ${nextCycle} démarré.`,
    graduation_invite: {
      tontine_id: tontineId,
      tontine_name: tontine.name,
      invite_code: tontine.invite_code,
      cycle_completed: cycle,
      deeplink: `https://www.hodix.app/join?code=${tontine.invite_code}`,
    },
  };
}

export async function releaseDueEscrows() {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data: due } = await sb.from("tontine_escrow")
    .select("*, tontines(name, owner_id)")
    .eq("status", "held")
    .lte("release_at", now)
    .lt("dispute_count", 2);
  let released = 0;
  for (const row of due ?? []) {
    const { data: updated } = await sb.from("tontine_escrow")
      .update({ status: "released", release_notified: true })
      .eq("id", row.id)
      .eq("status", "held")
      .eq("release_notified", false)
      .select("*, tontines(name, owner_id)")
      .maybeSingle();
    if (!updated) continue;

    const ownerId = (updated as any).tontines?.owner_id;
    if (ownerId) {
      await notifyUser({
        user_id: ownerId,
        title: "Escrow libéré",
        body: `Les fonds du cycle ${updated.cycle} de ${(updated as any).tontines?.name ?? "la tontine"} sont disponibles.`,
        type: "escrow_release",
      });
    }
    released++;
  }
  return { released };
}

/* ── Escrow ─────────────────────────────────────────────────── */

export async function getEscrowStatus(tontineId: string) {
  const { data } = await getSupabase().from("tontine_escrow")
    .select("*").eq("tontine_id", tontineId).eq("cycle", 1).maybeSingle();
  if (!data) return { status: "none" };
  const now = new Date();
  const releaseAt = new Date(data.release_at);
  const hoursLeft = Math.max(0, (releaseAt.getTime() - now.getTime()) / 3600000);
  return {
    status: data.status, release_at: data.release_at,
    hours_left: Math.round(hoursLeft), dispute_count: data.dispute_count ?? 0,
    is_frozen: data.status === "disputed", amount: data.amount,
  };
}

export async function reportEscrowDispute(tontineId: string, reason: string) {
  const me = await uid();
  const sb = getSupabase();
  const { data: escrow } = await sb.from("tontine_escrow").select("*").eq("tontine_id", tontineId).eq("cycle", 1).maybeSingle();
  if (!escrow) throw { status: 404, detail: "Aucun escrow actif pour cette tontine" };
  const newCount = (escrow.dispute_count ?? 0) + 1;
  const newStatus = newCount >= 2 ? "disputed" : "held";
  await sb.from("tontine_escrow").update({ dispute_count: newCount, status: newStatus }).eq("tontine_id", tontineId).eq("cycle", 1);
  const { data: tontine } = await sb.from("tontines").select("owner_id, name").eq("id", tontineId).single();
  await sb.from("notifications").insert({
    user_id: tontine?.owner_id ?? me,
    title: `⚠️ Litige signalé — ${reason}`,
    body: `Un membre a signalé un litige pour le cycle 1 de la tontine. Fonds gelés en attente de résolution.`,
    type: "escrow_dispute",
    metadata: { tontine_id: tontineId, reporter_id: me, reason, dispute_count: newCount },
  });
  return { status: newStatus, dispute_count: newCount, frozen: newStatus === "disputed" };
}

/* ── Exclusion votes ────────────────────────────────────────── */

export async function voteExclusion(tontineId: string, targetUserId: string, reason: string) {
  const me = await uid();
  const sb = getSupabase();
  const { count: isMember } = await sb.from("tontine_members")
    .select("*", { count: "exact", head: true }).eq("tontine_id", tontineId).eq("user_id", me);
  if (!isMember) throw { status: 403, detail: "Vous devez être membre pour voter" };
  await sb.from("exclusion_votes").upsert({
    tontine_id: tontineId, target_user_id: targetUserId, voter_id: me, reason, voted_at: new Date().toISOString(),
  });
  const [{ count: voteCount }, { count: memberCount }] = await Promise.all([
    sb.from("exclusion_votes").select("*", { count: "exact", head: true }).eq("tontine_id", tontineId).eq("target_user_id", targetUserId),
    sb.from("tontine_members").select("*", { count: "exact", head: true }).eq("tontine_id", tontineId),
  ]);
  const threshold = Math.ceil((memberCount ?? 1) * 0.6);
  const excluded = (voteCount ?? 0) >= threshold;
  if (excluded) {
    await sb.from("tontine_members")
      .update({ status: "exclu", excluded_at: new Date().toISOString(), exclusion_reason: reason })
      .eq("tontine_id", tontineId).eq("user_id", targetUserId);
    await addIdentityEvent(targetUserId, "exclusion_vote_lost", -50);
    const { data: t } = await sb.from("tontines").select("name").eq("id", tontineId).single();
    await sb.from("notifications").insert({
      user_id: targetUserId, title: "⛔ Exclusion de tontine",
      body: `Vous avez été exclu(e) de la tontine "${t?.name ?? ""}" par vote des membres.`,
      type: "exclusion", metadata: { tontine_id: tontineId, reason },
    });
  }
  return { votes: voteCount ?? 0, threshold, excluded, percent: Math.round(((voteCount ?? 0) / (memberCount ?? 1)) * 100) };
}

export async function getExclusionVotes(tontineId: string) {
  const sb = getSupabase();
  const { data } = await sb.from("exclusion_votes")
    .select("target_user_id, voter_id, reason, voted_at, profiles!target_user_id(full_name)").eq("tontine_id", tontineId);
  const grouped: Record<string, { name: string; count: number; reasons: string[] }> = {};
  for (const v of (data ?? []) as any[]) {
    const tid = v.target_user_id;
    if (!grouped[tid]) grouped[tid] = { name: v.profiles?.full_name ?? "Membre", count: 0, reasons: [] };
    grouped[tid].count++;
    if (v.reason && !grouped[tid].reasons.includes(v.reason)) grouped[tid].reasons.push(v.reason);
  }
  const { count: memberCount } = await sb.from("tontine_members").select("*", { count: "exact", head: true }).eq("tontine_id", tontineId);
  const threshold = Math.ceil((memberCount ?? 1) * 0.6);
  return Object.entries(grouped).map(([userId, g]) => ({
    user_id: userId, display_name: g.name, vote_count: g.count, threshold,
    percent: Math.round((g.count / (memberCount ?? 1)) * 100), reasons: g.reasons,
    will_be_excluded: g.count >= threshold,
  }));
}

/* ── Creator rating ─────────────────────────────────────────── */

export async function rateCreator(tontineId: string, rating: number, comment?: string) {
  const me = await uid();
  const sb = getSupabase();
  if (rating < 1 || rating > 5) throw { status: 400, detail: "Note entre 1 et 5" };
  const { data: tontine } = await sb.from("tontines").select("owner_id").eq("id", tontineId).single();
  if (!tontine) throw { status: 404, detail: "Tontine introuvable" };
  const { count } = await sb.from("tontine_members").select("*", { count: "exact", head: true }).eq("tontine_id", tontineId).eq("user_id", me);
  if (!count) throw { status: 403, detail: "Vous devez avoir été membre pour noter" };
  await sb.from("creator_ratings").upsert({
    tontine_id: tontineId, rater_id: me, creator_id: tontine.owner_id,
    rating, comment: comment ?? null, rated_at: new Date().toISOString(),
  });
  return { rated: true };
}

export async function getCreatorReputation(creatorId: string) {
  const { data } = await getSupabase().from("creator_ratings").select("rating, comment, rated_at").eq("creator_id", creatorId);
  const ratings = (data ?? []).map((r: any) => Number(r.rating));
  if (!ratings.length) return { avg: null, count: 0, distribution: {}, comments: [] };
  const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratings) distribution[r] = (distribution[r] ?? 0) + 1;
  return {
    avg: Math.round(avg * 10) / 10, count: ratings.length, distribution,
    comments: (data ?? []).filter((r: any) => r.comment).slice(0, 5).map((r: any) => ({ text: r.comment, date: r.rated_at })),
  };
}

/* ── Reserve fund ───────────────────────────────────────────── */

export async function getTontineReserveFund(tontineId: string) {
  const me = await uid();
  const { data: tontine } = await getSupabase().from("tontines")
    .select("reserve_fund, amount_per_cycle, max_members, owner_id, name").eq("id", tontineId).single();
  if (!tontine) throw { status: 404, detail: "Tontine introuvable" };
  const memberCount = Number(tontine.max_members ?? 1) || 1;
  const fullCycleFund = (Number(tontine.amount_per_cycle) || 0) * memberCount;
  const reserve = Number(tontine.reserve_fund ?? 0) || 0;
  const coveragePercent = fullCycleFund > 0 ? Math.min(100, Math.round((reserve / fullCycleFund) * 100)) : 0;
  return {
    reserve, full_cycle_cost: fullCycleFund,
    coverage_percent: coveragePercent, covers_full_cycle: fullCycleFund > 0 && reserve >= fullCycleFund,
    is_owner: tontine.owner_id === me,
  };
}

export async function getOverdueMembers(tontineId: string) {
  const sb = getSupabase();
  const { data: tontine } = await sb.from("tontines").select("current_cycle, cycle_deadline, owner_id").eq("id", tontineId).single();
  if (!tontine) return [];
  const cycle = tontine.current_cycle ?? 1;
  const deadline = tontine.cycle_deadline ? new Date(tontine.cycle_deadline) : null;
  const now = new Date();
  const isOverdue = deadline && now > deadline;
  const { data: members } = await sb.from("tontine_members")
    .select("user_id, last_paid_cycle, status")
    .eq("tontine_id", tontineId)
    .neq("status", "exclu");
  const profiles = await profileDisplayMap((members ?? []).map((m: { user_id: string }) => m.user_id));
  return (members ?? [])
    .filter((m: any) => (m.last_paid_cycle ?? 0) < cycle)
    .map((m: any) => {
      const prof = profileFromMap(profiles, m.user_id);
      return {
        user_id: m.user_id,
        full_name: prof.full_name,
        name: prof.full_name,
        kyc_verified: prof.kyc_verified,
        last_paid_cycle: m.last_paid_cycle ?? 0,
        cycles_late: cycle - (m.last_paid_cycle ?? 0),
        is_overdue: isOverdue,
        days_overdue: deadline && isOverdue ? Math.round((now.getTime() - deadline.getTime()) / 86400000) : 0,
      };
    });
}

/* ── Consent ────────────────────────────────────────────────── */

export async function recordTontineConsent(version: string, tontineId?: string) {
  const me = await uid();
  const { error } = await getSupabase().from("tontine_consent").insert({
    user_id: me, version, tontine_id: tontineId ?? null,
    signed_at: new Date().toISOString(),
  });
  throwSb(error);
  return { signed: true, signed_at: new Date().toISOString(), version };
}

export async function hasSignedConsent(version: string): Promise<boolean> {
  const me = await uid();
  const { count } = await getSupabase().from("tontine_consent")
    .select("*", { count: "exact", head: true }).eq("user_id", me).eq("version", version);
  return (count ?? 0) > 0;
}

/* ── Analytics series ───────────────────────────────────────── */

export async function getContributionsSeries(days = 14) {
  const me = await uid();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await getSupabase()
    .from("tontine_contributions").select("amount, created_at")
    .eq("user_id", me).gte("created_at", since).order("created_at", { ascending: true });
  const byDate: Record<string, number> = {};
  for (const tx of data ?? []) {
    const d = (tx.created_at as string).slice(0, 10);
    byDate[d] = (byDate[d] ?? 0) + Number(tx.amount);
  }
  return { days, series: Object.entries(byDate).map(([date, value]) => ({ date, value })) };
}

export async function getPlatformSavingsSeries(days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await getSupabase()
    .from("savings_transactions").select("amount, created_at")
    .gte("created_at", since).order("created_at", { ascending: true });
  const byDate: Record<string, number> = {};
  for (const tx of data ?? []) {
    const d = (tx.created_at as string).slice(0, 10);
    byDate[d] = (byDate[d] ?? 0) + Number(tx.amount);
  }
  return { days, series: Object.entries(byDate).map(([date, value]) => ({ date, value })) };
}

/* ── Leaderboard ────────────────────────────────────────────── */

export async function getTontineLeaderboard(tontineId: string) {
  const { data, error } = await getSupabase()
    .from("tontine_contributions").select("user_id, amount, profiles(full_name, country)").eq("tontine_id", tontineId);
  throwSb(error);
  const totals: Record<string, { name: string; country: string | null; total: number }> = {};
  for (const c of (data ?? []) as any[]) {
    const uid2 = c.user_id;
    if (!totals[uid2]) totals[uid2] = { name: c.profiles?.full_name ?? "Membre", country: c.profiles?.country ?? null, total: 0 };
    totals[uid2].total += Number(c.amount);
  }
  return Object.entries(totals)
    .sort((a, b) => b[1].total - a[1].total).slice(0, 10)
    .map(([, v], i) => {
      const parts = v.name.trim().split(" ");
      const masked = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : v.name;
      return { rank: i + 1, display_name: masked, country: v.country, total: v.total };
    });
}
