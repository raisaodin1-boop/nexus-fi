/**
 * Unified live payment status labels for HODIX MoMo / Paynote.
 * Display-only — does not invent success without DB/operator confirmation.
 */

export type PaymentDisplayStatus =
  | "pending_pin"
  | "debited"
  | "failed"
  | "expired"
  | "other";

export type PaymentStatusView = {
  key: PaymentDisplayStatus;
  label: string;
  short: string;
  colorKey: "warning" | "success" | "danger" | "muted";
  hint: string;
};

function parseFailureMeta(description?: string | null): {
  operator_status?: string;
  operator_reason?: string;
  reason?: string;
  user_message?: string;
} | null {
  if (!description) return null;
  try {
    const raw = description.split(" · ref:")[0]?.trim() ?? description;
    const meta = JSON.parse(raw) as { paynote_failure?: Record<string, string> };
    return meta.paynote_failure ?? null;
  } catch {
    return null;
  }
}

function isExpiredOperator(status?: string | null, reason?: string | null): boolean {
  const blob = `${status ?? ""} ${reason ?? ""}`.toUpperCase();
  return /\bEXPIRED\b|\bTIMEOUT\b|EXPIR|DÉLAI|DELAI/.test(blob);
}

/** Map DB + optional operator fields → clear UI status. */
export function resolvePaymentDisplayStatus(opts: {
  status: string;
  description?: string | null;
  created_at?: string | null;
  operator_status?: string | null;
  operator_reason?: string | null;
  /** Soft UI expiry for orphan pending rows (ms). Default 30 min. */
  pendingTtlMs?: number;
}): PaymentStatusView {
  const failure = parseFailureMeta(opts.description);
  const opStatus = opts.operator_status ?? failure?.operator_status ?? null;
  const opReason = opts.operator_reason ?? failure?.operator_reason ?? failure?.reason ?? null;
  const userMsg = failure?.user_message;

  if (opts.status === "succeeded") {
    return {
      key: "debited",
      label: "Débité",
      short: "Débité",
      colorKey: "success",
      hint: "MTN a débité votre compte. Crédit HODIX enregistré.",
    };
  }

  if (opts.status === "failed") {
    if (isExpiredOperator(opStatus, opReason)) {
      return {
        key: "expired",
        label: "Expiré",
        short: "Expiré",
        colorKey: "danger",
        hint: userMsg
          ?? (opReason
            ? `Raison opérateur : ${opReason}`
            : "Délai dépassé — PIN non validé à temps. Aucun crédit HODIX."),
      };
    }
    return {
      key: "failed",
      label: "Échoué",
      short: "Échoué",
      colorKey: "danger",
      hint: userMsg
        ?? (opReason
          ? `Raison opérateur : ${opReason}`
          : "Le paiement MTN a échoué. Aucun crédit HODIX."),
    };
  }

  if (opts.status === "pending_paynote" || opts.status === "pending_cinetpay" || opts.status === "pending") {
    const ttl = opts.pendingTtlMs ?? 30 * 60 * 1000;
    const created = opts.created_at ? new Date(opts.created_at).getTime() : NaN;
    const stale = Number.isFinite(created) && Date.now() - created > ttl;
    if (stale) {
      return {
        key: "expired",
        label: "Expiré",
        short: "Expiré",
        colorKey: "danger",
        hint: "Délai dépassé sans confirmation opérateur. Vous pouvez relancer un paiement — aucun double débit sans validation PIN.",
      };
    }
    return {
      key: "pending_pin",
      label: "En attente PIN",
      short: "En attente PIN",
      colorKey: "warning",
      hint: "Validez le PIN sur votre téléphone MTN. HODIX crédite uniquement après débit opérateur.",
    };
  }

  return {
    key: "other",
    label: opts.status || "—",
    short: opts.status || "—",
    colorKey: "muted",
    hint: "Statut de paiement",
  };
}

export function buildTontinePayPath(opts: {
  tontineId: string;
  amount: number;
  label?: string;
}): string {
  const params = new URLSearchParams({
    kind: "tontine_contribution",
    tontine_id: opts.tontineId,
    amount: String(Math.round(opts.amount)),
  });
  if (opts.label?.trim()) params.set("label", opts.label.trim());
  return `/pay?${params.toString()}`;
}

export function buildTontinePayAbsoluteUrl(opts: {
  tontineId: string;
  amount: number;
  label?: string;
  origin?: string;
}): string {
  const origin = (opts.origin ?? "https://www.hodix.app").replace(/\/$/, "");
  return `${origin}${buildTontinePayPath(opts)}`;
}
