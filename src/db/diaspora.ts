import { getSupabase } from "@/src/supabase";
import { uid, throwSb, invalidateCache, cached, requireAdmin } from "./helpers";
import { notifyUser } from "./notifications";
import { addIdentityEvent, getTrustScore } from "./identity";
import { listTontines, getPublicTontineProfile } from "./tontines";
import { secureRandomAlphanumeric } from "./secure-random";
import { requireDiasporaAccess } from "./diaspora-enrollment";

const PROOF_BUCKET = "diaspora-proofs";

export type DiasporaPaymentMethod = "mtn_momo" | "orange_money" | "bank_transfer";
export type DiasporaStatus =
  | "pending_payment" | "proof_submitted" | "under_review" | "validated"
  | "rejected" | "needs_info" | "suspicious";

export interface DiasporaRequest {
  id: string;
  user_id: string;
  tontine_id: string;
  tontine_name?: string;
  reference_code: string;
  amount_expected: number;
  currency: string;
  cycle: number;
  due_date?: string | null;
  status: DiasporaStatus;
  payment_method?: DiasporaPaymentMethod | null;
  payer_type?: "self" | "relative" | null;
  payer_name?: string | null;
  payer_phone?: string | null;
  payer_relation?: string | null;
  declared_amount?: number | null;
  declared_currency?: string | null;
  payment_date?: string | null;
  payment_time_approx?: string | null;
  transaction_reference?: string | null;
  comment?: string | null;
  proof_path?: string | null;
  rejection_reason?: string | null;
  receipt_id?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiasporaHome {
  trust_score: number;
  trust_level: string;
  top_pct?: number;
  active_tontines: number;
  next_contribution?: DiasporaRequest | null;
  last_contribution?: DiasporaRequest | null;
  total_validated_12m: number;
  savings_progress_pct: number;
  todo: { text: string; route?: string; kind: string }[];
  upcoming: DiasporaRequest[];
  country_of_residence?: string | null;
  display_currency?: string;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = clean.length;
  const bytes = new Uint8Array(Math.floor(len * 3 / 4));
  let idx = 0;
  for (let i = 0; i < len; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = chars.indexOf(clean[i + 2]);
    const d = chars.indexOf(clean[i + 3]);
    bytes[idx++] = (a << 2) | (b >> 4);
    if (c !== -1) bytes[idx++] = ((b & 0xf) << 4) | (c >> 2);
    if (d !== -1) bytes[idx++] = ((c & 0x3) << 6) | d;
  }
  return bytes.slice(0, idx);
}

function tontineSlug(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return (clean.slice(0, 3) || "HDX").padEnd(3, "X");
}

function generateReference(tontineName: string): string {
  const slug = tontineSlug(tontineName);
  const now = new Date();
  const y = now.getFullYear();
  const md = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const seq = secureRandomAlphanumeric(4, "0123456789");
  return `HDX-${slug}-${y}-${md}-${seq}`;
}

function mapRequest(row: Record<string, unknown>, tontineName?: string): DiasporaRequest {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    tontine_id: String(row.tontine_id),
    tontine_name: tontineName ?? (row.tontine_name as string | undefined),
    reference_code: String(row.reference_code),
    amount_expected: Number(row.amount_expected ?? 0),
    currency: String(row.currency ?? "XAF"),
    cycle: Number(row.cycle ?? 1),
    due_date: row.due_date as string | null,
    status: row.status as DiasporaStatus,
    payment_method: row.payment_method as DiasporaPaymentMethod | null,
    payer_type: row.payer_type as "self" | "relative" | null,
    payer_name: row.payer_name as string | null,
    payer_phone: row.payer_phone as string | null,
    payer_relation: row.payer_relation as string | null,
    declared_amount: row.declared_amount != null ? Number(row.declared_amount) : null,
    declared_currency: row.declared_currency as string | null,
    payment_date: row.payment_date as string | null,
    payment_time_approx: row.payment_time_approx as string | null,
    transaction_reference: row.transaction_reference as string | null,
    comment: row.comment as string | null,
    proof_path: row.proof_path as string | null,
    rejection_reason: row.rejection_reason as string | null,
    receipt_id: row.receipt_id as string | null,
    reviewed_at: row.reviewed_at as string | null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function enrichRequests(rows: Record<string, unknown>[]): Promise<DiasporaRequest[]> {
  if (!rows.length) return [];
  const tontineIds = [...new Set(rows.map((r) => String(r.tontine_id)))];
  const { data: tontines } = await getSupabase().from("tontines").select("id, name").in("id", tontineIds);
  const nameMap = new Map((tontines ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
  return rows.map((r) => mapRequest(r, nameMap.get(String(r.tontine_id))));
}

export async function uploadDiasporaProof(base64: string, mime = "image/jpeg"): Promise<string> {
  await requireDiasporaAccess();
  const me = await uid();
  const ext = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : "jpg";
  const path = `${me}/proof-${secureRandomAlphanumeric(12, "abcdefghijklmnopqrstuvwxyz0123456789")}.${ext}`;
  const data = base64ToUint8Array(base64);
  if (data.length === 0) throw { status: 400, detail: "Fichier vide ou encodage invalide." };
  const { error } = await getSupabase().storage.from(PROOF_BUCKET).upload(path, data, { contentType: mime, upsert: true });
  throwSb(error);
  return path;
}

export async function ensureDiasporaRequest(tontineId: string): Promise<DiasporaRequest> {
  await requireDiasporaAccess();
  const me = await uid();
  const sb = getSupabase();

  const { data: tontine } = await sb.from("tontines").select("id, name, amount_per_cycle, contribution_amount, current_cycle, cycle_deadline, currency, frequency")
    .eq("id", tontineId).single();
  if (!tontine) throw { status: 404, detail: "Tontine introuvable." };

  const cycle = tontine.current_cycle ?? 1;
  const { data: existing } = await sb.from("diaspora_contribution_requests")
    .select("*")
    .eq("user_id", me)
    .eq("tontine_id", tontineId)
    .eq("cycle", cycle)
    .not("status", "in", '("validated")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return mapRequest(existing, tontine.name);

  const { data: paid } = await sb.from("tontine_contributions")
    .select("id").eq("tontine_id", tontineId).eq("user_id", me).eq("cycle", cycle).maybeSingle();
  if (paid) throw { status: 400, detail: "Cotisation déjà validée pour ce cycle." };

  const amount = Number(tontine.amount_per_cycle ?? tontine.contribution_amount ?? 0);
  const ref = generateReference(tontine.name);
  const due = tontine.cycle_deadline ?? new Date(Date.now() + 30 * 86400000).toISOString();

  const { data, error } = await sb.from("diaspora_contribution_requests").insert({
    user_id: me,
    tontine_id: tontineId,
    reference_code: ref,
    amount_expected: amount,
    currency: tontine.currency ?? "XAF",
    cycle,
    due_date: due,
    status: "pending_payment",
  }).select("*").single();
  throwSb(error);
  invalidateCache(`diaspora-${me}`);
  invalidateCache(`diaspora-home-${me}`);
  return mapRequest(data!, tontine.name);
}

export async function getDiasporaHome(): Promise<DiasporaHome> {
  const me = await uid();
  const access = await requireDiasporaAccess();
  return cached(`diaspora-home-${me}`, 60_000, async () => {
    const sb = getSupabase();
    const [trust, tontines, requestsRes, savingsRes, storyRes] = await Promise.all([
      getTrustScore().catch(() => ({ score: 0, level: "Bronze" })),
      listTontines().catch(() => []),
      sb.from("diaspora_contribution_requests").select("*").eq("user_id", me).order("created_at", { ascending: false }).limit(50),
      sb.from("savings_goals").select("current_amount, target_amount").eq("user_id", me),
      import("./dashboard-story").then((m) => m.getDashboardStory()).catch(() => null),
    ]);

    for (const t of tontines as { id: string }[]) {
      try { await ensureDiasporaRequest(t.id); } catch { /* déjà payé ou existant */ }
    }
    const refreshed = await sb.from("diaspora_contribution_requests").select("*").eq("user_id", me).order("created_at", { ascending: false }).limit(50);
    const requests = await enrichRequests(refreshed.data ?? requestsRes.data ?? []);
    const activeTontines = (tontines as any[]).length;

    const d12 = new Date(Date.now() - 365 * 86400000).toISOString();
    const totalValidated12m = requests
      .filter((r) => r.status === "validated" && r.reviewed_at && r.reviewed_at >= d12)
      .reduce((s, r) => s + r.amount_expected, 0);

    const savings = savingsRes.data ?? [];
    const saved = savings.reduce((s: number, g: { current_amount?: number }) => s + Number(g.current_amount ?? 0), 0);
    const target = savings.reduce((s: number, g: { target_amount?: number }) => s + Number(g.target_amount ?? 0), 0);
    const savingsProgress = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;

    const pending = requests.filter((r) => !["validated", "rejected"].includes(r.status));
    const nextContribution = pending.find((r) => r.status === "pending_payment") ?? pending[0] ?? null;
    const lastContribution = requests[0] ?? null;

    const todo: DiasporaHome["todo"] = [];
    if (nextContribution?.due_date) {
      const due = new Date(nextContribution.due_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
      todo.push({
        text: `Votre cotisation ${nextContribution.tontine_name ?? ""} est due le ${due}`,
        route: `/diaspora/pay/${nextContribution.id}`,
        kind: "due",
      });
    }
    const awaiting = requests.find((r) => ["proof_submitted", "under_review"].includes(r.status));
    if (awaiting) {
      todo.push({ text: "Une preuve de paiement est en attente de validation", route: `/diaspora/contributions`, kind: "review" });
    }
    todo.push({ text: "Complétez votre profil pour augmenter votre Trust Score", route: "/(tabs)/identity", kind: "profile" });
    todo.push({ text: "Invitez un membre de votre famille dans votre tontine", route: "/diaspora/join", kind: "invite" });

    return {
      trust_score: trust.score ?? 0,
      trust_level: trust.level ?? "Bronze",
      top_pct: storyRes?.top_pct,
      active_tontines: activeTontines,
      next_contribution: nextContribution,
      last_contribution: lastContribution,
      total_validated_12m: totalValidated12m,
      savings_progress_pct: savingsProgress,
      todo,
      upcoming: pending.slice(0, 5),
      country_of_residence: access.country_of_residence,
      display_currency: access.preferred_currency ?? "EUR",
    };
  });
}

export async function listDiasporaContributions(filters?: {
  status?: string;
  tontine_id?: string;
}) {
  await requireDiasporaAccess();
  const me = await uid();
  let q = getSupabase().from("diaspora_contribution_requests").select("*").eq("user_id", me).order("created_at", { ascending: false });
  if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters?.tontine_id) q = q.eq("tontine_id", filters.tontine_id);
  const { data, error } = await q.limit(100);
  throwSb(error);
  return enrichRequests(data ?? []);
}

export async function getDiasporaContribution(id: string): Promise<DiasporaRequest> {
  await requireDiasporaAccess();
  const me = await uid();
  const { data, error } = await getSupabase().from("diaspora_contribution_requests")
    .select("*").eq("id", id).eq("user_id", me).single();
  throwSb(error);
  const [req] = await enrichRequests([data]);
  return req;
}

export async function getDiasporaContributionAdmin(id: string) {
  await requireAdmin();
  const { data, error } = await getSupabase().from("diaspora_contribution_requests").select("*").eq("id", id).single();
  throwSb(error);
  const [req] = await enrichRequests([data]);
  const { data: profile } = await getSupabase().from("profiles")
    .select("full_name, email, country, kyc_status, trust_score").eq("id", data.user_id).single();
  let proof_url: string | null = null;
  if (data.proof_path) {
    const signed = await getSupabase().storage.from(PROOF_BUCKET).createSignedUrl(data.proof_path, 3600);
    proof_url = signed.data?.signedUrl ?? null;
  }
  const { data: audit } = await getSupabase().from("diaspora_audit_log")
    .select("*, profiles:actor_id(full_name)").eq("request_id", id).order("created_at", { ascending: false });
  return { ...req, user: profile, proof_url, audit: audit ?? [] };
}

export async function markDiasporaPaymentStarted(id: string, payload: {
  payment_method: DiasporaPaymentMethod;
  payer_type?: "self" | "relative";
  payer_name?: string;
  payer_phone?: string;
  payer_relation?: string;
  declared_amount?: number;
  declared_currency?: string;
}) {
  await requireDiasporaAccess();
  const me = await uid();
  const { data, error } = await getSupabase().from("diaspora_contribution_requests")
    .update({
      payment_method: payload.payment_method,
      payer_type: payload.payer_type ?? "self",
      payer_name: payload.payer_name ?? null,
      payer_phone: payload.payer_phone ?? null,
      payer_relation: payload.payer_relation ?? null,
      declared_amount: payload.declared_amount ?? null,
      declared_currency: payload.declared_currency ?? null,
      // Keep pending_payment until proof is uploaded so the user can resume pay/proof.
      status: "pending_payment",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id).eq("user_id", me).in("status", ["pending_payment", "rejected", "needs_info"])
    .select("*").single();
  throwSb(error);
  invalidateCache(`diaspora-${me}`);
  invalidateCache(`diaspora-home-${me}`);
  const [req] = await enrichRequests([data!]);
  return req;
}

export async function submitDiasporaProof(id: string, payload: {
  proof_path: string;
  declared_amount: number;
  declared_currency: string;
  payment_date: string;
  payment_time_approx?: string;
  transaction_reference?: string;
  payer_name?: string;
  payer_phone?: string;
  comment?: string;
  fraud_declaration: boolean;
}) {
  await requireDiasporaAccess();
  const me = await uid();
  if (!payload.fraud_declaration) throw { status: 400, detail: "Vous devez confirmer l'exactitude des informations." };
  if (!payload.proof_path) throw { status: 400, detail: "Pièce jointe obligatoire." };

  const { data, error } = await getSupabase().from("diaspora_contribution_requests")
    .update({
      proof_path: payload.proof_path,
      declared_amount: payload.declared_amount,
      declared_currency: payload.declared_currency,
      payment_date: payload.payment_date,
      payment_time_approx: payload.payment_time_approx ?? null,
      transaction_reference: payload.transaction_reference ?? null,
      payer_name: payload.payer_name ?? null,
      payer_phone: payload.payer_phone ?? null,
      comment: payload.comment ?? null,
      fraud_declaration: true,
      status: "under_review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id).eq("user_id", me)
    .in("status", ["pending_payment", "proof_submitted", "rejected", "needs_info"])
    .select("*").single();
  throwSb(error);

  await getSupabase().from("diaspora_audit_log").insert({
    request_id: id, actor_id: me, action: "proof_submitted", note: payload.comment ?? null,
  });

  await notifyUser({
    user_id: me,
    title: "Preuve reçue",
    body: "Votre preuve de paiement est en cours de vérification. Délai habituel : 24 à 48 h ouvrées.",
    type: "info",
    metadata: { action_url: `/diaspora/contributions` },
  });

  invalidateCache(`diaspora-${me}`);
  invalidateCache(`diaspora-home-${me}`);
  const [req] = await enrichRequests([data!]);
  return req;
}

export async function getDiasporaReceipt(id: string) {
  await requireDiasporaAccess();
  const req = await getDiasporaContribution(id);
  if (req.status !== "validated") throw { status: 400, detail: "Reçu disponible uniquement après validation." };
  const { data: profile } = await getSupabase().from("profiles").select("full_name").eq("id", req.user_id).single();
  const methodLabel = req.payment_method === "bank_transfer" ? "Virement bancaire"
    : req.payment_method === "orange_money" ? "Orange Money" : "MTN Mobile Money";
  return {
    receipt_id: req.receipt_id ?? `HDX-RCP-${req.id.slice(0, 8).toUpperCase()}`,
    member_name: profile?.full_name ?? "Membre",
    tontine_name: req.tontine_name ?? "Tontine",
    amount: req.amount_expected,
    currency: req.currency,
    payment_method: methodLabel,
    reference: req.reference_code,
    validated_at: req.reviewed_at,
    status: "Validé",
    verify_url: `https://www.hodix.app/verify/${req.receipt_id ?? req.id}`,
  };
}

export async function getDiasporaJoinPreview(inviteCode?: string, tontineId?: string) {
  if (tontineId) return getPublicTontineProfile(tontineId);
  if (!inviteCode?.trim()) throw { status: 400, detail: "Code ou tontine requis." };
  const { data } = await getSupabase()
    .from("tontines")
    .select("id, name, description, amount_per_cycle, contribution_amount, frequency, max_members, currency, country, language, is_public, invite_code, is_hodix_verified, display_member_count")
    .eq("invite_code", inviteCode.trim().toUpperCase())
    .maybeSingle();
  if (!data) throw { status: 404, detail: "Tontine introuvable." };
  // Invite-code preview must work for private groups (public directory still filters is_public).
  const contributionAmount = Number(data.amount_per_cycle ?? data.contribution_amount ?? 0);
  const { count } = await getSupabase()
    .from("tontine_members")
    .select("*", { count: "exact", head: true })
    .eq("tontine_id", data.id);
  return {
    ...data,
    contribution_amount: contributionAmount,
    amount_per_cycle: contributionAmount,
    members_count: count ?? 0,
    members: [],
    recent_activity: [],
  };
}

export async function joinTontineDiaspora(inviteCode: string, diasporaConsent: boolean) {
  await requireDiasporaAccess();
  if (!diasporaConsent) throw { status: 400, detail: "Vous devez accepter les conditions Diaspora." };
  const { joinTontineSecure } = await import("./tontines");
  return joinTontineSecure(inviteCode);
}

/* ── Admin ─────────────────────────────────────────────────── */

export async function adminListDiasporaRequests(filters?: {
  status?: string;
  method?: string;
  overdue?: boolean;
}) {
  await requireAdmin();
  let q = getSupabase().from("diaspora_contribution_requests").select("*").order("created_at", { ascending: false });
  if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters?.method) q = q.eq("payment_method", filters.method);
  if (filters?.overdue) q = q.lt("due_date", new Date().toISOString()).neq("status", "validated");
  const { data, error } = await q.limit(200);
  throwSb(error);
  const items = await enrichRequests(data ?? []);
  const userIds = [...new Set(items.map((i) => i.user_id))];
  const { data: profiles } = await getSupabase().from("profiles").select("id, full_name, email, country, kyc_status").in("id", userIds);
  const profMap = new Map((profiles ?? []).map((p: { id: string }) => [p.id, p]));
  return items.map((item) => ({ ...item, user: profMap.get(item.user_id) }));
}

export async function adminValidateDiaspora(id: string, note?: string) {
  await requireAdmin();
  const { data, error } = await getSupabase().rpc("validate_diaspora_contribution", {
    p_request_id: id,
    p_internal_note: note ?? null,
  });
  throwSb(error);

  const { data: req } = await getSupabase().from("diaspora_contribution_requests").select("user_id, amount_expected, currency, tontine_id").eq("id", id).single();
  if (req?.user_id) {
    await addIdentityEvent(req.user_id, "tontine_contribution", 1);
    await notifyUser({
      user_id: req.user_id,
      title: "Cotisation validée",
      body: `Votre cotisation de ${Number(req.amount_expected).toLocaleString("fr-FR")} ${req.currency ?? "XAF"} a été validée. Merci pour votre régularité.`,
      type: "success",
      metadata: { action_url: `/diaspora/receipt/${id}` },
    });
    await notifyUser({
      user_id: req.user_id,
      title: "Trust Score",
      body: "Votre Trust Score a progressé grâce à votre cotisation régulière.",
      type: "success",
    });
  }
  invalidateCache("diaspora");
  return data;
}

export async function adminRejectDiaspora(id: string, reason: string, note?: string) {
  await requireAdmin();
  const me = await uid();
  const { data, error } = await getSupabase().from("diaspora_contribution_requests")
    .update({
      status: "rejected",
      rejection_reason: reason,
      reviewed_by: me,
      reviewed_at: new Date().toISOString(),
      internal_note: note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "validated")
    .select("user_id, amount_expected, currency")
    .single();
  throwSb(error);

  await getSupabase().from("diaspora_audit_log").insert({
    request_id: id, actor_id: me, action: "rejected", note: `${reason}${note ? ` — ${note}` : ""}`,
  });

  if (data?.user_id) {
    await notifyUser({
      user_id: data.user_id,
      title: "Cotisation non validée",
      body: reason,
      type: "alert",
      metadata: { action_url: `/diaspora/contributions` },
    });
  }
  return { detail: "Cotisation rejetée" };
}

export async function adminRequestDiasporaInfo(id: string, message: string) {
  await requireAdmin();
  const me = await uid();
  const { data, error } = await getSupabase().from("diaspora_contribution_requests")
    .update({ status: "needs_info", internal_note: message, updated_at: new Date().toISOString() })
    .eq("id", id).select("user_id").single();
  throwSb(error);
  await getSupabase().from("diaspora_audit_log").insert({ request_id: id, actor_id: me, action: "needs_info", note: message });
  if (data?.user_id) {
    await notifyUser({
      user_id: data.user_id,
      title: "Informations complémentaires requises",
      body: message,
      type: "alert",
      metadata: { action_url: `/diaspora/proof/${id}` },
    });
  }
  return { detail: "Demande envoyée" };
}

export async function adminMarkDiasporaSuspicious(id: string, note?: string) {
  await requireAdmin();
  const me = await uid();
  const { error } = await getSupabase().from("diaspora_contribution_requests")
    .update({ status: "suspicious", internal_note: note ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);
  throwSb(error);
  await getSupabase().from("diaspora_audit_log").insert({ request_id: id, actor_id: me, action: "suspicious", note: note ?? null });
  return { detail: "Marqué comme suspect" };
}

export async function adminAssignDiaspora(id: string, agentId: string) {
  await requireAdmin();
  const { error } = await getSupabase().from("diaspora_contribution_requests")
    .update({ assigned_to: agentId, updated_at: new Date().toISOString() }).eq("id", id);
  throwSb(error);
  return { detail: "Assigné" };
}

export async function adminDiasporaStats() {
  await requireAdmin();
  const sb = getSupabase();
  const [pending, today, validated] = await Promise.all([
    sb.from("diaspora_contribution_requests").select("*", { count: "exact", head: true })
      .in("status", ["under_review", "proof_submitted", "needs_info", "suspicious"]),
    sb.from("diaspora_contribution_requests").select("*", { count: "exact", head: true })
      .gte("created_at", new Date().toISOString().slice(0, 10)),
    sb.from("diaspora_contribution_requests").select("*", { count: "exact", head: true }).eq("status", "validated"),
  ]);
  return {
    pending: pending.count ?? 0,
    received_today: today.count ?? 0,
    validated_total: validated.count ?? 0,
  };
}
