/**
 * Webhook Paynote / Y-Note — MTN MoMo
 *
 * Paynote posts here as soon as the operator finishes (success OR failure).
 * We re-verify via status API, then immediately:
 *  - SUCCESSFUL → credit HODIX + notify user
 *  - FAILED/EXPIRED/… → mark failed + notify user with clear FR message
 * Never credit from payload alone (SUCCESSFULL / ErrorCode 200 ≠ paid).
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  checkPaynotePaymentStatus,
  describePaynoteOutcome,
  extractMessageId,
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

function orderIdFrom(payload: Record<string, unknown>): string {
  return String(
    payload?.order_id
      ?? payload?.orderId
      ?? payload?.request_id
      ?? payload?.requestId
      ?? payload?.RequestId
      ?? (payload?.parameters as Record<string, unknown> | undefined)?.order_id
      ?? (payload?.data as Record<string, unknown> | undefined)?.order_id
      ?? "",
  ).trim();
}

function refFrom(payload: Record<string, unknown>, orderId: string): string {
  return String(
    payload?.paymentRef
      ?? payload?.PaymentRef
      ?? payload?.MessageId
      ?? payload?.message_id
      ?? payload?.messageId
      ?? orderId,
  ).trim();
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

async function notifyPayment(
  sb: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  type: string,
  paymentId: string,
) {
  const { error } = await sb.from("notifications").insert({
    user_id: userId,
    title,
    body,
    type,
    is_read: false,
    metadata: { payment_id: paymentId, action_url: "/payments", source: "paynote_webhook" },
  });
  if (error) console.error("paynote-webhook notify failed", error.message);
}

async function markPaymentFailed(
  sb: SupabaseClient,
  payment: { id: string; user_id: string; description: string | null },
  outcome: ReturnType<typeof describePaynoteOutcome>,
) {
  const meta = parseMetaRaw(payment.description);
  meta.paynote_failure = {
    operator_status: outcome.operator_status,
    reason: outcome.reason,
    operator_reason: outcome.reason,
    user_message: outcome.user_message,
    at: new Date().toISOString(),
  };
  const { error } = await sb
    .from("payments")
    .update({
      status: "failed",
      description: JSON.stringify(meta),
    })
    .eq("id", payment.id)
    .eq("status", "pending_paynote");
  if (error) {
    console.error("paynote-webhook mark failed", payment.id, error.message);
    return false;
  }
  // Prefer exact operator wording in the notification body
  const notifyBody = outcome.reason
    ? `${outcome.user_message}`
    : outcome.user_message;
  await notifyPayment(sb, payment.user_id, outcome.user_title, notifyBody, "alert", payment.id);
  return true;
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  const text = await req.text();
  if (!text.trim()) return {};

  if (ct.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    const out: Record<string, unknown> = {};
    params.forEach((v, k) => { out[k] = v; });
    return out;
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (text.includes("=") && text.includes("&")) {
      const params = new URLSearchParams(text);
      const out: Record<string, unknown> = {};
      params.forEach((v, k) => { out[k] = v; });
      if (Object.keys(out).length) return out;
    }
    return { raw: text };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);

  const webhookSecret = Deno.env.get("PAYNOTE_WEBHOOK_SECRET")?.trim() ?? "";
  const urlSecret = new URL(req.url).searchParams.get("secret") ?? "";
  const provided =
    req.headers.get("x-paynote-secret")
    ?? req.headers.get("x-webhook-secret")
    ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    ?? urlSecret
    ?? "";
  if (webhookSecret) {
    if (provided !== webhookSecret) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
  } else {
    console.error("CRITICAL: PAYNOTE_WEBHOOK_SECRET unset — set it and append ?secret=… to notifUrl");
  }

  if (!paynoteConfigured()) {
    return json({ ok: false, error: "paynote_not_configured" }, 503);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await parseBody(req);
  } catch {
    return json({ ok: false, error: "invalid body" }, 400);
  }

  console.log("paynote-webhook payload", JSON.stringify(payload).slice(0, 2000));

  const orderId = orderIdFrom(payload);
  const payloadRef = refFrom(payload, orderId || "");
  const messageId = extractMessageId(payload) || payloadRef;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  let paymentId = orderId && isUuid(orderId) ? orderId : "";

  if (!paymentId && messageId) {
    const { data: byRef } = await sb
      .from("payments")
      .select("id")
      .eq("provider_ref", messageId)
      .eq("status", "pending_paynote")
      .maybeSingle();
    paymentId = byRef?.id ?? "";
  }

  if (!paymentId && messageId) {
    const { data: byDesc } = await sb
      .from("payments")
      .select("id")
      .eq("status", "pending_paynote")
      .ilike("description", `%${messageId}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    paymentId = byDesc?.id ?? "";
  }

  if (!paymentId) {
    console.error("paynote-webhook: payment not found", orderId, messageId);
    return json({ ok: true, ignored: true, reason: "payment_not_found", order_id: orderId, ref: messageId });
  }

  const { data: payment } = await sb
    .from("payments")
    .select("id, user_id, status, description, provider_ref, amount")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) {
    return json({ ok: true, ignored: true, reason: "payment_not_found" });
  }

  if (payment.status === "succeeded") {
    return json({ ok: true, already_fulfilled: true, payment_id: paymentId });
  }

  if (messageId && messageId !== paymentId) {
    await sb.from("payments").update({ provider_ref: messageId }).eq("id", paymentId);
  }

  let token: string;
  try {
    token = await getPaynoteAccessToken();
  } catch (e) {
    console.error("paynote-webhook token error", e);
    return json({ ok: false, error: "token_unavailable" }, 502);
  }

  const { ok, body } = await checkPaynotePaymentStatus(token, messageId || paymentId);
  const outcome = describePaynoteOutcome(body);

  // Immediate failure path — notify user clearly (insufficient funds, etc.)
  if (ok && isPaynoteFailedStatus(body)) {
    if (payment.status === "pending_paynote") {
      await markPaymentFailed(sb, payment, outcome);
    }
    return json({
      ok: true,
      fulfilled: false,
      failed: true,
      payment_id: paymentId,
      operator_status: outcome.operator_status,
      operator_reason: outcome.reason || null,
      user_message: outcome.user_message,
      notified: true,
    });
  }

  if (!(ok && isPaynotePaidStatus(body))) {
    console.log(
      "paynote-webhook: still pending",
      paymentId,
      "operator_status=",
      outcome.operator_status,
    );
    return json({
      ok: true,
      ignored: true,
      reason: "awaiting_operator_debit",
      payment_id: paymentId,
      operator_status: outcome.operator_status,
      user_message: outcome.user_message,
    });
  }

  // Immediate success — credit then notify so the app sees succeeded ASAP
  const paymentRef = String(
    body?.paymentRef ?? body?.PaymentRef ?? messageId ?? paymentId,
  );

  const { data: result, error: rpcErr } = await sb.rpc("confirm_cinetpay_payment", {
    p_payment_id: paymentId,
    p_reference: paymentRef,
  });

  if (rpcErr) {
    console.error("paynote-webhook confirm error:", rpcErr.message, paymentId);
    return json({ ok: false, error: rpcErr.message }, 500);
  }

  const amount = Number(payment.amount ?? 0);
  const successBody = amount > 0
    ? `${outcome.user_message} Montant : ${amount.toLocaleString("fr-FR")} XAF.`
    : outcome.user_message;

  await notifyPayment(
    sb,
    payment.user_id,
    outcome.user_title,
    successBody,
    "payment",
    paymentId,
  );

  return json({
    ok: true,
    fulfilled: true,
    payment_id: paymentId,
    operator_status: "SUCCESSFUL",
    user_message: successBody,
    notified: true,
    result,
  });
});
