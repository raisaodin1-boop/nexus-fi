import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";
import { getMe } from "./profiles";
import { getReportHtml } from "./reports";
import { notifyUser } from "./notifications";
import { generateCertificateHtml } from "@/src/certificate-html";

const PAYMENT_CONFIG_DEFAULTS = {
  stripe_fee_rate: 0.029,
  stripe_fixed_fee_usd: 0.3,
  stripe_reserve_rate: 0.005,
  hodix_commission_pct: 1.5,
  mm_fee_rate: 0,
  xaf_to_usd_rate: 0.0018,
  xaf_to_eur_rate: 0.0015,
};

/* ── Manager overview ─────────────────────────────────────── */

export async function getManagerOverview() {
  const me = await uid();
  const sb = getSupabase();

  const safeNum = async (fn: () => PromiseLike<number>): Promise<number> => {
    try { return await fn(); } catch { return 0; }
  };
  const safeArr = async (fn: () => PromiseLike<any[]>): Promise<any[]> => {
    try { return await fn(); } catch { return []; }
  };

  // Toutes les requêtes en parallèle — une seule vague réseau
  const [tontineRes, assocRes, coopRes, fundRes] = await Promise.all([
    safeArr(async () => { const r = await sb.from("tontines").select("*").eq("owner_id", me); return r.data ?? []; }),
    safeArr(async () => { const r = await sb.from("associations").select("*").eq("owner_id", me); return r.data ?? []; }),
    safeArr(async () => { const r = await sb.from("cooperatives").select("*").eq("owner_id", me); return r.data ?? []; }),
    safeArr(async () => { const r = await sb.from("community_funds").select("*").eq("owner_id", me); return r.data ?? []; }),
  ]);

  const tList: any[] = tontineRes;
  const aList: any[] = assocRes;
  const cList: any[] = coopRes;
  const fList: any[] = fundRes;

  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // Tous les comptages en parallèle
  const [tMemberCounts, aMemberCounts, cMemberCounts, contribResults, newMemberCounts] = await Promise.all([
    Promise.all(tList.map(t => safeNum(async () => { const r = await sb.from("tontine_members").select("*", { count: "exact", head: true }).eq("tontine_id", t.id); return r.count ?? 0; }))),
    Promise.all(aList.map(a => safeNum(async () => { const r = await sb.from("association_members").select("*", { count: "exact", head: true }).eq("association_id", a.id); return r.count ?? 0; }))),
    Promise.all(cList.map(c => safeNum(async () => { const r = await sb.from("cooperative_members").select("*", { count: "exact", head: true }).eq("cooperative_id", c.id); return r.count ?? 0; }))),
    Promise.all(tList.map(t => safeArr(async () => { const r = await sb.from("tontine_contributions").select("amount").eq("tontine_id", t.id); return r.data ?? []; }))),
    Promise.all(tList.map(t => safeNum(async () => { const r = await sb.from("tontine_members").select("*", { count: "exact", head: true }).eq("tontine_id", t.id).gte("joined_at", thirtyAgo); return r.count ?? 0; }))),
  ]);

  const totalMembers =
    (tMemberCounts as number[]).reduce((s, n) => s + n, 0) +
    (aMemberCounts as number[]).reduce((s, n) => s + n, 0) +
    (cMemberCounts as number[]).reduce((s, n) => s + n, 0);

  let totalCollected = 0;
  const complianceValues: number[] = [];
  tList.forEach((t, i) => {
    const contribs = (contribResults[i] as any[]);
    const collected = contribs.reduce((s: number, r: any) => s + Number(r.amount), 0);
    totalCollected += collected;
    const members = (tMemberCounts as number[])[i] ?? 0;
    const perCycle = Number(t.amount_per_cycle ?? t.contribution_amount ?? 0);
    const expected = perCycle * members;
    if (expected > 0) complianceValues.push(Math.min(100, (collected / expected) * 100));
  });

  const newMembers30d = (newMemberCounts as number[]).reduce((s, n) => s + n, 0);
  const avgCompliance = complianceValues.length
    ? Math.round((complianceValues.reduce((a, b) => a + b, 0) / complianceValues.length) * 10) / 10
    : 0;
  const growthScore = Math.min(100, (newMembers30d / Math.max(totalMembers, 1)) * 300);
  const healthScore = Math.round(avgCompliance * 0.6 + growthScore * 0.4 * 10) / 10;

  return {
    groups: {
      tontines: tList.length,
      associations: aList.length,
      cooperatives: cList.length,
      funds: fList.length,
    },
    total_members: totalMembers,
    total_collected: totalCollected,
    avg_compliance: avgCompliance,
    health_score: healthScore,
    new_members_30d: newMembers30d,
    tontines: tList.slice(0, 5),
    currency: "XAF",
  };
}

