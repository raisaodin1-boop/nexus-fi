import type { WalletTx } from "@/src/wallet-db";

export interface TxMeta {
  emoji: string;
  categoryLabel: string;
  categoryColor: string;
  sign: "+" | "-" | "";
}

export function getTxMeta(tx: Pick<WalletTx, "type">): TxMeta {
  switch (tx.type) {
    case "topup":
      return { emoji: "💳", categoryLabel: "Rechargement", categoryColor: "#10B981", sign: "+" };
    case "transfer_in":
      return { emoji: "💸", categoryLabel: "Virement reçu", categoryColor: "#10B981", sign: "+" };
    case "transfer_out":
      return { emoji: "🤝", categoryLabel: "Virement envoyé", categoryColor: "#EF4444", sign: "-" };
    case "withdraw":
      return { emoji: "🏧", categoryLabel: "Retrait Mobile", categoryColor: "#EF4444", sign: "-" };
    case "contribution":
      return { emoji: "🤝", categoryLabel: "Cotisation tontine", categoryColor: "#F59E0B", sign: "-" };
    case "deposit":
      return { emoji: "💰", categoryLabel: "Épargne", categoryColor: "#3B82F6", sign: "-" };
    case "bonus":
      return { emoji: "🏆", categoryLabel: "Bonus / Récompense", categoryColor: "#8B5CF6", sign: "+" };
    default:
      return { emoji: "💱", categoryLabel: tx.type, categoryColor: "#94A3B8", sign: "" };
  }
}

export function txStatusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case "completed":
    case "succeeded":
      return { label: "Confirmé", color: "#10B981" };
    case "pending":
      return { label: "En attente", color: "#F59E0B" };
    case "processing":
      return { label: "En cours", color: "#3B82F6" };
    case "failed":
    case "rejected":
      return { label: "Échoué", color: "#EF4444" };
    default:
      return { label: status, color: "#94A3B8" };
  }
}
