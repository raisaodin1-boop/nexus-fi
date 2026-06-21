/**
 * CinetPay helpers — checkout verification + transfer (disbursement)
 */

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cinetpay-webhook-secret",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export function parseMeta(description: string | null): Record<string, unknown> | null {
  if (!description) return null;
  const raw = description.split(" · ref:")[0]?.trim() ?? description;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Verify checkout payment via CinetPay v2 check API */
export async function verifyCheckoutPayment(transactionId: string): Promise<boolean> {
  const apiKey = Deno.env.get("CINETPAY_API_KEY")?.trim()
    ?? Deno.env.get("EXPO_PUBLIC_CINETPAY_API_KEY")?.trim();
  const siteId = Deno.env.get("CINETPAY_SITE_ID")?.trim()
    ?? Deno.env.get("EXPO_PUBLIC_CINETPAY_SITE_ID")?.trim();
  if (!apiKey || !siteId) return false;

  const response = await fetch("https://api-checkout.cinetpay.com/v2/payment/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey, site_id: siteId, transaction_id: transactionId }),
  });
  const body = await response.json().catch(() => ({}));
  return body?.data?.status === "ACCEPTED";
}

/** Parse E.164-ish phone into CinetPay prefix + national number */
export function parsePhone(raw: string, defaultPrefix = "237"): { prefix: string; phone: string } {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("237") && digits.length >= 12) {
    return { prefix: "237", phone: digits.slice(3) };
  }
  if (digits.startsWith("225") && digits.length >= 11) {
    return { prefix: "225", phone: digits.slice(3) };
  }
  if (digits.startsWith("221") && digits.length >= 11) {
    return { prefix: "221", phone: digits.slice(3) };
  }
  return { prefix: defaultPrefix, phone: digits.replace(/^0+/, "") };
}

/** Map HODIX provider label → CinetPay transfer payment_method */
export function mapTransferMethod(provider: string, prefix: string): string {
  const p = provider.toLowerCase();
  if (p.includes("mtn")) return prefix === "237" ? "MTNCM" : "MOMO";
  if (p.includes("orange")) return prefix === "237" ? "OMCM" : "OM";
  if (p.includes("moov")) return prefix === "225" ? "FLOOZ" : "MOOV";
  if (p.includes("wave")) return prefix === "225" ? "WAVECI" : "WAVESN";
  return prefix === "237" ? "MTNCM" : "MOMO";
}

/** Round amount to nearest multiple of 5 (CinetPay transfer requirement) */
export function roundTransferAmount(amount: number): number {
  return Math.max(5, Math.round(amount / 5) * 5);
}

let cachedTransferToken: { token: string; expiresAt: number } | null = null;

export async function getTransferToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedTransferToken && cachedTransferToken.expiresAt > now + 60_000) {
    return cachedTransferToken.token;
  }

  const apikey = Deno.env.get("CINETPAY_TRANSFER_APIKEY")?.trim()
    ?? Deno.env.get("CINETPAY_API_KEY")?.trim();
  const password = Deno.env.get("CINETPAY_TRANSFER_PASSWORD")?.trim();
  if (!apikey || !password) return null;

  const form = new URLSearchParams();
  form.set("apikey", apikey);
  form.set("password", password);

  const res = await fetch("https://client.cinetpay.com/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  const token = body?.data?.token ?? body?.token;
  if (!token) {
    console.error("CinetPay transfer auth failed:", body);
    return null;
  }
  cachedTransferToken = { token, expiresAt: now + 25 * 60 * 1000 };
  return token;
}

export type TransferResult = {
  ok: boolean;
  lot?: string;
  message?: string;
  code?: number;
};

/** Send Mobile Money disbursement via CinetPay Transfer API */
export async function sendTransfer(opts: {
  phone: string;
  amountXaf: number;
  clientTransactionId: string;
  provider: string;
  notifyUrl?: string;
}): Promise<TransferResult> {
  const token = await getTransferToken();
  if (!token) return { ok: false, message: "Transfer API non configurée." };

  const { prefix, phone } = parsePhone(opts.phone);
  const amount = roundTransferAmount(opts.amountXaf);
  const paymentMethod = mapTransferMethod(opts.provider, prefix);

  const data = JSON.stringify({
    prefix,
    phone,
    amount,
    notify_url: opts.notifyUrl ?? Deno.env.get("CINETPAY_PAYOUT_NOTIFY_URL") ?? undefined,
    client_transaction_id: opts.clientTransactionId,
    payment_method: paymentMethod,
  });

  const form = new URLSearchParams();
  form.set("token", token);
  form.set("lang", "fr");
  form.set("data", data);

  const res = await fetch("https://client.cinetpay.com/v1/transfer/money/send/contact", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  const code = Number(body?.code ?? -1);
  const lot = body?.data?.[0]?.lot ?? body?.data?.lot ?? body?.lot;

  if (code === 0 || body?.message === "OPERATION_SUCCES") {
    return { ok: true, lot: lot ? String(lot) : undefined, code, message: body?.message };
  }
  return { ok: false, code, message: body?.message ?? body?.description ?? "Échec transfert CinetPay" };
}

/** Parse notify payload (form-urlencoded or JSON) */
export async function parseNotifyBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j)) out[k] = String(v ?? "");
    return out;
  }
  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}
