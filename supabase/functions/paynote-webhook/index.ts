/**
 * Webhook Paynote / Y-Note — MTN MoMo SUCCESS → crédit instantané HODIX.
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
  const candidates = [
    payload?.status,
    payload?.Status,
    payload?.body,
    payload?.paymentStatus,
    payload?.message,
    payload?.Message,
    (payload?.data as Record<string, unknown> | undefined)?.status,
    (payload?.parameters as Record<string, unknown> | undefined)?.status,
  ];
  const hit = candidates.some((v) => String(v ?? "").toUpperCase().includes("SUCCESS"));
  if (hit) return true;
  // Some Paynote callbacks only send ErrorCode 200 + paymentRef
  const code = Number(payload?.ErrorCode ?? payload?.errorCode ?? NaN);
  if (code === 200 && (payload?.paymentRef || payload?.MessageId || payload?.order_id)) {
    return true;
  }
  return false;
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
    // Try form-encoded even without header
    if (text.includes("=") && text.includes("&")) {
      const params = new URLSearchParams(text);
      const out: Record<string, unknown> = {};
      params.forEach((v, k) => { out[k] = v; });
      if (Object.keys(out).length) return out;
    }
    return { raw: text, status: text };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await parseBody(req);
  } catch {
    return json({ ok: false, error: "invalid body" }, 400);
  }

  console.log("paynote-webhook payload", JSON.stringify(payload).slice(0, 2000));

  if (!isSuccessful(payload)) {
    return json({ ok: true, ignored: true, reason: "not successful" });
  }

  const orderId = orderIdFrom(payload);
  const paymentRef = refFrom(payload, orderId || "paynote");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  let paymentId = orderId && isUuid(orderId) ? orderId : "";

  if (!paymentId && paymentRef) {
    const { data: byRef } = await sb
      .from("payments")
      .select("id")
      .eq("provider_ref", paymentRef)
      .eq("status", "pending_paynote")
      .maybeSingle();
    paymentId = byRef?.id ?? "";
  }

  if (!paymentId && paymentRef) {
    const { data: byDesc } = await sb
      .from("payments")
      .select("id")
      .eq("status", "pending_paynote")
      .ilike("description", `%${paymentRef}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    paymentId = byDesc?.id ?? "";
  }

  if (!paymentId) {
    console.error("paynote-webhook: payment not found", orderId, paymentRef);
    return json({ ok: false, error: "payment not found", order_id: orderId, ref: paymentRef }, 404);
  }

  // Persist provider_ref for future polls
  if (paymentRef && paymentRef !== paymentId) {
    await sb.from("payments").update({ provider_ref: paymentRef }).eq("id", paymentId);
  }

  const { data: result, error: rpcErr } = await sb.rpc("confirm_cinetpay_payment", {
    p_payment_id: paymentId,
    p_reference: paymentRef,
  });

  if (rpcErr) {
    console.error("paynote-webhook confirm error:", rpcErr.message, paymentId);
    return json({ ok: false, error: rpcErr.message }, 500);
  }

  return json({ ok: true, fulfilled: true, payment_id: paymentId, result });
});
