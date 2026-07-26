import type { Router } from "expo-router";

export type PaymentKind =
  | "tontine_contribution"
  | "savings_deposit"
  | "association_contribution"
  | "cooperative_contribution"
  | "fund_contribution"
  | "wallet_topup"
  | "certified_report"
  | "manager_pro_subscription"
  | "subscription"
  | "diaspora_sponsor"
  | "auction_premium"
  | "verified_badge";

export interface PaymentNavParams {
  amount: number;
  label?: string;
  kind?: PaymentKind;
  cert_kind?: "identity" | "trust-score" | "savings";
  tontine_id?: string;
  goal_id?: string;
  association_id?: string;
  cooperative_id?: string;
  fund_id?: string;
  plan_id?: string;
  diaspora_request_id?: string;
  provider?: "mtn" | "orange" | "moov";
  phone?: string;
}

/** Navigate to the unified electronic payment screen. */
export function openPaymentScreen(router: Router, params: PaymentNavParams) {
  if (!params.amount || params.amount <= 0) return;
  router.push({
    pathname: "/pay",
    params: {
      amount: String(params.amount),
      ...(params.label ? { label: params.label } : {}),
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.cert_kind ? { cert_kind: params.cert_kind } : {}),
      ...(params.tontine_id ? { tontine_id: params.tontine_id } : {}),
      ...(params.goal_id ? { goal_id: params.goal_id } : {}),
      ...(params.association_id ? { association_id: params.association_id } : {}),
      ...(params.cooperative_id ? { cooperative_id: params.cooperative_id } : {}),
      ...(params.fund_id ? { fund_id: params.fund_id } : {}),
      ...(params.plan_id ? { plan_id: params.plan_id } : {}),
      ...(params.diaspora_request_id ? { diaspora_request_id: params.diaspora_request_id } : {}),
      ...(params.provider ? { provider: params.provider } : {}),
      ...(params.phone ? { phone: params.phone } : {}),
    },
  } as any);
}
