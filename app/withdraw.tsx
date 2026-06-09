// HODIX — Demande de retrait
import { useState } from "react";
import {
  Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AlertTriangle, ArrowDownCircle, CheckCircle2 } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

type Method = "orange" | "mtn" | "bank";

const METHODS: { key: Method; label: string; icon: string; color: string }[] = [
  { key: "orange", label: "Orange Money", icon: "🟠", color: "#FF6900" },
  { key: "mtn",    label: "MTN Money",    icon: "🟡", color: "#FFCC00" },
  { key: "bank",   label: "Virement bancaire", icon: "🏦", color: Colors.secondary },
];

interface WithdrawalResult {
  withdrawal_id: string;
  amount_xaf: number;
  commission_xaf: number;
  net_xaf: number;
  message: string;
}

export default function WithdrawScreen() {
  const router = useRouter();
  const { goal_id, amount: preAmount } = useLocalSearchParams<{ goal_id?: string; amount?: string }>();
  const [method, setMethod] = useState<Method>("orange");
  const [amount, setAmount] = useState(preAmount ?? "");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WithdrawalResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const amt = parseFloat(amount) || 0;
  const commission = amt * 0.015;
  const net = amt - commission;

  const requestConfirm = () => {
    if (amt < 500) { setError("Montant minimum : 500 XAF"); return; }
    if (method !== "bank" && !phone) { setError("Numéro de téléphone requis"); return; }
    setError(null);
    setShowConfirm(true);
  };

  const submit = async () => {
    setShowConfirm(false);
    setBusy(true);
    try {
      const r = await api.post<WithdrawalResult>("/payments/withdrawal/request", {
        amount_xaf: amt,
        method,
        phone,
        reason,
        ...(goal_id ? { goal_id } : {}),
      });
      if (goal_id) {
        await api.post(`/savings/goals/${goal_id}/transactions`, { amount: amt, kind: "withdraw" }).catch(() => null);
      }
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally { setBusy(false); }
  };

  if (result) {
    // Navigate to receipt screen
    router.replace({
      pathname: "/payments/receipt",
      params: { paymentId: result.withdrawal_id, type: "withdrawal" },
    } as any);
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Confirmation modal */}
      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <AlertTriangle color={Colors.gold} size={32} style={{ marginBottom: 8 }} />
            <Text style={styles.modalTitle}>Confirmer le retrait</Text>
            <View style={styles.modalRows}>
              <ModalRow label="Montant demandé" value={formatXAF(amt)} />
              <ModalRow label={`Commission Hodix (1,5%)`} value={`- ${formatXAF(commission)}`} danger />
              <ModalRow label="Vous recevrez" value={formatXAF(net)} accent />
              <ModalRow label="Via" value={METHODS.find(m => m.key === method)?.label ?? method} />
              {phone ? <ModalRow label="Téléphone" value={phone} /> : null}
            </View>
            <Text style={styles.modalWarning}>Ce montant sera déduit de votre épargne. Cette action est irréversible.</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowConfirm(false)}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={submit}>
                <Text style={styles.modalConfirmText}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>

        <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={[styles.hero, Shadow.cardDark]}>
          <ArrowDownCircle color="#fff" size={28} />
          <Text style={styles.heroTitle}>Retirer de l'argent</Text>
          <Text style={styles.heroSub}>Frais de retrait Hodix : 1,5% · Traitement 24-48h</Text>
        </LinearGradient>

        <Text style={styles.sectionTitle}>Méthode de retrait</Text>
        <View style={styles.methodRow}>
          {METHODS.map((m) => (
            <TouchableOpacity
              key={m.key}
              onPress={() => setMethod(m.key)}
              style={[styles.methodBtn, method === m.key && { borderColor: m.color, backgroundColor: m.color + "15" }]}
              testID={`withdraw-method-${m.key}`}
            >
              <Text style={{ fontSize: 20 }}>{m.icon}</Text>
              <Text style={[styles.methodLabel, method === m.key && { color: m.color }]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Card style={{ gap: 4, marginTop: 8 }}>
          <Field
            label="Montant à retirer (XAF)"
            placeholder="Ex: 50 000"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            testID="withdraw-amount"
          />
          {amt >= 500 && (
            <View style={styles.feeBox}>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Commission (1,5%)</Text>
                <Text style={styles.feeValue}>- {formatXAF(commission)}</Text>
              </View>
              <View style={[styles.feeRow, { marginTop: 4 }]}>
                <Text style={[styles.feeLabel, { color: Colors.accent, fontWeight: "800" }]}>Vous recevrez</Text>
                <Text style={[styles.feeValue, { color: Colors.accent, fontSize: 16 }]}>{formatXAF(net)}</Text>
              </View>
            </View>
          )}

          {method !== "bank" && (
            <Field
              label={`Numéro ${method === "orange" ? "Orange Money" : "MTN Money"}`}
              placeholder="6X XX XX XX XX"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              testID="withdraw-phone"
            />
          )}

          <Field
            label="Motif (optionnel)"
            placeholder="Ex: Dépenses personnelles"
            value={reason}
            onChangeText={setReason}
            testID="withdraw-reason"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            testID="withdraw-submit"
            label={`Retirer ${amt >= 500 ? formatXAF(amt) : ""}`}
            loading={busy}
            onPress={requestConfirm}
            disabled={amt < 500}
            icon={<ArrowDownCircle color="#fff" size={16} />}
          />
        </Card>

        <Card style={{ marginTop: 12, gap: 4 }}>
          <Text style={styles.infoTitle}>ℹ️ Informations sur les retraits</Text>
          <Text style={styles.infoItem}>• Minimum de retrait : 500 XAF</Text>
          <Text style={styles.infoItem}>• Frais de retrait Hodix : 1,5% du montant retiré</Text>
          <Text style={styles.infoItem}>• Les dépôts et cotisations ne sont jamais prélevés</Text>
          <Text style={styles.infoItem}>• Délai de traitement : 24 à 48h ouvrées</Text>
          <Text style={styles.infoItem}>• Votre demande sera validée par l'équipe Hodix</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function ModalRow({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
      <Text style={{ color: Colors.textMuted, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: danger ? Colors.danger : accent ? Colors.accent : Colors.text, fontSize: 13, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: Colors.textMuted, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: accent ? Colors.accent : Colors.text, fontSize: 13, fontWeight: "900" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  back: { color: Colors.textMuted, fontWeight: "600", marginBottom: 16 },
  hero: { borderRadius: Radius.xxl, padding: 24, gap: 8, marginBottom: 24, alignItems: "center" },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: "600" },
  sectionTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", marginBottom: 10 },
  methodRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  methodBtn: {
    flex: 1, alignItems: "center", gap: 6, padding: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 2, borderColor: Colors.border,
  },
  methodLabel: { color: Colors.text, fontSize: 11, fontWeight: "800", textAlign: "center" },
  feeBox: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 12, marginVertical: 8,
  },
  feeRow: { flexDirection: "row", justifyContent: "space-between" },
  feeLabel: { color: Colors.textMuted, fontSize: 13, fontWeight: "600" },
  feeValue: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalBox: { backgroundColor: Colors.surface, borderRadius: Radius.xxl, padding: 24, width: "100%", maxWidth: 400, alignItems: "center" },
  modalTitle: { color: Colors.text, fontSize: 18, fontWeight: "900", marginBottom: 16 },
  modalRows: { width: "100%", borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, marginBottom: 12 },
  modalWarning: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", textAlign: "center", marginBottom: 16, lineHeight: 18 },
  modalBtns: { flexDirection: "row", gap: 12, width: "100%" },
  modalCancel: { flex: 1, paddingVertical: 13, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, alignItems: "center" },
  modalCancelText: { color: Colors.textMuted, fontWeight: "700", fontSize: 14 },
  modalConfirm: { flex: 1, paddingVertical: 13, borderRadius: Radius.lg, backgroundColor: Colors.danger, alignItems: "center" },
  modalConfirmText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  infoTitle: { color: Colors.text, fontSize: 13, fontWeight: "800", marginBottom: 6 },
  infoItem: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", lineHeight: 20 },
  successHero: { padding: 48, alignItems: "center", gap: 10 },
  successTitle: { color: "#fff", fontSize: 26, fontWeight: "900" },
  successAmt: { color: "#fff", fontSize: 36, fontWeight: "900", letterSpacing: -1 },
  successSub: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" },
  message: { color: Colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: "center" },
});
