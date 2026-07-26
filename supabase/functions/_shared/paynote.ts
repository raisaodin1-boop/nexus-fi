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

/**
 * Exact reason text returned by MTN / Paynote (never invent it).
 * Prefers Reason / ErrorMessage from status API or nested message JSON.
 */
export function extractPaynoteReason(body: Record<string, unknown>): string {
  const nestedBits: string[] = [];
  const nestedMsg = body?.message;
  if (typeof nestedMsg === "string" && nestedMsg.trim()) {
    const raw = nestedMsg.trim();
    // Paynote often embeds a Python-ish dict with single quotes
    try {
      const normalized = raw
        .replace(/'/g, '"')
        .replace(/\bNone\b/g, "null")
        .replace(/\bTrue\b/g, "true")
        .replace(/\bFalse\b/g, "false");
      const parsed = JSON.parse(normalized) as Record<string, unknown>;
      for (const key of ["Reason", "reason", "ErrorMessage", "errorMessage", "body", "Body", "message"]) {
        const v = String(parsed?.[key] ?? "").trim();
        if (v && !/^pay request accepted$/i.test(v)) nestedBits.push(v);
      }
    } catch {
      if (!/^pay request accepted$/i.test(raw) && raw.length < 400) nestedBits.push(raw);
    }
  }

  const candidates = [
    body?.reason,
    body?.Reason,
    body?.ErrorMessage,
    body?.errorMessage,
    body?.error_description,
    body?.errorDescription,
    body?.statusMessage,
    body?.StatusMessage,
    // Avoid treating initiate "Pay Request Accepted" as a failure reason
    (typeof body?.body === "string" && !/^pay request accepted$/i.test(String(body.body))
      ? body.body
      : ""),
    ...nestedBits,
  ];
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (!s || s.length > 400) continue;
    if (/^pay request accepted$/i.test(s)) continue;
    return s;
  }
  return "";
}

export type PaynoteUserOutcome = {
  kind: "paid" | "failed" | "pending";
  operator_status: string;
  /** Exact operator / Paynote reason string (may be empty while pending) */
  reason: string;
  /** End-user message — on failure ALWAYS includes exact operator reason when present */
  user_message: string;
  user_title: string;
};

function hintForFailure(operator_status: string, reason: string): string {
  const blob = `${operator_status} ${reason}`.toLowerCase();
  if (/insufficient|solde|balance|fond|not enough|manque|low balance|no money|funds|lowbalance/.test(blob)) {
    return "Solde MTN MoMo insuffisant — rechargez puis réessayez.";
  }
  if (/timeout|expir|timed?\s*out/.test(blob) || operator_status === "EXPIRED" || operator_status === "TIMEOUT") {
    return "Délai dépassé — PIN non validé à temps.";
  }
  if (/cancel|annul|abort/.test(blob) || operator_status === "CANCELLED" || operator_status === "CANCELED") {
    return "Paiement annulé sur MTN.";
  }
  if (/reject|refus|denied|decline|pin/.test(blob) || operator_status === "REJECTED") {
    return "Paiement refusé par MTN.";
  }
  if (/subscriber|msisdn|num[eé]ro|invalid/.test(blob)) {
    return "Numéro MTN invalide ou non éligible MoMo.";
  }
  return "Le paiement MTN n’a pas abouti.";
}

/**
 * HARD RULE:
 * - paid   → only after operator status SUCCESSFUL (real debit)
 * - failed → surface the EXACT reason sent by the operator/Paynote
 * - pending → still waiting for PIN / operator (never treat as success)
 */
export function describePaynoteOutcome(body: Record<string, unknown>): PaynoteUserOutcome {
  const operator_status = extractPaynoteStatus(body) || "UNKNOWN";
  const reason = extractPaynoteReason(body);

  // Positive ONLY after confirmed operator debit
  if (isPaynotePaidStatus(body)) {
    return {
      kind: "paid",
      operator_status,
      reason: reason || "SUCCESSFUL",
      user_title: "Paiement réussi",
      user_message: "Débit MTN confirmé par l’opérateur. Votre crédit HODIX est enregistré.",
    };
  }

  // Still waiting — initiate accept (SUCCESSFULL) is NOT a debit
  if (
    !isPaynoteFailedStatus(body)
    && (
      operator_status === "PENDING"
      || operator_status === "INITIATED"
      || operator_status === "SUCCESSFULL"
      || !operator_status
      || operator_status === "UNKNOWN"
    )
  ) {
    return {
      kind: "pending",
      operator_status: operator_status || "PENDING",
      reason,
      user_title: "En attente de l’opérateur",
      user_message:
        "Paynote attend le débit MTN. Validez le PIN sur votre téléphone — HODIX ne crédite qu’après réponse positive de l’opérateur.",
    };
  }

  // Negative — always expose exact operator reason
  const hint = hintForFailure(operator_status, reason);
  const exact = reason
    ? `Raison opérateur : ${reason}`
    : `Statut opérateur : ${operator_status}`;
  const user_message =
    `${hint} ${exact}. Aucun crédit n’a été enregistré sur HODIX.`;

  return {
    kind: "failed",
    operator_status,
    reason,
    user_title: "Paiement échoué",
    user_message,
  };
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
