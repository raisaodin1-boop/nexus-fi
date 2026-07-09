import type { Router } from "expo-router";

export type PaymentKind =
  | "tontine_contribution"
  | "savings_deposit"
  | "association_contribution"
  | "cooperative_contribution"
  | "fund_contribution"
  | "wallet_topup"
  | "certified_report"
  | "manager_pro_subscription";

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
      ...(params.provider ? { provider: params.provider } : {}),
      ...(params.phone ? { phone: params.phone } : {}),
    },
  } as any);
}

export function paymentReturnRoute(params: PaymentNavParams): string {
  if (params.kind === "wallet_topup") return "/wallet";
  if (params.kind === "certified_report") return "/(tabs)/identity";
  if (params.kind === "manager_pro_subscription") return "/(tabs)";
  if (params.goal_id) return `/savings/${params.goal_id}`;
  if (params.tontine_id) return `/tontines/${params.tontine_id}`;
  if (params.association_id) return `/associations/${params.association_id}`;
  if (params.cooperative_id) return `/cooperatives/${params.cooperative_id}`;
  if (params.fund_id) return `/funds/${params.fund_id}`;
  return "/(tabs)/groups";
}