/* ── Tontine disbursements & rotation ─────────────────────── */

async function assertTontineAdmin(tontineId: string) {
  const me = await uid();
  const sb = getSupabase();
  const { data: t } = await sb.from("tontines").select("owner_id").eq("id", tontineId).single();
  if (!t) throw { status: 404, detail: "Tontine introuvable." };
  if (t.owner_id !== me) {
    const { data: m } = await sb.from("tontine_members").select("role").eq("tontine_id", tontineId).eq("user_id", me).maybeSingle();
    if (m?.role !== "admin") throw { status: 403, detail: "Seul l'admin peut effectuer cette action." };
  }
  return me;
}

export async function listTontineDisbursements(tontineId: string) {
  const me = await uid();
  const sb = getSupabase();
  const { data: member } = await sb.from("tontine_members").select("id").eq("tontine_id", tontineId).eq("user_id", me).maybeSingle();
  const { data: t } = await sb.from("tontines").select("owner_id").eq("id", tontineId).single();
  if (!t) throw { status: 404, detail: "Tontine introuvable." };
  if (!member && t.owner_id !== me) throw { status: 403, detail: "Non autorisé." };

  const { data, error } = await sb
    .from("tontine_disbursements")
    .select("*")
    .eq("tontine_id", tontineId)
    .order("disbursed_at", { ascending: false })
    .limit(200);
  throwSb(error);
  return data ?? [];
}

export async function recordTontineDisbursement(
  tontineId: string,
  body: { beneficiary_id?: string; amount?: number; cycle?: number; note?: string | null },
) {
  const me = await assertTontineAdmin(tontineId);
  const sb = getSupabase();
  const beneficiaryId = body.beneficiary_id ?? "";
  const amount = Number(body.amount ?? 0);
  if (!beneficiaryId || amount <= 0) throw { status: 400, detail: "beneficiary_id et amount sont requis." };

  const { data: t } = await sb.from("tontines").select("name, current_cycle").eq("id", tontineId).single();
  const { data: ben } = await sb
    .from("tontine_members")
    .select("user_id, profiles(full_name)")
    .eq("tontine_id", tontineId)
    .eq("user_id", beneficiaryId)
    .maybeSingle();
  if (!ben) throw { status: 404, detail: "Bénéficiaire introuvable dans cette tontine." };

  const benName = (ben as any).profiles?.full_name ?? "Membre";
  const cycle = Number(body.cycle ?? t?.current_cycle ?? 1);

  const { data, error } = await sb
    .from("tontine_disbursements")
    .insert({
      tontine_id: tontineId,
      beneficiary_id: beneficiaryId,
      beneficiary_name: benName,
      amount,
      cycle,
      note: body.note ?? null,
      recorded_by: me,
    })
    .select()
    .single();
  throwSb(error);

  await sb.from("tontine_members").update({ has_received: true }).eq("tontine_id", tontineId).eq("user_id", beneficiaryId);

  await notifyUser({
    user_id: beneficiaryId,
    title: `Remise reçue — ${t?.name ?? "Tontine"}`,
    body: `Vous avez reçu ${Math.round(amount).toLocaleString("fr-FR")} XAF pour le cycle ${cycle}.`,
    type: "tontine_cycle",
  });

  return data;
}

export async function updateTontineRotation(
  tontineId: string,
  body: { order?: { member_id?: string; position?: number }[] },
) {
  await assertTontineAdmin(tontineId);
  const order = body.order ?? [];
  if (!order.length) throw { status: 400, detail: "order est requis." };

  const sb = getSupabase();
  for (const entry of order) {
    const memberRowId = entry.member_id;
    const pos = entry.position;
    if (!memberRowId || pos == null) continue;
    await sb
      .from("tontine_members")
      .update({ rotation_position: Number(pos) })
      .eq("id", memberRowId)
      .eq("tontine_id", tontineId);
  }
  return { detail: "rotation mise à jour" };
}

