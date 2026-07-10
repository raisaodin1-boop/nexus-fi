import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";
import { contributeTontineSecure } from "./tontines";
import { depositSaving } from "./savings";
import { contributeAssociation, contributeCooperative, contributeFund } from "./groups";
import { markCertificatePaid } from "./extras";
import type { PaymentKind } from "@/src/payment-nav";
import { parsePaymentMetaSafe } from "@/src/payment-meta-schema";
import { paymentToReceipt } from "@/src/payment-receipt";
import { notifyUser } from "./notifications";
import { invokePaynoteMtn } from "./paynote-mtn";

const PAYMENT_BLOCKED =
  "Paiement électronique requis. Utilisez la page de paiement — aucun crédit sans débit confirmé.";

export type PaymentProvider = "orange" | "mtn" | "moov" | "card";

export interface PaymentMeta {
  kind: PaymentKind;
  amount_xaf: number;
  label?: string;
  tontine_id?: string | null;
  goal_id?: string | null;
  association_id?: string | null;
  cooperative_id?: string | null;
  fund_id?: string | null;
  provider?: string;
  phone?: string;
  cinetpay_transaction_id?: string | null;
  paynote_message_id?: string | null;
  gateway?: "cinetpay" | "paynote";
  cert_kind?: "identity" | "trust-score" | "savings";
}

type InitiatePayload = {
  kind: PaymentKind;
  amount_xaf: number;
  label?: string;
  provider: PaymentProvider;
  phone?: string;
  tontine_id?: string;
  goal_id?: string;
  association_id?: string;
  cooperative_id?: string;
  fund_id?: string;
  cert_kind?: "identity" | "trust-score" | "savings";
};

type ConfirmPayload = {
  payment_id: string;
  transaction_id: string;
  provider?: string;
  phone?: string;
};

function encodeMeta(meta: PaymentMeta) {
  return JSON.stringify(meta);
}

export function parsePaymentMeta(description: string | null): PaymentMeta | null {
  if (!description) return null;
  const raw = description.split(" · ref:")[0]?.trim() ?? description;
  try {
    const parsed = JSON.parse(raw);
    return parsePaymentMetaSafe(parsed) as PaymentMeta | null;
  } catch {
    return null;
  }
}

export function buildPaymentRedirect(kind: PaymentKind, ctx: Record<string, string> = {}): string {
  const params = new URLSearchParams({ kind, ...ctx });
  return `/pay?${params.toString()}`;
}

/** Block direct credits; include payment screen redirect for client UX. */
export function rejectDirectPaymentRedirect(kind: PaymentKind, ctx: Record<string, string> = {}) {
  throw {
    status: 403,
    detail: PAYMENT_BLOCKED,
    redirect_to: buildPaymentRedirect(kind, ctx),
    payment_required: true,
  };
}

/** @deprecated Use rejectDirectPaymentRedirect with payment context when possible. */
export function rejectDirectPayment() {
  throw { status: 403, detail: PAYMENT_BLOCKED };
}

async function assertTontineMember(tontineId: string, userId: string) {
  const { count } = await getSupabase()
    .from("tontine_members")
    .select("*", { count: "exact", head: true })
    .eq("tontine_id", tontineId)
    .eq("user_id", userId);
  if (!count) throw { status: 403, detail: "Non membre de cette tontine." };
}

async function resolveTontineAmount(tontineId: string, fallback: number) {
  const { data: tontine } = await getSupabase()
    .from("tontines")
    .select("amount_per_cycle, contribution_amount")
    .eq("id", tontineId)
    .single();
  if (!tontine) throw { status: 404, detail: "Tontine introuvable." };
  const amount = Number(tontine.amount_per_cycle ?? tontine.contribution_amount ?? fallback);
  if (!amount || amount <= 0) throw { status: 400, detail: "Montant de cotisation invalide." };
  return amount;
}

