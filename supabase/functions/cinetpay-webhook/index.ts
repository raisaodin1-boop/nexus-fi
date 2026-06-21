/**
 * HODIX — CinetPay notify_url webhook
 * Confirms payments automatically without user action.
 *
 * Secrets (Supabase Edge Functions):
 *   CINETPAY_API_KEY / CINETPAY_SITE_ID — checkout verification
 *   CINETPAY_WEBHOOK_SECRET — optional shared secret header
 *
 * notify_url: https://<project>.supabase.co/functions/v1/cinetpay-webhook
 * verify_jwt: false
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CORS, json, parseNotifyBody, verifyCheckoutPayment,
} from "../_shared/cinetpay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const secret = Deno.env.get("CINETPAY_WEBHOOK_SECRET")?.trim();
  if (secret) {
    const hdr = req.headers.get("x-cinetpay-webhook-secret")
      ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (hdr !== secret) return json({ ok: false, error: "Non autorisé" }, 401);
  }

  const payload = await parseNotifyBody(req);
  const transactionId = (
    payload.transaction_id
    ?? payload.cpm_trans_id
    ?? payload.client_transaction_id
    ?? ""
  ).trim();

  if (!transactionId) {
    console.warn("cinetpay-webhook: missing transaction_id", payload);
    return json({ ok: false, error: "transaction_id manquant" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: payment } = await admin
    .from("payments")
    .select("id, user_id, status, amount")
    .eq("id", transactionId)
    .maybeSingle();

  if (!payment) {
    console.warn("cinetpay-webhook: payment not found", transactionId);
    return json({ ok: true, ignored: true, reason: "payment_not_found" });
  }

  if (payment.status === "succeeded") {
    return json({ ok: true, payment_id: payment.id, already_fulfilled: true });
  }

  const verified = await verifyCheckoutPayment(transactionId);
  if (!verified) {
    console.warn("cinetpay-webhook: CinetPay check failed", transactionId);
    return json({ ok: false, error: "Paiement non confirmé par CinetPay" }, 402);
  }

  const cinetpayRef = payload.operator_id
    ?? payload.payment_token
    ?? payload.cpm_payment_id
    ?? `CP-${Date.now()}`;

  const { data: result, error: rpcErr } = await admin.rpc("confirm_cinetpay_payment", {
    p_payment_id: payment.id,
    p_reference: cinetpayRef,
  });

  if (rpcErr) {
    console.error("confirm_cinetpay_payment error:", rpcErr);
    return json({ ok: false, error: rpcErr.message }, 500);
  }

  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-receipt`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payment_id: payment.id, user_id: payment.user_id }),
    });
  } catch (e) {
    console.warn("send-receipt invoke failed:", e);
  }

  return json({ ok: true, payment_id: payment.id, result });
});
