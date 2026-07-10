/**
 * HODIX Subscriptions — Plans Premium & Abonnements
 * Free | Basic (1 500 XAF) | Pro (5 000 XAF) | Elite (15 000 XAF)
 */
import { getSupabase } from "@/src/supabase";
import { uid } from "@/src/db/helpers";

export type PlanId = "free" | "basic" | "pro" | "elite";

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  price_xaf: number;
  max_tontines: number | null; // null = illimité
  features: {
    support: "community" | "email" | "priority";
    analytics: boolean;
    free_certificates: boolean;
    advanced_autosavings: boolean;
    badge: string | null;
    color: string;
    popular?: boolean;
  };
  sort_order: number;
}

export interface UserSubscription {
  plan_id: PlanId;
  plan_name: string;
  price_xaf: number;
  max_tontines: number | null;
  features: SubscriptionPlan["features"];
  status: "active" | "cancelled" | "expired" | "pending";
  expires_at: string | null;
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export async function getActivePlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await getSupabase()
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw { status: 500, detail: error.message };
  return (data ?? []) as SubscriptionPlan[];
}

export async function getMyPlan(): Promise<UserSubscription> {
  const { data, error } = await getSupabase().rpc("get_my_plan");
  if (error || !data?.length) {
    // Fallback plan free
    return {
      plan_id: "free", plan_name: "Gratuit", price_xaf: 0, max_tontines: 1,
      features: { support: "community", analytics: false, free_certificates: false, advanced_autosavings: false, badge: null, color: "#64748B" },
      status: "active", expires_at: null,
    };
  }
  const row = data[0];
  return {
    plan_id: row.plan_id as PlanId,
    plan_name: row.plan_name,
    price_xaf: row.price_xaf,
    max_tontines: row.max_tontines,
    features: row.features,
    status: row.status,
    expires_at: row.expires_at,
  };
}

// ─── Limites ──────────────────────────────────────────────────────────────────

export async function checkTontineCreationAllowed(): Promise<void> {
  const plan = await getMyPlan();
  if (plan.max_tontines === null) return; // illimité

  const { data, error } = await getSupabase().rpc("count_my_tontines");
  if (error) return; // fail-open

  const count = data as number ?? 0;
  if (count >= plan.max_tontines) {
    const upgrade = plan.plan_id === "free"
      ? "Passez au plan Basic (1 500 XAF/mois) pour créer jusqu'à 3 tontines."
      : plan.plan_id === "basic"
      ? "Passez au plan Pro (5 000 XAF/mois) pour créer des tontines illimitées."
      : "Limite atteinte.";
    throw {
      status: 403,
      detail: `Limite de tontines atteinte (${count}/${plan.max_tontines}). ${upgrade}`,
      upgrade_required: true,
      current_plan: plan.plan_id,
    };
  }
}

export async function hasFeature(feature: keyof SubscriptionPlan["features"]): Promise<boolean> {
  try {
    const plan = await getMyPlan();
    return !!plan.features[feature];
  } catch {
    return false;
  }
}

// ─── Souscription ─────────────────────────────────────────────────────────────

export async function subscribeToPlan(planId: PlanId, paymentId: string): Promise<void> {
  const me = await uid();
  const sb = getSupabase();

  const plan = (await getActivePlans()).find((p) => p.id === planId);
  if (!plan) throw { status: 404, detail: "Plan introuvable." };

  // Require a real succeeded payment owned by the user (no free client activation).
  const { data: pay, error: payErr } = await sb
    .from("payments")
    .select("id, status, amount, user_id, description")
    .eq("id", paymentId)
    .eq("user_id", me)
    .maybeSingle();
  if (payErr) throw { status: 500, detail: payErr.message };
  if (!pay || pay.status !== "succeeded") {
    throw { status: 402, detail: "Paiement non confirmé — abonnement impossible." };
  }
  if (Number(pay.amount) < plan.price_xaf) {
    throw { status: 400, detail: "Montant de paiement insuffisant pour ce plan." };
  }

  await sb.from("subscription_payments").insert({
    user_id: me, plan_id: planId,
    amount_xaf: plan.price_xaf,
    payment_id: paymentId,
    status: "succeeded",
  });

  const expires = new Date();
  expires.setDate(expires.getDate() + 30);

  const { error } = await sb.from("user_subscriptions").upsert({
    user_id: me,
    plan_id: planId,
    status: "active",
    started_at: new Date().toISOString(),
    expires_at: expires.toISOString(),
    payment_id: paymentId,
    auto_renew: true,
  }, { onConflict: "user_id" });

  if (error) throw { status: 500, detail: error.message };
}

export async function cancelSubscription(): Promise<void> {
  const me = await uid();
  const { error } = await getSupabase()
    .from("user_subscriptions")
    .update({ status: "cancelled", auto_renew: false })
    .eq("user_id", me);
  if (error) throw { status: 500, detail: error.message };
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

export const PLAN_PERKS: Record<PlanId, string[]> = {
  free: [
    "1 tontine créée",
    "Épargne personnelle",
    "Trust Score",
    "Support communauté",
  ],
  basic: [
    "3 tontines créées",
    "Épargne personnelle illimitée",
    "Trust Score",
    "Support email",
    "Tout Gratuit inclus",
  ],
  pro: [
    "Tontines illimitées",
    "Analytics avancées",
    "Support prioritaire 24h",
    "Tableau de bord manager",
    "Tout Basic inclus",
  ],
  elite: [
    "Tontines illimitées",
    "Certificats officiels gratuits",
    "Auto-épargne avancée",
    "Analytics & rapports PDF",
    "Support VIP dédié",
    "Tout Pro inclus",
  ],
};

export function planLabel(planId: PlanId): string {
  return { free: "Gratuit", basic: "Basic", pro: "Pro", elite: "Elite" }[planId];
}
