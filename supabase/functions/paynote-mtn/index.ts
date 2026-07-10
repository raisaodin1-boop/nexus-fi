/**
 * HODIX — Paynote / Y-Note MTN Mobile Money (Cameroun)
 * initiate | status | confirm (atomic verify + credit)
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN_URL = "https://omapi-token.ynote.africa/oauth2/token";
const WEBPAY_URL = "https://omapi.ynote.africa/prod/webpayment";
const STATUS_URL = "https://omapi.ynote.africa/prod/webpaymentmtn/status";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function paynoteConfigured() {
  return !!(
    Deno.env.get("PAYNOTE_CLIENT_ID")?.trim()
    && Deno.env.get("PAYNOTE_CLIENT_SECRET")?.trim()
    && Deno.env.get("PAYNOTE_CUSTOMER_KEY")?.trim()
    && Deno.env.get("PAYNOTE_CUSTOMER_SECRET")?.trim()
  );
}

function webhookUrl(): string {
  const explicit = Deno.env.get("PAYNOTE_WEBHOOK_URL")?.trim();
  if (explicit) return explicit;
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
  return `${base}/functions/v1/paynote-webhook`;
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function normalizeMsisdn(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("237") && digits.length > 9) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function parseMetaRaw(description: string | null): Record<string, unknown> {
  if (!description) return {};
  const raw = description.split(" · ref:")[0]?.trim() ?? description;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractMessageId(body: Record<string, unknown>): string {
  const nested = [
    body?.MessageId,
    body?.messageId,
    body?.message_id,
    body?.paymentRef,
    body?.PaymentRef,
    (body?.QueueId as Record<string, unknown> | undefined)?.MessageId,
    (body?.parameters as Record<string, unknown> | undefined)?.MessageId,
    (body?.data as Record<string, unknown> | undefined)?.MessageId,
  ];
  for (const c of nested) {
    const s = String(c ?? "").trim();
    if (s.length >= 8) return s;
  }
  const m = JSON.stringify(body).match(/"MessageId"\s*:\s*"([^"]+)"/i);
  return m?.[1]?.trim() ?? "";
}

function isSuccessfulStatus(body: Record<string, unknown>): boolean {
  const candidates = [
    body?.status,
    body?.Status,
    body?.body,
    body?.paymentStatus,
    body?.message,
    (body?.data as Record<string, unknown> | undefined)?.status,
  ];
  return candidates.some((v) => {
    const s = String(v ?? "").toUpperCase();
    return s.includes("SUCCESS");
  });
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("PAYNOTE_CLIENT_ID")!.trim();
  const clientSecret = Deno.env.get("PAYNOTE_CLIENT_SECRET")!.trim();
  const basic = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) {
    throw new Error(body?.message ?? body?.error ?? "Token Paynote indisponible.");
  }
  return body.access_token as string;
}

async function initiateWebPayment(
  token: string,
  orderId: string,
  msisdn: string,
  amount: number,
  description: string,
) {
  const customerkey = Deno.env.get("PAYNOTE_CUSTOMER_KEY")!.trim();
  const customersecret = Deno.env.get("PAYNOTE_CUSTOMER_SECRET")!.trim();

  const res = await fetch(WEBPAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      API_MUT: {
        notifUrl: webhookUrl(),
        subscriberMsisdn: msisdn,
        description: description.slice(0, 120),
        amount: String(Math.round(amount)),
        order_id: orderId,
        customersecret,
        customerkey,
        PaiementMethod: "MTN_CMR",
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body: body as Record<string, unknown> };
}

async function checkPaymentStatus(token: string, messageId: string) {
  const customerkey = Deno.env.get("PAYNOTE_CUSTOMER_KEY")!.trim();
  const customersecret = Deno.env.get("PAYNOTE_CUSTOMER_SECRET")!.trim();

  const res = await fetch(STATUS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ customerkey, customersecret, message_id: messageId }),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { body: text, status: text };
  }
  return { ok: res.ok, body };
}

async function persistMessageId(
  paymentId: string,
  userId: string,
  description: string | null,
  messageId: string,
) {
  const admin = adminClient();
  const meta = parseMetaRaw(description);
  meta.paynote_message_id = messageId;
  meta.gateway = "paynote";
  const { error } = await admin
    .from("payments")
    .update({
      description: JSON.stringify(meta),
      provider_ref: messageId,
    })
    .eq("id", paymentId)
    .eq("user_id", userId);
  if (error) console.error("persistMessageId failed", paymentId, error.message);
}

async function confirmPaymentAtomic(
  payment: {
    id: string;
    user_id: string;
    status: string;
    description: string | null;
    provider_ref?: string | null;
  },
  preferredMessageId?: string,
) {
  if (payment.status === "succeeded") {
    return { verified: true, status: "succeeded", payment_ref: payment.id, already_fulfilled: true };
  }
  if (payment.status !== "pending_paynote") {
    return { verified: false, status: payment.status, error: "not_pending" };
  }

  const meta = parseMetaRaw(payment.description);
  const messageId = String(
    preferredMessageId
      ?? payment.provider_ref
      ?? meta.paynote_message_id
      ?? "",
  ).trim();

  if (!messageId) {
    return {
      verified: false,
      status: "pending",
      error: "missing_message_id",
    };
  }

  const token = await getAccessToken();
  const { ok, body } = await checkPaymentStatus(token, messageId);
  let verified = ok && isSuccessfulStatus(body);
  let paymentRef = String(
    body?.paymentRef ?? body?.PaymentRef ?? body?.MessageId ?? messageId,
  );

  if (!verified && messageId !== payment.id) {
    const retry = await checkPaymentStatus(token, payment.id);
    verified = retry.ok && isSuccessfulStatus(retry.body);
    if (verified) {
      paymentRef = String(
        retry.body?.paymentRef ?? retry.body?.MessageId ?? payment.id,
      );
    }
  }

  if (!verified) {
    return {
      verified: false,
      status: body?.status ?? body?.body ?? "pending",
      payment_ref: paymentRef,
      paynote: body,
    };
  }

  if (!payment.provider_ref || !meta.paynote_message_id) {
    await persistMessageId(payment.id, payment.user_id, payment.description, messageId);
  }

  const admin = adminClient();
  const { data: result, error: rpcErr } = await admin.rpc("confirm_cinetpay_payment", {
    p_payment_id: payment.id,
    p_reference: paymentRef,
  });
  if (rpcErr) {
    console.error("confirm_cinetpay_payment", payment.id, rpcErr.message);
    throw new Error(rpcErr.message);
  }

  return {
    verified: true,
    status: "succeeded",
    payment_ref: paymentRef,
    result,
    already_fulfilled: !!(result as { already_fulfilled?: boolean })?.already_fulfilled,
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    if (!paynoteConfigured()) {
      return json({ ok: false, error: "Paynote MTN non configuré." }, 503);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Non authentifié." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ ok: false, error: "Session invalide." }, 401);

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return json({ ok: false, error: "Corps JSON invalide." }, 400);
    }

    const action = String(payload.action ?? "");
    const admin = adminClient();

    if (action === "initiate") {
      const paymentId = String(payload.payment_id ?? "").trim();
      const phone = String(payload.phone ?? "").trim();
      if (!paymentId || !phone) {
        return json({ ok: false, error: "payment_id et phone requis." }, 400);
      }

      const msisdn = normalizeMsisdn(phone);
      if (msisdn.length !== 9 || !msisdn.startsWith("6")) {
        return json({ ok: false, error: "Numéro MTN invalide (9 chiffres, commence par 6)." }, 400);
      }

      const { data: payment, error: payErr } = await admin
        .from("payments")
        .select("id, user_id, amount, status, description, provider_ref")
        .eq("id", paymentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (payErr || !payment) return json({ ok: false, error: "Paiement introuvable." }, 404);
      if (payment.status !== "pending_paynote") {
        return json({ ok: false, error: "Ce paiement n'est pas en attente Paynote." }, 400);
      }

      const meta = parseMetaRaw(payment.description);
      const label = String(meta.label ?? "Paiement HODIX");

      const token = await getAccessToken();
      const { ok, body } = await initiateWebPayment(
        token,
        paymentId,
        msisdn,
        Number(payment.amount),
        label,
      );

      const errorCode = Number(body?.ErrorCode ?? body?.errorCode ?? 0);
      if (!ok || (errorCode && errorCode !== 200)) {
        return json({
          ok: false,
          error: String(body?.body ?? body?.ErrorMessage ?? body?.message ?? "Erreur Paynote USSD."),
          paynote: body,
        }, 502);
      }

      const messageId = extractMessageId(body);
      if (!messageId) {
        console.error("paynote initiate missing MessageId", paymentId, JSON.stringify(body));
        // Keep pending — USSD may already be on phone; webhook can still credit via order_id
        return json({
          ok: true,
          message_id: null,
          warning: "message_id_missing",
          message: "Demande envoyée. Validez sur votre téléphone — confirmation via webhook.",
          paynote: body,
        });
      }

      await persistMessageId(paymentId, user.id, payment.description, messageId);

      return json({
        ok: true,
        message_id: messageId,
        message: "Demande envoyée sur votre téléphone MTN. Validez avec votre code PIN.",
        paynote: body,
      });
    }

    if (action === "status" || action === "confirm") {
      const paymentId = String(payload.payment_id ?? "").trim();
      if (!paymentId) return json({ ok: false, error: "payment_id requis." }, 400);

      const { data: payment, error: payErr } = await admin
        .from("payments")
        .select("id, user_id, status, description, provider_ref")
        .eq("id", paymentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (payErr || !payment) return json({ ok: false, error: "Paiement introuvable." }, 404);

      if (action === "status" && payment.status === "succeeded") {
        return json({ ok: true, verified: true, status: "succeeded", payment_ref: paymentId });
      }

      const outcome = await confirmPaymentAtomic(
        payment,
        String(payload.message_id ?? "").trim() || undefined,
      );

      return json({
        ok: true,
        ...outcome,
      });
    }

    return json({ ok: false, error: "action invalide (initiate | status | confirm)." }, 400);
  } catch (e) {
    console.error("paynote-mtn error:", e);
    return json({
      ok: false,
      error: e instanceof Error ? e.message : "Erreur interne Paynote.",
    }, 500);
  }
});
