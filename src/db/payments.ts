import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";
import { contributeTontineSecure } from "./tontines";
import { depositSaving } from "./savings";
import { contributeAssociation, contributeCooperative, contributeFund } from "./groups";
import { markCertificatePaid } from "./extras";
import type { PaymentKind } from "@/src/payment-nav";
import { paymentToReceipt } from "@/src/payment-receipt";
import { notifyUser } from "./notifications";

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

function cinetpayConfigured() {
  const apiKey = process.env.EXPO_PUBLIC_CINETPAY_API_KEY?.trim();
  const siteId = process.env.EXPO_PUBLIC_CINETPAY_SITE_ID?.trim();
  return !!(apiKey && siteId);
}

function encodeMeta(meta: PaymentMeta) {
  return JSON.stringify(meta);
}

export function parsePaymentMeta(description: string | null): PaymentMeta | null {
  if (!description) return null;
  const raw = description.split(" · ref:")[0]?.trim() ?? description;
  try {
    return JSON.parse(raw) as PaymentMeta;
  } catch {
    return null;
  }
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
  if (!amount || amount <= 0) throw { status: 400, detail: "Montant invalide." };

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
    default:
      throw { status: 400, detail: "Type de paiement inconnu." };
  }
  return amount;
}

async function fulfillPayment(meta: PaymentMeta, paymentId?: string) {
  const amount = Number(meta.amount_xaf);
  switch (meta.kind) {
    case "tontine_contribution":
      if (!meta.tontine_id) break;
      await contributeTontineSecure(meta.tontine_id, amount);
      break;
    case "savings_deposit":
      if (!meta.goal_id) break;
      await depositSaving(meta.goal_id, amount, "Dépôt CinetPay");
      break;
    case "association_contribution":
      if (!meta.association_id) break;
      await contributeAssociation(meta.association_id, amount);
      break;
    case "cooperative_contribution":
      if (!meta.cooperative_id) break;
      await contributeCooperative(meta.cooperative_id, amount);
      break;
    case "fund_contribution":
      if (!meta.fund_id) break;
      await contributeFund(meta.fund_id, amount);
      break;
    case "wallet_topup": {
      const { error: rpcErr } = await getSupabase().rpc("wallet_topup", {
        p_amount: amount,
        p_currency: "XAF",
        p_provider: meta.provider ?? "CinetPay",
        p_phone: meta.phone ?? "",
        p_amount_xaf: amount,
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
  }
}

async function createCinetpayCheckout(paymentId: string, amount: number, meta: PaymentMeta, provider: PaymentProvider) {
  const apiKey = process.env.EXPO_PUBLIC_CINETPAY_API_KEY?.trim();
  const siteId = process.env.EXPO_PUBLIC_CINETPAY_SITE_ID?.trim();
  if (!apiKey || !siteId) return null;

  const channels = provider === "card" ? "CREDIT_CARD" : "MOBILE_MONEY";
  const response = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: apiKey,
      site_id: siteId,
      transaction_id: paymentId,
      amount,
      currency: "XAF",
      description: meta.label ?? "Paiement Hodix",
      channels,
      customer_phone_number: meta.phone ?? "",
      notify_url: process.env.EXPO_PUBLIC_CINETPAY_NOTIFY_URL ?? undefined,
      return_url: process.env.EXPO_PUBLIC_CINETPAY_RETURN_URL ?? undefined,
      metadata: meta,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.code !== "201") {
    throw { status: 502, detail: body?.message ?? "Erreur CinetPay lors de l'initialisation." };
  }
  return {
    payment_url: body.data?.payment_url as string | undefined,
    cinetpay_transaction_id: body.data?.payment_token as string | undefined,
  };
}

async function verifyCinetpayTransaction(paymentId: string) {
  const apiKey = process.env.EXPO_PUBLIC_CINETPAY_API_KEY?.trim();
  const siteId = process.env.EXPO_PUBLIC_CINETPAY_SITE_ID?.trim();
  if (!apiKey || !siteId) return false;

  const response = await fetch("https://api-checkout.cinetpay.com/v2/payment/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey, site_id: siteId, transaction_id: paymentId }),
  });
  const body = await response.json().catch(() => ({}));
  return body?.data?.status === "ACCEPTED";
}

/** Block direct client-side credits without electronic payment. */
export function rejectDirectPayment() {
  throw { status: 403, detail: PAYMENT_BLOCKED };
}

export async function initiateCinetpayPayment(payload: InitiatePayload) {
  const me = await uid();
  const provider = (payload.provider ?? "").toLowerCase() as PaymentProvider;
  if (!["orange", "mtn", "moov", "card"].includes(provider)) {
    throw { status: 400, detail: "Mode de paiement invalide." };
  }
  if (provider !== "card" && !(payload.phone ?? "").trim()) {
    throw { status: 400, detail: "Numéro de téléphone requis." };
  }

  const amount = await validatePaymentTarget(me, payload);
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
    provider,
    phone: payload.phone?.trim(),
    cinetpay_transaction_id: null,
    cert_kind: payload.cert_kind,
  };

  const checkout = await createCinetpayCheckout(paymentId, amount, meta, provider);
  if (checkout?.cinetpay_transaction_id) meta.cinetpay_transaction_id = checkout.cinetpay_transaction_id;

  const { error } = await getSupabase().from("payments").insert({
    id: paymentId,
    user_id: me,
    amount,
    currency: "XAF",
    direction: "out",
    description: encodeMeta(meta),
    status: "pending_cinetpay",
  });
  throwSb(error);

  return {
    payment_id: paymentId,
    status: "pending_cinetpay",
    amount_xaf: amount,
    payment_url: checkout?.payment_url ?? null,
    sandbox_mode: !cinetpayConfigured(),
    message: cinetpayConfigured()
      ? "Redirection vers CinetPay pour finaliser le paiement."
      : "Mode test : validez avec la référence de transaction reçue après paiement.",
  };
}

