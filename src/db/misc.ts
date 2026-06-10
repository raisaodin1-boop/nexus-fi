import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";

/* ── KYC ──────────────────────────────────────────────────── */

export async function getKycStatus() {
  const me = await uid();
  const { data } = await getSupabase().from("kyc_submissions").select("*").eq("user_id", me).maybeSingle();
  if (!data) return { status: "not_submitted" };
  const status = data.status === "pending" ? "pending_review" : data.status;
  return { ...data, status };
}

export async function submitKyc() {
  const me = await uid();
  const { error } = await getSupabase().from("kyc_submissions")
    .upsert({ user_id: me, status: "pending", submitted_at: new Date().toISOString() }, { onConflict: "user_id" });
  throwSb(error);
  await getSupabase().from("profiles").update({ kyc_status: "pending_review" }).eq("id", me);
  return { detail: "Demande KYC soumise" };
}

/* ── PAYMENTS ────────────────────────────────────────────── */

export async function listPayments() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("payments").select("*").eq("user_id", me).order("created_at", { ascending: false }).limit(50);
  throwSb(error);
  return data ?? [];
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
  const { data: referrals } = await getSupabase().from("profiles").select("full_name, created_at").eq("referred_by", referralCode);
  return {
    invite_code: referralCode, referral_count: referrals?.length ?? 0,
    bonus_fcfa: profile?.referral_bonus ?? 0, bonus_points: referrals?.length ?? 0,
    referrals: (referrals ?? []).map((r: any) => ({ full_name: r.full_name, joined_at: r.created_at })),
  };
}

export async function applyReferralBonus(newUserId: string, referralCode: string) {
  const { data: referrer } = await getSupabase().from("profiles").select("id, referral_bonus").eq("referral_code", referralCode).single();
  if (!referrer) return;
  await getSupabase().from("profiles").update({ referred_by: referralCode }).eq("id", newUserId);
  const current = Number(referrer.referral_bonus ?? 0);
  await getSupabase().from("profiles").update({ referral_bonus: current + 500 }).eq("id", referrer.id);
  await getSupabase().from("notifications").insert({
    user_id: referrer.id, title: "Bonus de parrainage 🎁",
    body: "Un nouveau membre a rejoint HODIX avec votre code ! +500 FCFA bonus ajoutés à votre compte.", type: "referral",
  });
}

export async function sendWelcomeMessage(userId: string, fullName: string) {
  const sb = getSupabase();
  const { data: profile } = await sb.from("profiles")
    .select("referral_code, welcome_email_sent_at")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.welcome_email_sent_at) return;

  let code = profile?.referral_code;
  if (!code) {
    code = genReferralCode();
    await sb.from("profiles").update({ referral_code: code }).eq("id", userId);
  }

  await sb.from("notifications").insert({
    user_id: userId, title: `Bienvenue sur HODIX, ${fullName} ! 🎉`,
    body: `Votre compte est créé. Votre code de parrainage personnel est : ${code}\n\nPartagez-le à vos proches et gagnez 500 FCFA de bonus par inscription !`,
    type: "welcome", is_read: false,
  });

  try {
    await sb.functions.invoke("send-welcome", {
      body: { full_name: fullName, referral_code: code },
    });
  } catch { /* best-effort — notification in-app déjà envoyée */ }
}

/* ── STREAKS ─────────────────────────────────────────────── */

export interface StreakData {
  current_streak: number;
  best_streak: number;
  total_contributions: number;
  last_contribution_at: string | null;
  milestones: number[];
  is_at_risk: boolean;
}

export async function getStreakData(): Promise<StreakData> {
  const me = await uid();
  const sb = getSupabase();
  const { data: contribs } = await sb.from("tontine_contributions").select("created_at, amount").eq("user_id", me).order("created_at", { ascending: true });
  const rows = contribs ?? [];

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

  if ([12, 26, 52].includes(current)) {
    const eventKey = `streak_${current}`;
    const { count } = await sb.from("identity_events").select("*", { count: "exact", head: true }).eq("user_id", me).eq("event_type", eventKey);
    if ((count ?? 0) === 0) {
      await sb.from("identity_events").insert({ user_id: me, event_type: eventKey, points_delta: 10 });
      await sb.from("notifications").insert({
        user_id: me, title: `🔥 ${current} semaines consécutives !`,
        body: `Incroyable ! Vous avez cotisé ${current} semaines d'affilée. +10 pts Trust Score gagné !`,
        type: "streak_milestone",
      });
    }
  }

  return { current_streak: current, best_streak: best, total_contributions: rows.length, last_contribution_at: last, milestones, is_at_risk: isAtRisk };
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
  const thisMonthDeposits = tx.filter((t: any) => t.type === "deposit" && t.created_at >= oneMonthAgo).reduce((s: number, t: any) => s + Number(t.amount), 0);
  const prevMonthDeposits = tx.filter((t: any) => t.type === "deposit" && t.created_at < oneMonthAgo).reduce((s: number, t: any) => s + Number(t.amount), 0);

  if (prevMonthDeposits > 0 && thisMonthDeposits < prevMonthDeposits * 0.6) {
    const dropPct = Math.round((1 - thisMonthDeposits / prevMonthDeposits) * 100);
    alerts.push({ id: "savings_drop", type: "savings_drop", severity: "warning", title: `📉 Épargne en baisse de ${dropPct}%`, body: `Vous avez déposé ${dropPct}% de moins ce mois par rapport au mois dernier.`, action_label: "Déposer maintenant", action_route: "/(tabs)/savings" });
  }

  for (const g of goals as any[]) {
    if (!g.deadline || !g.target_amount) continue;
    const deadline = new Date(g.deadline);
    const monthsLeft = (deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth());
    const remaining = Number(g.target_amount) - Number(g.current_amount);
    if (monthsLeft > 0 && remaining > 0) {
      const neededPerMonth = remaining / monthsLeft;
      if (thisMonthDeposits > 0 && thisMonthDeposits < neededPerMonth * 0.7) {
        alerts.push({ id: `goal_behind_${g.id}`, type: "goal_behind", severity: "warning", title: `🎯 "${g.name}" en retard`, body: `Il vous faut ${Math.round(neededPerMonth).toLocaleString()} XAF/mois pour atteindre votre objectif à temps.`, action_label: "Voir l'objectif", action_route: `/savings/${g.id}` });
      }
    }
  }

  const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const contribs = contribRes.data ?? [];
  const contribThisWeek = contribs.some((c: any) => new Date(c.created_at) >= thisWeekStart);
  if (!contribThisWeek && contribs.length > 0 && now.getDay() >= 4) {
    alerts.push({ id: "streak_risk", type: "streak_risk", severity: "critical", title: "🔥 Votre streak est en danger !", body: "Vous n'avez pas encore cotisé cette semaine. Cotisez avant dimanche pour maintenir votre série !", action_label: "Cotiser maintenant", action_route: "/(tabs)/community" });
  }

  return alerts;
}

