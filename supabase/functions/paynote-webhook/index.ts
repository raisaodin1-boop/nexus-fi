/**
 * Webhook Paynote / Y-Note — notifications MTN MoMo → crédit automatique.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

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

function isSuccessful(payload: Record<string, unknown>): boolean {
  const status = String(payload?.status ?? payload?.body ?? "").toUpperCase();
  return status.includes("SUCCESS");
}

function orderIdFrom(payload: Record<string, unknown>): string {
  return String(
    payload?.order_id ?? payload?.orderId ?? payload?.request_id ?? payload?.requestId ?? "",
  ).trim();
}

function refFrom(payload: Record<string, unknown>, orderId: string): string {
  return String(
    payload?.paymentRef ?? payload?.MessageId ?? payload?.message_id ?? orderId,
  ).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  if (!isSuccessful(payload)) {
    return json({ ok: true, ignored: true, reason: "not successful" });
  }

  const orderId = orderIdFrom(payload);
  if (!orderId) return json({ ok: false, error: "order_id missing" }, 400);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const paymentRef = refFrom(payload, orderId);

  const { data: result, error: rpcErr } = await sb.rpc("confirm_cinetpay_payment", {
    p_payment_id: orderId,
    p_reference: paymentRef,
  });

  if (rpcErr) {
    console.error("paynote-webhook confirm error:", rpcErr.message, orderId);
    return json({ ok: false, error: rpcErr.message }, 500);
  }

  return json({ ok: true, fulfilled: true, payment_id: orderId, result });
});