export async function sendTontineReminders(tontineId: string) {
  await assertTontineAdmin(tontineId);
  const sb = getSupabase();
  const { data: t } = await sb.from("tontines").select("name, current_cycle, amount_per_cycle, contribution_amount").eq("id", tontineId).single();
  if (!t) throw { status: 404, detail: "Tontine introuvable." };

  const amount = Number(t.amount_per_cycle ?? t.contribution_amount ?? 0);
  const { data: members } = await sb
    .from("tontine_members")
    .select("user_id, profiles(full_name, phone)")
    .eq("tontine_id", tontineId);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const m of members ?? []) {
    const phone = (m as any).profiles?.phone;
    const name = ((m as any).profiles?.full_name ?? "Membre").split(" ")[0];
    if (!phone || String(phone).trim().length < 8) {
      skipped++;
      continue;
    }
    try {
      await notifyUser({
        user_id: m.user_id,
        title: `Rappel cotisation — ${t.name}`,
        body: `Bonjour ${name}, votre contribution de ${amount.toLocaleString("fr-FR")} XAF (cycle ${t.current_cycle ?? 1}) est attendue.`,
        type: "tontine_reminder",
      });
      sent++;
    } catch {
      failed++;
    }
  }

  return { sent, skipped, failed };
}

/* ── QR receive data ──────────────────────────────────────── */