/* ── FAMILY ACCOUNTS ─────────────────────────────────────── */

export async function linkFamilyMember(childEmail: string, relationship: "enfant" | "conjoint" | "parent") {
  const me = await uid();
  const sb = getSupabase();
  const { data: child } = await sb.from("profiles").select("id, full_name").eq("email", childEmail).single();
  if (!child) throw { status: 404, detail: "Aucun compte trouvé avec cet email" };
  const { error } = await sb.from("notifications").insert({
    user_id: child.id, title: "Invitation famille HODIX",
    body: `Un membre vous invite à rejoindre son compte famille (${relationship}).`,
    type: "family_link_request", metadata: { requester_id: me, relationship },
  });
  throwSb(error);
  return { status: "pending", child_name: child.full_name };
}

export async function getFamilyOverview() {
  const me = await uid();
  const sb = getSupabase();
  const { data: links } = await sb.from("notifications").select("user_id, metadata, created_at")
    .eq("type", "family_link_accepted").or(`user_id.eq.${me},metadata->>requester_id.eq.${me}`);
  if (!links?.length) return { members: [], combined_savings: 0, goals: [] };
  const memberIds = new Set<string>([me]);
  for (const l of links as any[]) { memberIds.add(l.user_id); if (l.metadata?.requester_id) memberIds.add(l.metadata.requester_id); }
  const ids = Array.from(memberIds);
  const [profilesRes, goalsRes] = await Promise.all([
    sb.from("profiles").select("id, full_name, country").in("id", ids),
    sb.from("savings_goals").select("user_id, name, current_amount, target_amount, savings_type").in("user_id", ids),
  ]);
  const profiles = profilesRes.data ?? [];
  const goals = goalsRes.data ?? [];
  return {
    members: profiles.map((p: any) => ({ id: p.id, name: p.full_name, is_me: p.id === me })),
    combined_savings: goals.reduce((s: number, g: any) => s + Number(g.current_amount), 0),
    goals: goals.map((g: any) => ({ ...g, owner_name: profiles.find((p: any) => p.id === g.user_id)?.full_name ?? "Membre" })),
  };
}

/* ── SECURITY (fraud flags) ──────────────────────────────── */

export async function registerDeviceFingerprint(fingerprint: string) {
  const me = await uid();
  await getSupabase().from("profiles").update({ device_fingerprint: fingerprint }).eq("id", me);
  return { registered: true };
}

export async function flagUserAsFraud(targetUserId: string, reason: string) {
  const me = await uid();
  const sb = getSupabase();
  const { data: caller } = await sb.from("profiles").select("role").eq("id", me).single();
  if (!["super_admin", "tontine_manager"].includes(caller?.role ?? "")) throw { status: 403, detail: "Accès refusé" };
  const { data: target } = await sb.from("profiles").select("trust_flags, full_name").eq("id", targetUserId).single();
  const currentFlags: string[] = target?.trust_flags ?? [];
  if (!currentFlags.includes("blacklisted")) currentFlags.push("blacklisted");
  if (!currentFlags.includes("fraud_confirmed")) currentFlags.push("fraud_confirmed");
  await sb.from("profiles").update({ trust_flags: currentFlags, is_active: false }).eq("id", targetUserId);
  const { data: targetProfile } = await sb.from("profiles").select("device_fingerprint, phone").eq("id", targetUserId).single();
  if (targetProfile?.device_fingerprint) {
    await sb.from("flagged_devices").upsert({ fingerprint: targetProfile.device_fingerprint, user_id: targetUserId, reason, flagged_at: new Date().toISOString() });
  }
  await sb.from("identity_events").insert({ user_id: targetUserId, event_type: "fraud_flag", points_delta: -9999, metadata: { reason, flagged_by: me } } as any);
  await sb.from("notifications").insert({ user_id: targetUserId, title: "⛔ Compte suspendu", body: `Votre compte a été suspendu pour activité frauduleuse : ${reason}.`, type: "account_suspended" });
  return { flagged: true, name: target?.full_name };
}

export async function getUserTrustFlags(userId: string) {
  const { data } = await getSupabase().from("profiles").select("trust_flags, full_name, phone").eq("id", userId).single();
  return { flags: data?.trust_flags ?? [], is_blacklisted: (data?.trust_flags ?? []).includes("blacklisted"), has_fraud_confirmed: (data?.trust_flags ?? []).includes("fraud_confirmed"), name: data?.full_name };
}
