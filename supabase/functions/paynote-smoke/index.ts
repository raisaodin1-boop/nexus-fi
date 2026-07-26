/**
 * One-shot Paynote MTN probe — initiate only, never credits HODIX.
 * Protected by PAYNOTE_SMOKE_TOKEN header x-smoke-token.
 */
import {
  PAYNOTE_WEBPAY_URL,
  checkPaynotePaymentStatus,
  extractMessageId,
  extractPaynoteStatus,
  getPaynoteAccessToken,
  isPaynotePaidStatus,
  paynoteConfigured,
} from "../_shared/paynote.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-smoke-token",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const expected = Deno.env.get("PAYNOTE_SMOKE_TOKEN")?.trim() ?? "";
  const provided = req.headers.get("x-smoke-token")?.trim() ?? "";
  if (!expected || provided !== expected) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (!paynoteConfigured()) {
    return json({ ok: false, error: "paynote_not_configured" }, 503);
  }

  let body: {
    phone?: string;
    amount?: number;
    order_id?: string;
    action?: string;
    message_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  if (String(body.action ?? "") === "status") {
    const messageId = String(body.message_id ?? "").trim();
    if (!messageId) return json({ ok: false, error: "message_id_required" }, 400);
    try {
      const token = await getPaynoteAccessToken();
      const { ok, body: st } = await checkPaynotePaymentStatus(token, messageId);
      return json({
        ok: true,
        message_id: messageId,
        http_ok: ok,
        operator_status: extractPaynoteStatus(st) || null,
        paid: ok && isPaynotePaidStatus(st),
        paynote: st,
      });
    } catch (e) {
      return json({
        ok: false,
        error: e instanceof Error ? e.message : "status_error",
      }, 500);
    }
  }

  let msisdn = String(body.phone ?? "").replace(/\D/g, "");
  if (msisdn.startsWith("237") && msisdn.length > 9) msisdn = msisdn.slice(3);
  if (msisdn.startsWith("0")) msisdn = msisdn.slice(1);
  if (msisdn.length !== 9 || !msisdn.startsWith("6")) {
    return json({ ok: false, error: "invalid_mtn_msisdn" }, 400);
  }

  const amount = Math.round(Number(body.amount ?? 0));
  if (!Number.isFinite(amount) || amount < 100 || amount > 5000) {
    return json({ ok: false, error: "amount_out_of_range_100_5000" }, 400);
  }

  const orderId = String(body.order_id ?? `smoke-${Date.now()}`).replace(/\s+/g, "_").slice(0, 40);
  const notifUrl = `${Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "")}/functions/v1/paynote-webhook`;
  const customerkey = Deno.env.get("PAYNOTE_CUSTOMER_KEY")!.trim();
  const customersecret = Deno.env.get("PAYNOTE_CUSTOMER_SECRET")!.trim();

  try {
    const token = await getPaynoteAccessToken();
    const res = await fetch(PAYNOTE_WEBPAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        API_MUT: {
          notifUrl,
          subscriberMsisdn: msisdn,
          description: "HODIX smoke test 500 XAF",
          amount: String(amount),
          order_id: orderId,
          customersecret,
          customerkey,
          PaiementMethod: "MTN_CMR",
        },
      }),
    });
    const paynote = await res.json().catch(() => ({})) as Record<string, unknown>;
    const errorCode = Number(paynote?.ErrorCode ?? paynote?.errorCode ?? 0);
    const messageId = extractMessageId(paynote);
    const accepted = res.ok && errorCode === 200 && !!messageId;

    return json({
      ok: accepted,
      stage: "initiate_only",
      paid: false,
      note: "ErrorCode 200 = USSD request accepted, NOT paid. Validate PIN on phone to debit.",
      http_ok: res.ok,
      error_code: errorCode || null,
      message_id: messageId || null,
      order_id: orderId,
      msisdn,
      amount,
      paynote,
    }, accepted ? 200 : 502);
  } catch (e) {
    return json({
      ok: false,
      error: e instanceof Error ? e.message : "paynote_error",
    }, 500);
  }
});
