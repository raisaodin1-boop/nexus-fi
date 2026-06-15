import type { PaymentKind } from "@/src/payment-nav";
import type { PaymentMeta } from "@/src/db/payments";

export interface PaymentReceipt {
  id: string;
  payment_id: string;
  receipt_id: string;
  amount_xaf: number;
  method?: string;
  payment_method?: string;
  type?: string;
  status: string;
  reference?: string;
  commission_xaf?: number;
  created_at: string;
  label?: string;
  kind?: string;
  email_sent?: boolean;
}

export function buildReceiptId(id: string): string {
  const clean = id.replace(/-/g, "").toUpperCase().slice(0, 8).padEnd(8, "0");
  return `HDX-${clean}`;
}

export function extractTransactionRef(description: string | null): string | null {
  const match = description?.match(/· ref:(.+)$/);
  return match?.[1]?.trim() ?? null;
}

export function providerLabel(provider?: string | null): string {
  switch ((provider ?? "").toLowerCase()) {
    case "orange": return "Orange Money";
    case "mtn": return "MTN Mobile Money";
    case "moov": return "Moov Money";
    case "card": return "Carte bancaire";
    default: return provider ?? "CinetPay";
  }
}

export function paymentKindLabel(kind?: PaymentKind | string | null): string {
  switch (kind) {
    case "tontine_contribution": return "Cotisation tontine";
    case "savings_deposit": return "Dépôt épargne";
    case "association_contribution": return "Cotisation association";
    case "cooperative_contribution": return "Cotisation coopérative";
    case "fund_contribution": return "Contribution fonds";
    case "wallet_topup": return "Recharge wallet";
    case "certified_report": return "Certificat authentifié";
    default: return "Paiement";
  }
}

export function paymentKindToReceiptType(kind?: PaymentKind | string | null): string {
  switch (kind) {
    case "tontine_contribution":
    case "association_contribution":
    case "cooperative_contribution":
    case "fund_contribution":
      return "contribution";
    case "wallet_topup":
    case "savings_deposit":
      return "deposit";
    default:
      return "payment";
  }
}

export function paymentToReceipt(
  payment: {
    id: string;
    amount: number | string;
    status: string;
    description?: string | null;
    created_at: string;
    receipt_email_sent_at?: string | null;
  },
  meta: PaymentMeta | null,
): PaymentReceipt {
  const ref = extractTransactionRef(payment.description ?? null);
  return {
    id: payment.id,
    payment_id: payment.id,
    receipt_id: buildReceiptId(payment.id),
    amount_xaf: Number(payment.amount),
    method: providerLabel(meta?.provider),
    payment_method: providerLabel(meta?.provider),
    type: paymentKindToReceiptType(meta?.kind),
    status: payment.status === "succeeded" ? "succeeded" : payment.status,
    reference: ref ?? payment.id,
    commission_xaf: 0,
    created_at: payment.created_at,
    label: meta?.label ?? paymentKindLabel(meta?.kind),
    kind: meta?.kind,
    email_sent: !!payment.receipt_email_sent_at,
  };
}

export function formatReceiptDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day} à ${time}`;
}