export async function confirmCinetpayPayment(payload: ConfirmPayload) {
  const me = await uid();
  const transactionId = (payload.transaction_id ?? "").trim();
  if (!transactionId) throw { status: 400, detail: "Référence de transaction obligatoire." };

  const { data: payment, error } = await getSupabase()
    .from("payments")
    .select("*")
    .eq("id", payload.payment_id)
    .eq("user_id", me)
    .maybeSingle();
  throwSb(error);
  if (!payment) throw { status: 404, detail: "Paiement introuvable." };
  if (payment.status === "succeeded") {
    if (!payment.receipt_email_sent_at) {
      try { await sendPaymentReceiptEmail(payment.id); } catch { /* best-effort */ }
    }
    return { payment_id: payment.id, status: "succeeded", already_fulfilled: true };
  }
  if (payment.status !== "pending_cinetpay") {
    throw { status: 400, detail: "Ce paiement n'est plus en attente." };
  }

  const sandboxAllowed = process.env.EXPO_PUBLIC_PAYMENT_SANDBOX === "true";
  const verified = cinetpayConfigured()
    ? await verifyCinetpayTransaction(payment.id)
    : sandboxAllowed && transactionId.length >= 8;

  if (!verified) {
    throw { status: 402, detail: "Paiement non confirmé par CinetPay. L'opération n'a pas été créditée." };
  }

  const meta = parsePaymentMeta(payment.description);
  if (!meta) throw { status: 500, detail: "Métadonnées de paiement invalides." };

  const { error: updErr } = await getSupabase()
    .from("payments")
    .update({
      status: "succeeded",
      description: `${payment.description} · ref:${transactionId}`,
    })
    .eq("id", payment.id);
  throwSb(updErr);

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

  return { payment_id: payment.id, status: "succeeded", meta, receipt_email: receiptEmail };
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
export const createContributionCheckout = async (payload: { tontine_id?: string; amount_xaf?: number }) => {
  return initiateCinetpayPayment({
    kind: "tontine_contribution",
    amount_xaf: Number(payload.amount_xaf ?? 0),
    provider: "card",
    tontine_id: payload.tontine_id,
  });
};