async function validatePaymentTarget(me: string, payload: InitiatePayload): Promise<number> {
  let amount = Number(payload.amount_xaf);
  if (!Number.isFinite(amount) || amount <= 0) throw { status: 400, detail: "Montant invalide." };

  switch (payload.kind) {
    case "tontine_contribution": {
      if (!payload.tontine_id) throw { status: 400, detail: "tontine_id requis." };
      await assertTontineMember(payload.tontine_id, me);
      amount = await resolveTontineAmount(payload.tontine_id, amount);
      break;
    }
    case "savings_deposit": {
      if (!payload.goal_id) throw { status: 400, detail: "goal_id requis." };
      const { data: goal } = await getSupabase()
        .from("savings_goals").select("id").eq("id", payload.goal_id).eq("user_id", me).maybeSingle();
      if (!goal) throw { status: 404, detail: "Objectif d'épargne introuvable." };
      break;
    }
    case "association_contribution": {
      if (!payload.association_id) throw { status: 400, detail: "association_id requis." };
      const { count } = await getSupabase()
        .from("association_members").select("*", { count: "exact", head: true })
        .eq("association_id", payload.association_id).eq("user_id", me);
      if (!count) throw { status: 403, detail: "Non membre de cette association." };
      break;
    }
    case "cooperative_contribution": {
      if (!payload.cooperative_id) throw { status: 400, detail: "cooperative_id requis." };
      const { count } = await getSupabase()
        .from("cooperative_members").select("*", { count: "exact", head: true })
        .eq("cooperative_id", payload.cooperative_id).eq("user_id", me);
      if (!count) throw { status: 403, detail: "Non membre de cette coopérative." };
      break;
    }
    case "fund_contribution": {
      if (!payload.fund_id) throw { status: 400, detail: "fund_id requis." };
      const { count } = await getSupabase()
        .from("fund_members").select("*", { count: "exact", head: true })
        .eq("fund_id", payload.fund_id).eq("user_id", me);
      if (!count) throw { status: 403, detail: "Non membre de ce fonds." };
      break;
    }
    case "wallet_topup":
      break;
    case "certified_report":
      amount = 10000;
      break;
    case "manager_pro_subscription": {
      const { data: profile } = await getSupabase()
        .from("profiles").select("role").eq("id", me).single();
      if (!["tontine_manager", "super_admin", "admin"].includes(profile?.role ?? "")) {
        throw { status: 403, detail: "Manager Pro réservé aux Tontine Managers." };
      }
      amount = 4990;
      break;
    }
    default:
      throw { status: 400, detail: "Type de paiement inconnu." };
  }
  return amount;
}

async function fulfillPayment(meta: PaymentMeta, paymentId: string) {
  const amount = Number(meta.amount_xaf);
  switch (meta.kind) {
    case "tontine_contribution":
      if (!meta.tontine_id) break;
      await contributeTontineSecure(meta.tontine_id, amount, paymentId);
      break;
    case "savings_deposit":
      if (!meta.goal_id) break;
      await depositSaving(meta.goal_id, amount, "Dépôt MTN Paynote", paymentId);
      break;
    case "association_contribution":
      if (!meta.association_id) break;
      await contributeAssociation(meta.association_id, amount, paymentId);
      break;
    case "cooperative_contribution":
      if (!meta.cooperative_id) break;
      await contributeCooperative(meta.cooperative_id, amount, paymentId);
      break;
    case "fund_contribution":
      if (!meta.fund_id) break;
      await contributeFund(meta.fund_id, amount, paymentId);
      break;
    case "wallet_topup": {
      const { error: rpcErr } = await getSupabase().rpc("wallet_topup", {
        p_amount: amount,
        p_currency: "XAF",
        p_provider: meta.gateway === "paynote" ? "MTN MoMo (Paynote)" : (meta.provider ?? "CinetPay"),
        p_phone: meta.phone ?? "",
        p_amount_xaf: amount,
        p_payment_id: paymentId,
      });
      throwSb(rpcErr);
      const me = await uid();
      const { addIdentityEvent } = await import("./identity");
      await addIdentityEvent(me, "wallet_topup", 1);
      break;
    }
    case "certified_report":
      await markCertificatePaid(meta.cert_kind ?? "identity", paymentId ?? "");
      break;
    case "manager_pro_subscription": {
      const me = await uid();
      const sb = getSupabase();
      const { data: profile } = await sb.from("profiles").select("manager_pro_until").eq("id", me).single();
      const base = profile?.manager_pro_until && new Date(profile.manager_pro_until) > new Date()
        ? new Date(profile.manager_pro_until)
        : new Date();
      const until = new Date(base.getTime() + 30 * 86400000).toISOString();
      await sb.from("profiles").update({ manager_pro_plan: "pro", manager_pro_until: until }).eq("id", me);
      break;
    }
  }
}

