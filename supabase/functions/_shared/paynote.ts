/**
 * Paynote / Y-Note MTN MoMo — shared verification helpers.
 *
 * Docs nuance (critical):
 * - Initiate / webhook often return ErrorCode 200 + status "SUCCESSFULL"
 *   (= "Pay Request Accepted" — USSD queued, NOT debited).
 * - Status API returns status "SUCCESSFUL" only when the operator has
 *   completed the debit after customer PIN approval.
 *
 * Never treat ErrorCode 200 or SUCCESSFULL as paid.
 */

export const PAYNOTE_TOKEN_URL = "https://omapi-token.ynote.africa/oauth2/token";
export const PAYNOTE_WEBPAY_URL = "https://omapi.ynote.africa/prod/webpayment";
export const PAYNOTE_STATUS_URL = "https://omapi.ynote.africa/prod/webpaymentmtn/status";

/** Final statuses that mean money was collected by MTN. */
const PAID_STATUSES = new Set(["SUCCESSFUL", "SUCCESS"]);

/** Explicitly NOT paid (includes Paynote's "request accepted" typo). */
const NOT_PAID_STATUSES = new Set([
  "SUCCESSFULL", // initiate/webhook: Pay Request Accepted
  "PENDING",
  "INITIATED",
  "FAILED",
  "EXPIRED",
  "TIMEOUT",
  "CANCELLED",
  "CANCELED",
  "REJECTED",
]);

export function normalizePaynoteStatus(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/**
 * Extract transaction status from a Paynote status-API (or webhook) body.
 * Only top-level status fields — never scan `message` / nested accept text.
 */
export function extractPaynoteStatus(body: Record<string, unknown>): string {
  const nestedData = body?.data as Record<string, unknown> | undefined;
  const nestedParams = body?.parameters as Record<string, unknown> | undefined;
  const candidates = [
    body?.status,
    body?.Status,
    body?.paymentStatus,
    body?.PaymentStatus,
    nestedData?.status,
    nestedData?.Status,
    nestedParams?.status,
    nestedParams?.Status,
  ];
  for (const c of candidates) {
    const s = normalizePaynoteStatus(c);
    if (s) return s;
  }
  return "";
}

/** True only when Paynote status API reports a completed operator debit. */
export function isPaynotePaidStatus(body: Record<string, unknown>): boolean {
  const status = extractPaynoteStatus(body);
  if (!status) return false;
  if (NOT_PAID_STATUSES.has(status)) return false;
  return PAID_STATUSES.has(status);
}

export function isPaynoteFailedStatus(body: Record<string, unknown>): boolean {
  const status = extractPaynoteStatus(body);
  return status === "FAILED"
    || status === "EXPIRED"
    || status === "TIMEOUT"
    || status === "CANCELLED"
    || status === "CANCELED"
    || status === "REJECTED";
}

export function extractMessageId(body: Record<string, unknown>): string {
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

export function paynoteConfigured(): boolean {
  return !!(
    Deno.env.get("PAYNOTE_CLIENT_ID")?.trim()
    && Deno.env.get("PAYNOTE_CLIENT_SECRET")?.trim()
    && Deno.env.get("PAYNOTE_CUSTOMER_KEY")?.trim()
    && Deno.env.get("PAYNOTE_CUSTOMER_SECRET")?.trim()
  );
}

export async function getPaynoteAccessToken(): Promise<string> {
  const clientId = Deno.env.get("PAYNOTE_CLIENT_ID")!.trim();
  const clientSecret = Deno.env.get("PAYNOTE_CLIENT_SECRET")!.trim();
  const basic = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(PAYNOTE_TOKEN_URL, {
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

export async function checkPaynotePaymentStatus(token: string, messageId: string) {
  const customerkey = Deno.env.get("PAYNOTE_CUSTOMER_KEY")!.trim();
  const customersecret = Deno.env.get("PAYNOTE_CUSTOMER_SECRET")!.trim();

  const res = await fetch(PAYNOTE_STATUS_URL, {
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
    body = { raw: text };
  }
  return { ok: res.ok, body, httpStatus: res.status };
}
