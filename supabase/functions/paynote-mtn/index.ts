/**
 * HODIX — Paynote / Y-Note MTN Mobile Money (Cameroun)
 * initiate | status (read-only) | confirm (verify SUCCESSFUL + credit)
 *
 * Credit ONLY after Paynote status API returns SUCCESSFUL
 * (= customer PIN validated and MTN debit completed).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  PAYNOTE_WEBPAY_URL,
  checkPaynotePaymentStatus,
  extractMessageId,
  extractPaynoteStatus,
  getPaynoteAccessToken,
  isPaynoteFailedStatus,
  isPaynotePaidStatus,
  paynoteConfigured,
} from "../_shared/paynote.ts";

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

function webhookUrl(): string {
  const explicit = Deno.env.get("PAYNOTE_WEBHOOK_URL")?.trim();
  if (explicit) return explicit;
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
  const secret = Deno.env.get("PAYNOTE_WEBHOOK_SECRET")?.trim();
  const url = `${base}/functions/v1/paynote-webhook`;
  // Paynote posts to notifUrl as-is — embed secret so webhook can auth
  return secret ? `${url}?secret=${encodeURIComponent(secret)}` : url;
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

async function initiateWebPayment(
  token: string,
  orderId: string,
  msisdn: string,
  amount: number,
  description: string,
) {
  const customerkey = Deno.env.get("PAYNOTE_CUSTOMER_KEY")!.trim();
  const customersecret = Deno.env.get("PAYNOTE_CUSTOMER_SECRET")!.trim();

  const res = await fetch(PAYNOTE_WEBPAY_URL, {
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

async function loadPaymentForUser(paymentId: string, userId: string) {
  const admin = adminClient();
  const { data, error } = await admin
    .from("payments")
    .select("id, user_id, amount, status, description, provider_ref")
    .eq("id", paymentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/** Read-only operator status — never credits. */
async function readOperatorStatus(
  payment: {
    id: string;
    status: string;
    description: string | null;
    provider_ref?: string | null;
  },
  preferredMessageId?: string,
) {
  if (payment.status === "succeeded") {
    return { verified: true, status: "succeeded", payment_ref: payment.id, already_fulfilled: true };
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
      operator_status: null,
    };
  }

  const token = await getPaynoteAccessToken();
  const { ok, body } = await checkPaynotePaymentStatus(token, messageId);
  const operatorStatus = extractPaynoteStatus(body) || "UNKNOWN";
  const paid = ok && isPaynotePaidStatus(body);
  const failed = isPaynoteFailedStatus(body);

  return {
    verified: paid,
    status: paid ? "succeeded" : (failed ? "failed" : "pending"),
    operator_status: operatorStatus,
    payment_ref: String(body?.paymentRef ?? body?.PaymentRef ?? messageId),
    paynote: body,
    already_fulfilled: false,
  };
}

/** Verify SUCCESSFUL with Paynote status API, then credit via RPC. */
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

  const token = await getPaynoteAccessToken();
  const { ok, body } = await checkPaynotePaymentStatus(token, messageId);
  const operatorStatus = extractPaynoteStatus(body);
  const verified = ok && isPaynotePaidStatus(body);
  const paymentRef = String(
    body?.paymentRef ?? body?.PaymentRef ?? body?.MessageId ?? messageId,
  );

  if (!verified) {
    console.log(
      "paynote confirm not paid yet",
      payment.id,
      "operator_status=",
      operatorStatus || "none",
      "http_ok=",
      ok,
    );
    return {
      verified: false,
      status: isPaynoteFailedStatus(body) ? "failed" : "pending",
      operator_status: operatorStatus || null,
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
    operator_status: "SUCCESSFUL",
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

      const payment = await loadPaymentForUser(paymentId, user.id);
      if (!payment) return json({ ok: false, error: "Paiement introuvable." }, 404);
      if (payment.status !== "pending_paynote") {
        return json({ ok: false, error: "Ce paiement n'est pas en attente Paynote." }, 400);
      }

      const meta = parseMetaRaw(payment.description);
      const label = String(meta.label ?? "Paiement HODIX");

      const token = await getPaynoteAccessToken();
      const { ok, body } = await initiateWebPayment(
        token,
        paymentId,
        msisdn,
        Number(payment.amount),
        label,
      );

      // ErrorCode 200 = request ACCEPTED (USSD queued), not paid.
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
        return json({
          ok: false,
          error: "Paynote n'a pas renvoyé de MessageId. Réessayez — aucun débit n'a été confirmé.",
          paynote: body,
        }, 502);
      }

      await persistMessageId(paymentId, user.id, payment.description, messageId);

      return json({
        ok: true,
        message_id: messageId,
        status: "pending_paynote",
        // Explicit: initiate acceptance ≠ payment success
        paid: false,
        message: "Demande envoyée. Validez le PIN sur votre téléphone MTN — HODIX crédite uniquement après débit opérateur.",
        paynote: body,
      });
    }

    if (action === "status") {
      const paymentId = String(payload.payment_id ?? "").trim();
      if (!paymentId) return json({ ok: false, error: "payment_id requis." }, 400);

      const payment = await loadPaymentForUser(paymentId, user.id);
      if (!payment) return json({ ok: false, error: "Paiement introuvable." }, 404);

      const outcome = await readOperatorStatus(
        payment,
        String(payload.message_id ?? "").trim() || undefined,
      );
      // Read-only: never credit from status action
      return json({
        ok: true,
        db_status: payment.status,
        operator_paid: !!outcome.verified && payment.status !== "succeeded"
          ? outcome.verified
          : payment.status === "succeeded",
        ...outcome,
        // Prevent accidental credit if a client treats `verified` as "go credit"
        verified: payment.status === "succeeded",
      });
    }

    if (action === "confirm") {
      const paymentId = String(payload.payment_id ?? "").trim();
      if (!paymentId) return json({ ok: false, error: "payment_id requis." }, 400);

      const payment = await loadPaymentForUser(paymentId, user.id);
      if (!payment) return json({ ok: false, error: "Paiement introuvable." }, 404);

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