async function initiatePaynoteMtnPayment(payload: InitiatePayload, amount: number, me: string) {
  const paymentId = crypto.randomUUID();
  const meta: PaymentMeta = {
    kind: payload.kind,
    amount_xaf: amount,
    label: payload.label,
    tontine_id: payload.tontine_id ?? null,
    goal_id: payload.goal_id ?? null,
    association_id: payload.association_id ?? null,
    cooperative_id: payload.cooperative_id ?? null,
    fund_id: payload.fund_id ?? null,
    provider: "mtn",
    phone: payload.phone?.trim(),
    gateway: "paynote",
    paynote_message_id: null,
    cert_kind: payload.cert_kind,
  };

  const { error } = await getSupabase().from("payments").insert({
    id: paymentId,
    user_id: me,
    amount,
    currency: "XAF",
    direction: "out",
    description: encodeMeta(meta),
    status: "pending_paynote",
  });
  throwSb(error);

  const paynote = await invokePaynoteMtn<{
    message_id?: string | null;
    message?: string;
    warning?: string;
  }>("initiate", {
    payment_id: paymentId,
    phone: payload.phone?.trim() ?? "",
  });

  if (paynote.message_id) {
    meta.paynote_message_id = paynote.message_id;
    const { error: updErr } = await getSupabase()
      .from("payments")
      .update({
        description: encodeMeta(meta),
        provider_ref: paynote.message_id,
      })
      .eq("id", paymentId)
      .eq("user_id", me);
    throwSb(updErr);
  }

  return {
    payment_id: paymentId,
    status: "pending_paynote",
    amount_xaf: amount,
    payment_url: null,
    gateway: "paynote" as const,
    message_id: paynote.message_id ?? null,
    sandbox_mode: false,
    message: paynote.message ?? "Validez le paiement MTN MoMo sur votre téléphone.",
  };
}

export async function initiateMtnPayment(payload: InitiatePayload) {
  const me = await uid();
  const provider = (payload.provider ?? "mtn").toLowerCase() as PaymentProvider;
  if (provider !== "mtn") {
    throw {
      status: 400,
      detail: provider === "orange"
        ? "Orange Money arrive bientôt. Utilisez MTN MoMo pour l'instant."
        : "Seul MTN Mobile Money est disponible pour le moment.",
    };
  }
  if (!(payload.phone ?? "").trim()) {
    throw { status: 400, detail: "Numéro MTN requis." };
  }

  const amount = await validatePaymentTarget(me, payload);
  return initiatePaynoteMtnPayment({ ...payload, provider: "mtn" }, amount, me);
}

/** @deprecated Alias — MTN Paynote uniquement */
export const initiateCinetpayPayment = initiateMtnPayment;

async function finalizePaynotePayment(
  payment: { id: string; description: string },
  transactionId: string,
) {
  const me = await uid();
  const meta = parsePaymentMeta(payment.description);
  if (!meta) throw { status: 500, detail: "Métadonnées de paiement invalides." };

  const { data: locked, error: lockErr } = await getSupabase()
    .from("payments")
    .update({
      status: "succeeded",
      description: `${payment.description.split(" · ref:")[0]} · ref:${transactionId}`,
    })
    .eq("id", payment.id)
    .eq("status", "pending_paynote")
    .select("id")
    .maybeSingle();
  throwSb(lockErr);
  if (!locked) {
    throw { status: 409, detail: "Ce paiement est déjà en cours de traitement ou finalisé." };
  }

  await fulfillPayment(meta, payment.id);

  await notifyUser({
    user_id: me,
    title: "Paiement confirmé",
    body: `${meta.amount_xaf.toLocaleString("fr-FR")} XAF — opération enregistrée après validation du paiement.`,
    type: "success",
  });

  let receiptEmail: { delivery?: string } | null = null;
  try {
    receiptEmail = await sendPaymentReceiptEmail(payment.id);
  } catch {
    // Reçu toujours disponible dans l'app même si l'email échoue.
  }

  return { payment_id: payment.id, status: "succeeded" as const, meta, receipt_email: receiptEmail };
}

