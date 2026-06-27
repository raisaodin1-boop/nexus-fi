import { z } from "zod";
import type { PaymentKind } from "@/src/payment-nav";

const paymentKindSchema = z.enum([
  "tontine_contribution",
  "savings_deposit",
  "association_contribution",
  "cooperative_contribution",
  "fund_contribution",
  "wallet_topup",
  "certified_report",
  "manager_pro_subscription",
]);

export const paymentMetaSchema = z.object({
  kind: paymentKindSchema,
  amount_xaf: z.number().finite().positive(),
  label: z.string().optional(),
  tontine_id: z.string().nullable().optional(),
  goal_id: z.string().nullable().optional(),
  association_id: z.string().nullable().optional(),
  cooperative_id: z.string().nullable().optional(),
  fund_id: z.string().nullable().optional(),
  provider: z.string().optional(),
  phone: z.string().optional(),
  cinetpay_transaction_id: z.string().nullable().optional(),
  cert_kind: z.enum(["identity", "trust-score", "savings"]).optional(),
});

export type ValidatedPaymentMeta = z.infer<typeof paymentMetaSchema> & { kind: PaymentKind };

export function parsePaymentMetaSafe(raw: unknown): ValidatedPaymentMeta | null {
  const result = paymentMetaSchema.safeParse(raw);
  return result.success ? (result.data as ValidatedPaymentMeta) : null;
}