export async function getPaymentQrData() {
  const me = await uid();
  const profile = await getMe();
  return {
    user_id: me,
    full_name: profile.full_name ?? "",
    hodix_tag: `HODIX-${me.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    type: "payment_request",
  };
}

/* ── Withdrawal request (savings / mobile money) ─────────── */

export async function requestWithdrawal(body: {
  amount_xaf?: number;
  method?: string;
  phone?: string;
  reason?: string;
  goal_id?: string;
}) {
  const me = await uid();
  const amount = Number(body.amount_xaf ?? 0);
  if (amount < 500) throw { status: 400, detail: "Montant minimum de retrait : 500 XAF." };
  const method = (body.method ?? "").toLowerCase();
  if (!["orange", "mtn", "bank"].includes(method)) {
    throw { status: 400, detail: "Méthode invalide (orange | mtn | bank)." };
  }
  if (method !== "bank" && !(body.phone ?? "").trim()) {
    throw { status: 400, detail: "Numéro de téléphone requis pour Mobile Money." };
  }

  const commissionPct = PAYMENT_CONFIG_DEFAULTS.hodix_commission_pct;
  const commission = Math.round(amount * (commissionPct / 100));
  const net = amount - commission;

  const { data, error } = await getSupabase()
    .from("withdrawal_requests")
    .insert({
      user_id: me,
      amount_xaf: amount,
      commission_xaf: commission,
      net_xaf: net,
      method,
      phone: body.phone?.trim() ?? null,
      reason: body.reason?.trim() ?? null,
      goal_id: body.goal_id ?? null,
      status: "pending",
    })
    .select("id")
    .single();
  throwSb(error);

  await notifyUser({
    user_id: me,
    title: "Retrait en cours de traitement",
    body: `Demande de ${amount.toLocaleString("fr-FR")} XAF enregistrée. Net estimé : ${net.toLocaleString("fr-FR")} XAF.`,
    type: "withdrawal",
  });

  return {
    withdrawal_id: data!.id,
    amount_xaf: amount,
    commission_xaf: commission,
    net_xaf: net,
    message: `Vous recevrez ${net.toLocaleString("fr-FR")} XAF après déduction de la commission de ${commissionPct}%.`,
  };
}

export async function getWithdrawalReceipt(withdrawalId: string) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("withdrawal_requests")
    .select("id, amount_xaf, commission_xaf, net_xaf, method, phone, status, created_at, reason")
    .eq("id", withdrawalId)
    .eq("user_id", me)
    .maybeSingle();
  throwSb(error);
  if (!data) throw { status: 404, detail: "Demande de retrait introuvable." };

  const methodLabel = data.method === "bank" ? "Virement bancaire"
    : data.method === "orange" ? "Orange Money"
    : data.method === "mtn" ? "MTN Money"
    : String(data.method ?? "—");

  return {
    id: data.id,
    receipt_id: data.id,
    amount_xaf: Number(data.amount_xaf),
    commission_xaf: Number(data.commission_xaf ?? 0),
    method: methodLabel,
    payment_method: methodLabel,
    type: "withdrawal",
    kind: "withdrawal",
    status: data.status ?? "pending",
    label: "Demande de retrait",
    reference: data.id.slice(0, 8).toUpperCase(),
    created_at: data.created_at,
  };
}

/* ── Payment config (admin) ───────────────────────────────── */

export async function getPaymentConfig() {
  const { data, error } = await getSupabase().from("payment_config").select("*").eq("id", "global").maybeSingle();
  if (error || !data) return { ...PAYMENT_CONFIG_DEFAULTS };
  const { id, updated_at, ...cfg } = data as Record<string, unknown>;
  return { ...PAYMENT_CONFIG_DEFAULTS, ...cfg };
}

export async function updatePaymentConfig(body: Record<string, unknown>) {
  const me = await uid();
  const { data: profile } = await getSupabase().from("profiles").select("role").eq("id", me).single();
  if (!["super_admin", "admin"].includes(profile?.role ?? "")) {
    throw { status: 403, detail: "Accès réservé aux administrateurs." };
  }

  const allowed = Object.keys(PAYMENT_CONFIG_DEFAULTS);
  const updates: Record<string, number> = {};
  for (const k of allowed) {
    if (body[k] != null) updates[k] = Number(body[k]);
  }
  if (!Object.keys(updates).length) throw { status: 400, detail: "Aucune valeur à mettre à jour." };

  const { data, error } = await getSupabase()
    .from("payment_config")
    .upsert({ id: "global", ...updates, updated_at: new Date().toISOString() })
    .select()
    .single();
  throwSb(error);
  const { id, updated_at, ...cfg } = data as Record<string, unknown>;
  return { ...PAYMENT_CONFIG_DEFAULTS, ...cfg };
}

/* ── Certified reports ────────────────────────────────────── */

export async function getCertifiedReport(kind: "identity" | "trust-score" | "savings") {
  const me = await uid();
  const sb = getSupabase();

  const { data: purchase } = await sb
    .from("certificate_purchases")
    .select("id, paid_at")
    .eq("user_id", me)
    .eq("kind", kind)
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!purchase) {
    throw {
      status: 402,
      detail: "Paiement requis. 10 000 FCFA pour ce certificat authentifié.",
    };
  }

  const base = await getReportHtml(kind);
  const verifyCode = `HODIX-${me.replace(/-/g, "").slice(0, 8).toUpperCase()}-${String(purchase.id).slice(0, 6).toUpperCase()}`;
  const html = generateCertificateHtml({
    title: base.filename.replace(".pdf", "").replace(/hodix-/i, "Certificat Hodix "),
    subtitle: "Certificat authentifié — vérifiable",
    holderName: (await getMe()).full_name ?? "Membre HODIX",
    lines: [
      "Document officiel avec code de vérification unique.",
      `Code : ${verifyCode}`,
      `Émis le : ${new Date().toLocaleDateString("fr-FR")}`,
    ],
    footer: "Vérifiez ce document sur https://www.hodix.app/verify",
    verificationCode: verifyCode,
  });

  return { filename: base.filename.replace(".pdf", "-certifie.pdf"), html };
}

export async function markCertificatePaid(kind: string, paymentId: string) {
  const me = await uid();
  const sb = getSupabase();
  const { data: existing } = await sb
    .from("certificate_purchases")
    .select("id")
    .eq("user_id", me)
    .eq("kind", kind)
    .eq("status", "paid")
    .maybeSingle();
  if (existing) return;

  await sb.from("certificate_purchases").insert({
    user_id: me,
    kind,
    amount_xaf: 10000,
    status: "paid",
    payment_id: paymentId,
    paid_at: new Date().toISOString(),
  });
}

export async function listCertificatePurchases() {
  const me = await uid();
  const { data } = await getSupabase()
    .from("certificate_purchases")
    .select("kind, status, paid_at")
    .eq("user_id", me)
    .eq("status", "paid");
  return data ?? [];
}

export async function sendCertificateEmail(
  kind: "identity" | "trust-score" | "savings",
  email: string,
  paymentId?: string,
) {
  const me = await uid();
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) throw { status: 400, detail: "Adresse email invalide." };

  const report = await getCertifiedReport(kind);
  const { data, error } = await getSupabase().functions.invoke("send-certificate", {
    body: { kind, email: trimmed, html: report.html, filename: report.filename, payment_id: paymentId },
  });
  if (error) throw { status: 502, detail: error.message ?? "Envoi du certificat impossible." };
  if (!data?.ok) throw { status: 400, detail: data?.error ?? "Envoi du certificat impossible." };

  try {
    await getSupabase()
      .from("certificate_purchases")
      .update({ delivery_email: trimmed })
      .eq("user_id", me)
      .eq("kind", kind)
      .eq("status", "paid");
  } catch { /* column may be pending migration */ }

  return { ok: true, email_masked: data.email_masked ?? trimmed.replace(/(.{2}).+(@.+)/, "$1***$2") };
}