export async function confirmPaynoteMtnPayment(payload: { payment_id: string }) {
  const me = await uid();
  const { data: payment, error } = await getSupabase()
    .from("payments")
    .select("*")
    .eq("id", payload.payment_id)
    .eq("user_id", me)
    .maybeSingle();
  throwSb(error);
  if (!payment) throw { status: 404, detail: "Paiement introuvable." };

  if (payment.status === "succeeded") {
    const meta = parsePaymentMeta(payment.description);
    if (!payment.receipt_email_sent_at) {
      try { await sendPaymentReceiptEmail(payment.id); } catch { /* best-effort */ }
    }
    return { payment_id: payment.id, status: "succeeded", already_fulfilled: true, meta };
  }
  if (payment.status !== "pending_paynote") {
    throw { status: 400, detail: "Ce paiement n'est plus en attente." };
  }

  // Atomic edge confirm: Paynote status check + DB credit (service role)
  const confirmRes = await invokePaynoteMtn<{
    verified?: boolean;
    status?: string;
    payment_ref?: string;
    result?: unknown;
    already_fulfilled?: boolean;
    error?: string;
  }>("confirm", { payment_id: payment.id });

  if (!confirmRes.verified) {
    throw {
      status: 402,
      detail: "Paiement MTN MoMo non confirmé. Validez sur votre téléphone — confirmation automatique en cours.",
    };
  }

  let receiptEmail: { delivery?: string } | null = null;
  try {
    receiptEmail = await sendPaymentReceiptEmail(payment.id);
  } catch { /* best-effort */ }

  const meta = parsePaymentMeta(payment.description);
  return {
    payment_id: payment.id,
    status: "succeeded" as const,
    meta,
    result: confirmRes.result,
    receipt_email: receiptEmail,
    already_fulfilled: !!confirmRes.already_fulfilled,
  };
}

export async function confirmCinetpayPayment(payload: ConfirmPayload) {
  return confirmPaynoteMtnPayment({ payment_id: payload.payment_id });
}

export async function getPaymentReceipt(paymentId: string) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("payments")
    .select("id, amount, status, description, created_at, receipt_email_sent_at")
    .eq("id", paymentId)
    .eq("user_id", me)
    .maybeSingle();
  throwSb(error);
  if (!data) throw { status: 404, detail: "Paiement introuvable." };
  if (data.status !== "succeeded") {
    throw { status: 400, detail: "Reçu disponible uniquement pour les paiements confirmés." };
  }
  const meta = parsePaymentMeta(data.description);
  return paymentToReceipt(data, meta);
}

export async function sendPaymentReceiptEmail(paymentId: string, force = false) {
  const { data, error } = await getSupabase().functions.invoke("send-receipt", {
    body: { payment_id: paymentId, force },
  });
  if (error) throw { status: 502, detail: error.message ?? "Envoi du reçu par email impossible." };
  if (!data?.ok) throw { status: 400, detail: data?.error ?? "Envoi du reçu par email impossible." };
  return data as {
    ok: boolean;
    delivery?: "email" | "app";
    already_sent?: boolean;
    email_masked?: string;
    receipt_id?: string;
    sent_at?: string;
  };
}

export async function getPaymentStatus(paymentId: string) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("payments")
    .select("id, status, amount, currency, description, created_at")
    .eq("id", paymentId)
    .eq("user_id", me)
    .maybeSingle();
  throwSb(error);
  if (!data) throw { status: 404, detail: "Paiement introuvable." };
  return data;
}

// Legacy aliases used by api router during transition
export const initiateMobileMoneyPayment = initiateCinetpayPayment;
export const confirmMobileMoneyPayment = (payload: any) =>
  confirmCinetpayPayment({
    payment_id: payload.payment_id ?? "",
    transaction_id: payload.reference ?? payload.transaction_id ?? "",
    provider: payload.provider,
    phone: payload.phone,
  });
export const createContributionCheckout = async (payload: {
  tontine_id?: string;
  amount_xaf?: number;
  phone?: string;
}) => {
  if (!payload.phone?.trim()) {
    throw { status: 400, detail: "Numéro MTN requis pour la cotisation." };
  }
  return initiateMtnPayment({
    kind: "tontine_contribution",
    amount_xaf: Number(payload.amount_xaf ?? 0),
    provider: "mtn",
    phone: payload.phone,
    tontine_id: payload.tontine_id,
  });
};
