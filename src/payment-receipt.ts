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
    case "diaspora_sponsor": return "Cotisation proche (diaspora)";
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

/** WhatsApp / PDF-ready payment proof (amount, group label, operator ref). */
export function buildPaymentProofHtml(receipt: PaymentReceipt): string {
  const title = receipt.label || paymentKindLabel(receipt.kind);
  const method = receipt.payment_method ?? receipt.method ?? "MTN Mobile Money";
  const ref = receipt.reference ?? receipt.id;
  const hdx = receipt.receipt_id || buildReceiptId(receipt.id);
  const amount = Number(receipt.amount_xaf).toLocaleString("fr-FR");
  const when = formatReceiptDateTime(receipt.created_at);
  const status = receipt.status === "succeeded" ? "Débité / Confirmé" : receipt.status;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Preuve HODIX ${hdx}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; margin: 0; padding: 32px; color: #0f172a; background: #fff; }
    .card { border: 2px solid #0B1F3A; border-radius: 12px; padding: 28px; max-width: 520px; margin: 0 auto; }
    .brand { font-size: 28px; font-weight: 800; letter-spacing: 2px; color: #0B1F3A; }
    .sub { color: #64748b; font-size: 12px; margin-top: 4px; }
    .amt { font-size: 36px; font-weight: 800; margin: 20px 0 8px; color: #0B1F3A; }
    .label { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid #e2e8f0; font-size: 13px; }
    .k { color: #64748b; } .v { font-weight: 700; text-align: right; }
    .ok { margin-top: 18px; background: #ecfdf5; color: #047857; padding: 10px 12px; border-radius: 8px; font-weight: 700; font-size: 13px; }
    .foot { margin-top: 18px; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">HODIX</div>
    <div class="sub">Preuve de paiement — partageable</div>
    <div class="amt">${amount} XAF</div>
    <div class="label">${escapeHtml(title)}</div>
    <div class="row"><span class="k">Statut</span><span class="v">${escapeHtml(status)}</span></div>
    <div class="row"><span class="k">Méthode</span><span class="v">${escapeHtml(method)}</span></div>
    <div class="row"><span class="k">Date</span><span class="v">${escapeHtml(when)}</span></div>
    <div class="row"><span class="k">Réf HODIX</span><span class="v">${escapeHtml(hdx)}</span></div>
    <div class="row"><span class="k">Réf opérateur</span><span class="v">${escapeHtml(String(ref))}</span></div>
    <div class="ok">Paiement confirmé après débit opérateur (MTN / Paynote).</div>
    <div class="foot">www.hodix.app · Conservez cette preuve pour votre groupe</div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPaymentProofShareText(receipt: PaymentReceipt): string {
  const title = receipt.label || paymentKindLabel(receipt.kind);
  const method = receipt.payment_method ?? receipt.method ?? "MTN Mobile Money";
  const ref = receipt.reference ?? receipt.id;
  const hdx = receipt.receipt_id || buildReceiptId(receipt.id);
  return [
    "— PREUVE DE PAIEMENT HODIX —",
    `Montant : ${Number(receipt.amount_xaf).toLocaleString("fr-FR")} XAF`,
    `Groupe / objet : ${title}`,
    `Méthode : ${method}`,
    `Date : ${formatReceiptDateTime(receipt.created_at)}`,
    `Réf HODIX : ${hdx}`,
    `Réf opérateur : ${ref}`,
    "Statut : Débité / Confirmé",
    "www.hodix.app",
  ].join("\n");
}
