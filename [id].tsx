// Community fund detail
import { useCallback, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Plus, Minus, ArrowUpCircle, ArrowDownCircle } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

interface Fund { id: string; name: string; description?: string | null; current_balance: number; total_collected: number; total_withdrawn: number; target_amount?: number | null; currency: string; }
interface Tx { id: string; amount: number; kind: string; created_at: string }

export default function FundDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ fund: Fund; transactions: Tx[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<any>(`/funds/${id}`);
      setData(d);
    } catch {}
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const action = async (kind: "contribution" | "withdrawal") => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Montant invalide"); return; }
    setError(null); setBusy(true);
    try {
      await api.post(`/funds/${id}/transactions`, { amount: amt, kind });
      setAmount("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally { setBusy(false); }
  };

  if (loading || !data) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={Colors.secondary} /></View></SafeAreaView>;
  }
  const f = data.fund;
  const pct = f.target_amount ? Math.min(100, (f.current_balance / f.target_amount) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} testID="fund-back"><Text style={styles.back}>← Retour</Text></TouchableOpacity>

          <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={[styles.hero, Shadow.cardDark]}>
            <Text style={styles.heroName}>{f.name}</Text>
            <Text style={styles.heroBalance}>{formatXAF(f.current_balance, f.currency)}</Text>
            <Text style={styles.heroSub}>Solde courant</Text>
            {f.target_amount ? (
              <>
                <View style={styles.bar}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
                <Text style={styles.pct}>{Math.round(pct)}% de {formatXAF(f.target_amount, f.currency)}</Text>
              </>
            ) : null}
            <View style={styles.stats}>
              <View><Text style={styles.statLbl}>Total collecté</Text><Text style={styles.statVal}>{formatXAF(f.total_collected, f.currency)}</Text></View>
              <View><Text style={styles.statLbl}>Retraits</Text><Text style={styles.statVal}>{formatXAF(f.total_withdrawn, f.currency)}</Text></View>
            </View>
          </LinearGradient>

          <Text style={styles.section}>Transaction</Text>
          <Card>
            <Field testID="fund-amount" label="Montant (XAF)" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="10000" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button testID="fund-contribute" label="Contribuer" variant="accent" loading={busy} onPress={() => action("contribution")} icon={<Plus color="#fff" size={16} />} />
              </View>
              <View style={{ flex: 1 }}>
                <Button testID="fund-withdraw" label="Retirer" variant="secondary" loading={busy} onPress={() => action("withdrawal")} icon={<Minus color={Colors.primary} size={16} />} />
              </View>
            </View>
          </Card>

          <Text style={styles.section}>Historique</Text>
          {data.transactions.length === 0 ? (
            <Card><Text style={styles.empty}>Aucune transaction.</Text></Card>
          ) : (
            <View style={{ gap: 8 }}>
              {data.transactions.map((t) => (
                <Card key={t.id} style={styles.txCard}>
                  <View style={[styles.txIcon, { backgroundColor: t.kind === "contribution" ? Colors.accent + "20" : Colors.danger + "20" }]}>
                    {t.kind === "contribution" ? <ArrowDownCircle color={Colors.accent} size={18} /> : <ArrowUpCircle color={Colors.danger} size={18} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txLabel}>{t.kind === "contribution" ? "Contribution" : "Retrait"}</Text>
                    <Text style={styles.txDate}>{new Date(t.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: t.kind === "contribution" ? Colors.accentDark : Colors.danger }]}>
                    {t.kind === "contribution" ? "+" : "-"}{formatXAF(t.amount, f.currency)}
                  </Text>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: { color: Colors.textMuted, fontWeight: "600", marginBottom: 12 },
  hero: { borderRadius: Radius.xxl, padding: 22, overflow: "hidden" },
  heroName: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  heroBalance: { color: "#fff", fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 6 },
  heroSub: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "600", letterSpacing: 0.5, marginTop: 4 },
  bar: { marginTop: 14, height: 6, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 3 },
  pct: { color: Colors.accent, fontSize: 11, fontWeight: "800", marginTop: 6, letterSpacing: 0.5 },
  stats: { flexDirection: "row", gap: 24, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  statLbl: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "600", letterSpacing: 0.3 },
  statVal: { color: "#fff", fontSize: 14, fontWeight: "800", marginTop: 2 },
  section: { color: Colors.text, fontSize: 14, fontWeight: "800", marginTop: 24, marginBottom: 10, letterSpacing: -0.3 },
  empty: { color: Colors.textMuted, textAlign: "center", padding: 20, fontSize: 13 },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: "600", marginBottom: 12 },
  txCard: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  txIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  txLabel: { color: Colors.text, fontWeight: "800", fontSize: 14 },
  txDate: { color: Colors.textMuted, fontSize: 11, marginTop: 2, fontWeight: "500" },
  txAmount: { fontWeight: "800", fontSize: 14 },
});
