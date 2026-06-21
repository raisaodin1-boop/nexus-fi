import { getSupabase } from "@/src/supabase";
import { requireAdmin, throwSb, uid } from "./helpers";

export async function adminComplianceStats() {
  await requireAdmin();
  const sb = getSupabase();
  const since24h = new Date(Date.now() - 86400000).toISOString();
  const [openRes, criticalRes, auditRes] = await Promise.all([
    sb.from("fraud_alerts").select("id", { count: "exact", head: true }).eq("status", "open"),
    sb.from("fraud_alerts").select("id", { count: "exact", head: true }).eq("status", "open").eq("severity", "critical"),
    sb.from("compliance_audit_log").select("id", { count: "exact", head: true }).gte("created_at", since24h),
  ]);
  throwSb(openRes.error ?? criticalRes.error ?? auditRes.error);
  return {
    open_fraud_alerts: openRes.count ?? 0,
    critical_fraud_alerts: criticalRes.count ?? 0,
    audit_24h: auditRes.count ?? 0,
  };
}

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
  const me = await uid();
  const { error } = await getSupabase()
    .from("fraud_alerts")
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: me })
    .eq("id", alertId);
  throwSb(error);

  const { data: alert } = await getSupabase()
    .from("fraud_alerts")
    .select("user_id, alert_type, amount_xaf, severity")
    .eq("id", alertId)
    .maybeSingle();

  if (alert) {
    await getSupabase().rpc("log_compliance_event", {
      p_user_id: alert.user_id,
      p_category: "fraud",
      p_event_type: `fraud_alert_${status}`,
      p_entity_type: "fraud_alert",
      p_entity_id: alertId,
      p_amount_xaf: alert.amount_xaf,
      p_metadata: { alert_type: alert.alert_type, severity: alert.severity, reviewed_status: status },
      p_actor_id: me,
    });
  }

  return { ok: true };
}
