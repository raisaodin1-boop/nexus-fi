/**
 * Fraud alert pipeline — Sentry + Supabase fraud_alerts + compliance audit.
 */
import { getSupabase } from "@/src/supabase";
import { captureError, captureMessage, setObservabilityTag } from "@/src/observability";

export type FraudAlertInput = {
  userId: string;
  alertType: string;
  severity?: "low" | "medium" | "high" | "critical";
  amountXaf?: number;
  flags?: string[];
  metadata?: Record<string, unknown>;
};

export async function emitFraudAlert(input: FraudAlertInput): Promise<void> {
  const severity = input.severity ?? "medium";
  const flags = input.flags ?? [];

  setObservabilityTag("fraud_alert", input.alertType);
  captureMessage(`[FRAUD] ${input.alertType} user=${input.userId.slice(0, 8)} flags=${flags.join(",")}`, "warning");
  captureError(new Error(`Fraud alert: ${input.alertType}`), {
    userId: input.userId,
    severity,
    flags,
    amountXaf: input.amountXaf,
    ...input.metadata,
  });

  try {
    await getSupabase().rpc("create_fraud_alert", {
      p_user_id: input.userId,
      p_alert_type: input.alertType,
      p_severity: severity,
      p_amount_xaf: input.amountXaf ?? null,
      p_flags: flags,
      p_metadata: input.metadata ?? {},
    });
  } catch (e) {
    captureError(e, { context: "create_fraud_alert_rpc_failed" });
  }
}
