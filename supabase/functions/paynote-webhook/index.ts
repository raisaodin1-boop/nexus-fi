/**
 * Webhook Paynote / Y-Note — notifications de paiement MTN MoMo.
 * URL à configurer comme notifUrl dans les requêtes webpayment.
 */
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

  // Acknowledge webhook — fulfillment is done via client poll (paynote-mtn status).
  return json({ ok: true, received: true, order_id: payload?.order_id ?? null });
});
