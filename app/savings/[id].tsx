import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Lock, TrendingUp } from "lucide-react-native";
import { api, formatXAF } from "@/src/api";
import { openPaymentScreen } from "@/src/payment-nav";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Spacing } from "@/src/theme";

const TYPE_LABELS: Record<string, string> = {
  flexible: "Flexible",
  locked: "Bloqué",
  recurring: "Récurrent",
};

export default function SavingsDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<any>(`/savings/${id}`);
      setData(d);
    } catch {}
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}><ActivityIndicator color={Colors.secondary} /></View>
      </SafeAreaView>
    );
  }

  const goal = data.savings_goal ?? data.goal ?? data;
  const savingsType = goal.savings_type ?? goal.type;
  const isLocked = savingsType === "locked";
  const deadline = goal.deadline ? new Date(goal.deadline) : null;
  const beforeDeadline = deadline ? new Date() < deadline : false;
  const hasGuardian = !!goal.lock_guardian_id;

  const progress = goal.target_amount > 0
    ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100))
    : 0;

  const goToPayment = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Montant invalide"); return; }
    setError(null);
    openPaymentScreen(router, {
      kind: "savings_deposit",
      goal_id: id,
      amount: amt,
      label: goal.name,
    });
  };

  const doWithdraw = async (early: boolean) => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) { setError("Montant invalide"); return; }
    setWithdrawing(true);
    setError(null);
    try {
      const res = await api.post<any>(`/savings/goals/${id}/transactions`, {
        amount: amt,
        kind: "withdraw",
        early,
      });
      const penalty = res?.penalty_xaf ?? 0;
      Alert.alert(
        "Retrait effectué",
        penalty > 0
          ? `Pénalité discipline : ${formatXAF(penalty)} retenus sur votre retrait.`
          : "Votre retrait a été enregistré.",
      );
      setWithdrawAmount("");
      await load();
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? "Retrait impossible");
    } finally {
      setWithdrawing(false);
    }
  };

  const handleWithdraw = () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) { setError("Montant invalide"); return; }
    if (isLocked && beforeDeadline) {
      if (hasGuardian) {
        Alert.alert(
          "Compte verrouillé",
          "Votre tuteur d'épargne doit approuver le déblocage. Contactez-le sur HODIX.",
        );
        return;
      }
      Alert.alert(
        "Retrait anticipé",
        `Une pénalité de 5 % (min. 500 XAF) s'appliquera avant la date du ${deadline?.toLocaleDateString("fr-FR")}. Continuer ?`,
        [
          { text: "Annuler", style: "cancel" },
          { text: "Retirer avec pénalité", style: "destructive", onPress: () => doWithdraw(true) },
        ],
      );
      return;
    }
    doWithdraw(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} testID="savings-detail-back">
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{goal.name}</Text>
        {(goal.savings_type || goal.type) ? (
          <View style={styles.typePill}>
            <Text style={styles.typePillText}>{TYPE_LABELS[goal.savings_type ?? goal.type] ?? (goal.savings_type ?? goal.type)}</Text>
          </View>
        ) : null}

        {isLocked && beforeDeadline && (
          <View style={styles.lockBanner}>
            <Lock size={16} color="#92400E" />
            <Text style={styles.lockBannerText}>
              Verrouillé jusqu'au {deadline?.toLocaleDateString("fr-FR")}.
              {hasGuardian ? " Tuteur requis pour débloquer." : " Retrait anticipé : pénalité 5 %."}
            </Text>
          </View>
        )}

        <Card style={{ marginTop: 16, gap: 14 }}>
          <View style={styles.row}>
            <Text style={styles.label}>Épargne actuelle</Text>
            <Text style={styles.value}>{formatXAF(goal.current_amount ?? 0)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Objectif</Text>
            <Text style={styles.value}>{formatXAF(goal.target_amount ?? 0)}</Text>
          </View>
          <View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
            </View>
            <Text style={styles.progressText}>{progress}% atteint</Text>
          </View>
        </Card>

        {/* ── Analytics CTA ── */}
        <TouchableOpacity onPress={() => router.push(`/savings/analytics?id=${id}` as any)} activeOpacity={0.85} style={{ marginHorizontal: 0, marginBottom: 0 }}>
          <LinearGradient colors={["#0B1F3A", "#1D4ED8"]} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginHorizontal: 0, borderRadius: 14, marginBottom: 12 }}>
            <TrendingUp size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Analyse IA de l'objectif</Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 1 }}>Prédiction · Patterns · Comparaison membres</Text>
            </View>
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "300" }}>›</Text>
          </LinearGradient>
        </TouchableOpacity>

        {(goal.current_amount ?? 0) > 0 && (
          <>
            <Text style={styles.section}>Retirer des fonds</Text>
            <Card>
              <Field
                testID="savings-withdraw-amount"
                label="Montant (XAF)"
                placeholder="5000"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="number-pad"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                testID="savings-withdraw-submit"
                label={isLocked && beforeDeadline ? "Demander un retrait" : "Retirer"}
                onPress={handleWithdraw}
                loading={withdrawing}
                variant="secondary"
                disabled={!withdrawAmount}
              />
            </Card>
          </>
        )}

        <Text style={styles.section}>Déposer des fonds</Text>
        <Card>
          <Field
            testID="savings-deposit-amount"
            label="Montant (XAF)"
            placeholder="5000"
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            testID="savings-deposit-submit"
            label="Déposer — paiement électronique"
            onPress={goToPayment}
            disabled={!amount}
          />
          <Text style={{ color: Colors.textSubtle, fontSize: 11, textAlign: "center", marginTop: 8 }}>
            MTN Mobile Money via Paynote — crédit uniquement après validation sur votre téléphone
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.xl, paddingBottom: 60 },
  back: { color: Colors.textMuted, fontWeight: "600", marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "900", color: Colors.primary, letterSpacing: -0.5 },
  typePill: {
    alignSelf: "flex-start", marginTop: 8,
    backgroundColor: Colors.primaryLight, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  typePillText: { color: Colors.primaryDark, fontWeight: "700", fontSize: 12 },
  lockBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 12,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  lockBannerText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 18, fontWeight: "600" },
  section: { fontSize: 14, fontWeight: "800", color: Colors.text, marginTop: 24, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 13, color: Colors.textMuted, fontWeight: "600" },
  value: { fontSize: 15, color: Colors.text, fontWeight: "800" },
  progressBar: { height: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 4, overflow: "hidden", marginTop: 4 },
  progressFill: { height: "100%", backgroundColor: Colors.primary, borderRadius: 4 },
  progressText: { fontSize: 12, color: Colors.textMuted, fontWeight: "600", marginTop: 4, textAlign: "right" },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: "600", marginBottom: 12 },
});
