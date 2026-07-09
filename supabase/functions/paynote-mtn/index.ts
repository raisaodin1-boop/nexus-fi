/**
 * HODIX — Paynote / Y-Note MTN Mobile Money (Cameroun)
 *
 * Secrets (Supabase → Edge Functions → Secrets) :
 *   PAYNOTE_CLIENT_ID        — OAuth client id (Basic Auth username)
 *   PAYNOTE_CLIENT_SECRET    — OAuth client secret (Basic Auth password)
 *   PAYNOTE_CUSTOMER_KEY     — customerkey (webpayment)
 *   PAYNOTE_CUSTOMER_SECRET  — customersecret (webpayment)
 *
 * URL webhook (notifUrl) : https://<ref>.supabase.co/functions/v1/paynote-webhook
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

/** MTN Cameroon MSISDN — country code not required per Paynote docs */
export function normalizeMsisdn(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("237") && digits.length > 9) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
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
    throw new Error(body?.message ?? body?.error ?? "Impossible d'obtenir le token Paynote.");
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
  return { ok: res.ok, body };
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
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

function isSuccessfulStatus(body: Record<string, unknown>): boolean {
  const status = String(body?.status ?? body?.body ?? "").toUpperCase();
  return status.includes("SUCCESS");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  if (!paynoteConfigured()) {
    return json({ ok: false, error: "Paynote MTN non configuré (secrets manquants)." }, 503);
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

    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .select("id, user_id, amount, status, description")
      .eq("id", paymentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (payErr || !payment) return json({ ok: false, error: "Paiement introuvable." }, 404);
    if (payment.status !== "pending_paynote") {
      return json({ ok: false, error: "Ce paiement n'est pas en attente Paynote." }, 400);
    }

    const token = await getAccessToken();
    const label = (() => {
      try {
        const raw = (payment.description ?? "").split(" · ref:")[0];
        const meta = JSON.parse(raw) as { label?: string };
        return meta.label ?? "Paiement HODIX";
      } catch {
        return "Paiement HODIX";
      }
    })();

    const { ok, body } = await initiateWebPayment(
      token,
      paymentId,
      msisdn,
      Number(payment.amount),
      label,
    );

    const errorCode = Number(body?.ErrorCode ?? 0);
    if (!ok || (errorCode && errorCode !== 200)) {
      return json({
        ok: false,
        error: body?.body ?? body?.ErrorMessage ?? "Erreur Paynote lors de l'envoi USSD.",
        paynote: body,
      }, 502);
    }

    const messageId = String(body?.MessageId ?? "");
    if (messageId) {
      try {
        const raw = (payment.description ?? "").split(" · ref:")[0];
        const meta = JSON.parse(raw) as Record<string, unknown>;
        meta.paynote_message_id = messageId;
        meta.gateway = "paynote";
        await supabase
          .from("payments")
          .update({ description: JSON.stringify(meta) })
          .eq("id", paymentId)
          .eq("user_id", user.id);
      } catch { /* best-effort */ }
    }

    return json({
      ok: true,
      message_id: messageId,
      message: "Demande envoyée sur votre téléphone MTN. Validez avec votre code PIN.",
      paynote: body,
    });
  }

  if (action === "status") {
    const paymentId = String(payload.payment_id ?? "").trim();
    if (!paymentId) return json({ ok: false, error: "payment_id requis." }, 400);

    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .select("id, user_id, status, description")
      .eq("id", paymentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (payErr || !payment) return json({ ok: false, error: "Paiement introuvable." }, 404);

    let messageId = String(payload.message_id ?? "").trim();
    if (!messageId) {
      try {
        const raw = (payment.description ?? "").split(" · ref:")[0];
        const meta = JSON.parse(raw) as { paynote_message_id?: string };
        messageId = meta.paynote_message_id ?? "";
      } catch { /* ignore */ }
    }
    if (!messageId) {
      return json({ ok: false, error: "message_id Paynote manquant." }, 400);
    }

    const token = await getAccessToken();
    const { ok, body } = await checkPaymentStatus(token, messageId);
    const successful = ok && isSuccessfulStatus(body as Record<string, unknown>);

    return json({
      ok: true,
      verified: successful,
      status: (body as Record<string, unknown>)?.status ?? null,
      payment_ref: (body as Record<string, unknown>)?.paymentRef ?? messageId,
      paynote: body,
    });
  }

  return json({ ok: false, error: "action invalide (initiate | status)." }, 400);
});
