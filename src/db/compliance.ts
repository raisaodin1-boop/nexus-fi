import { getSupabase } from "@/src/supabase";
import { requireAdmin, throwSb } from "./helpers";

export async function adminListComplianceAudit(limit = 100, category?: string) {
  await requireAdmin();
  let q = getSupabase()
    .from("compliance_audit_log")
    .select("id, created_at, user_id, actor_id, event_category, event_type, entity_type, entity_id, amount_xaf, metadata")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (category) q = q.eq("event_category", category);
  const { data, error } = await q;
  throwSb(error);
  return data ?? [];
}

export async function adminListFraudAlerts(status = "open", limit = 50) {
  await requireAdmin();
  const { data, error } = await getSupabase()
    .from("fraud_alerts")
    .select("id, created_at, user_id, severity, alert_type, amount_xaf, flags, status, metadata")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);
  throwSb(error);
  return data ?? [];
}

export async function adminReviewFraudAlert(alertId: string, status: "reviewed" | "dismissed" | "confirmed") {
  await requireAdmin();
  const { error } = await getSupabase()
    .from("fraud_alerts")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", alertId);
  throwSb(error);
  return { ok: true };
}
