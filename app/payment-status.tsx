/**
 * Live payment status — En attente PIN / Débité / Échoué / Expiré
 * Safe read-only polling; never invents success.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, CheckCircle2, Clock, XCircle, AlertTriangle } from "lucide-react-native";
import { TouchableOpacity } from "react-native";

import { api, formatXAF } from "@/src/api";
import { resolvePaymentDisplayStatus } from "@/src/payment-status";
import { Button, Card } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";

type StatusPayload = {
  id: string;
  status: string;
  amount: number;
  currency?: string;
  description?: string | null;
  created_at: string;
  user_message?: string | null;
  operator_status?: string | null;
  operator_reason?: string | null;
};

function StatusIcon({ keyName }: { keyName: string }) {
  if (keyName === "debited") return <CheckCircle2 color={Colors.success} size={56} />;
  if (keyName === "pending_pin") return <Clock color={Colors.warning} size={56} />;
  if (keyName === "expired") return <AlertTriangle color={Colors.danger} size={56} />;
  return <XCircle color={Colors.danger} size={56} />;
}

export default function PaymentStatusScreen() {
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const [row, setRow] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const doneRef = useRef(false);

  const load = useCallback(async () => {
    if (!paymentId) {
      setError("Paiement introuvable");
      setLoading(false);
      return;
    }
    try {
      const st = await api.get<StatusPayload>(`/payments/${paymentId}/status`);
      setRow(st);
      setError(null);
      if (st.status === "succeeded" || st.status === "failed") doneRef.current = true;
    } catch {
      setError("Impossible de charger le statut");
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!paymentId || doneRef.current) return;
    const id = setInterval(() => {
      if (!doneRef.current) load();
    }, 2000);
    return () => clearInterval(id);
  }, [paymentId, load]);

  const view = row
    ? resolvePaymentDisplayStatus({
      status: row.status,
      description: row.description,
      created_at: row.created_at,
      operator_status: row.operator_status,
      operator_reason: row.operator_reason,
    })
    : null;

  const color = view?.colorKey === "success"
    ? Colors.success
    : view?.colorKey === "warning"
      ? Colors.warning
      : view?.colorKey === "danger"
        ? Colors.danger
        : Colors.textMuted;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="payment-status-back">
          <ArrowLeft color="#fff" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Statut du paiement</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <View style={styles.body}>
        {loading && !row ? (
          <ActivityIndicator color={Colors.secondary} size="large" />
        ) : error && !row ? (
          <Text style={styles.error}>{error}</Text>
        ) : row && view ? (
          <Card style={{ gap: 14, alignItems: "center", padding: 20 }}>
            <StatusIcon keyName={view.key} />
            <Text style={[styles.statusLabel, { color }]}>{view.label}</Text>
            <Text style={styles.amount}>{formatXAF(Number(row.amount), row.currency ?? "XAF")}</Text>
            <Text style={styles.hint}>{row.user_message || view.hint}</Text>

            {row.operator_reason ? (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonLabel}>Raison opérateur</Text>
                <Text style={styles.reasonText}>{row.operator_reason}</Text>
              </View>
            ) : null}

            {view.key === "pending_pin" ? (
              <Text style={styles.pollHint}>Mise à jour automatique…</Text>
            ) : null}

            <View style={{ width: "100%", gap: 10, marginTop: 8 }}>
              {view.key === "debited" ? (
                <Button
                  label="Voir le reçu"
                  onPress={() => router.replace({ pathname: "/receipt", params: { paymentId: row.id } } as any)}
                  testID="payment-status-receipt"
                />
              ) : null}
              {(view.key === "failed" || view.key === "expired") ? (
                <Button
                  label="Retour à l’historique"
                  onPress={() => router.replace("/payments" as any)}
                  testID="payment-status-history"
                />
              ) : null}
              {view.key === "pending_pin" ? (
                <Button
                  label="J’ai validé mon PIN — vérifier"
                  variant="secondary"
                  onPress={async () => {
                    try {
                      await api.post("/payments/paynote/confirm", { payment_id: row.id });
                    } catch { /* still pending */ }
                    load();
                  }}
                  testID="payment-status-confirm"
                />
              ) : null}
            </View>
          </Card>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  body: { flex: 1, padding: Spacing.xl, justifyContent: "center" },
  statusLabel: { fontSize: 26, fontWeight: "900", textAlign: "center" },
  amount: { fontSize: 32, fontWeight: "900", color: Colors.text },
  hint: { color: Colors.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center", lineHeight: 21 },
  pollHint: { color: Colors.warning, fontSize: 12, fontWeight: "700" },
  error: { color: Colors.danger, fontWeight: "700", textAlign: "center" },
  reasonBox: {
    width: "100%", borderWidth: 1, borderColor: Colors.danger + "44", backgroundColor: "#FEF2F2",
    borderRadius: Radius.lg, padding: 12, gap: 4,
  },
  reasonLabel: { color: Colors.danger, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  reasonText: { color: Colors.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
});
