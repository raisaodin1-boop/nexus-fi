import { useCallback, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { api, ApiError, formatXAF } from "@/src/api";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Spacing } from "@/src/theme";

export default function FundDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
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

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={Colors.secondary} /></View>
      </SafeAreaView>
    );
  }

  const fund = data.fund ?? data;

  const contribute = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Montant invalide"); return; }
    setError(null); setBusy(true);
    try {
      await api.post(`/funds/${id}/contribute`, { amount: amt });
      setAmount("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally { setBusy(false); }
  };

  const progress = fund.target_amount > 0
    ? Math.min(100, Math.round((fund.current_balance / fund.target_amount) * 100))
    : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} testID="fund-detail-back">
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{fund.name}</Text>
        {fund.description ? <Text style={styles.desc}>{fund.description}</Text> : null}

        <Card style={{ marginTop: 16, gap: 12 }}>
          <View style={styles.row}>
            <Text style={styles.label}>Solde actuel</Text>
            <Text style={styles.value}>{formatXAF(fund.current_balance ?? 0)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Objectif</Text>
            <Text style={styles.value}>{formatXAF(fund.target_amount ?? 0)}</Text>
          </View>
          <View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
            </View>
            <Text style={styles.progressText}>{progress}% atteint</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Membres</Text>
            <Text style={styles.value}>{fund.members_count ?? 0}</Text>
          </View>
        </Card>

        <Text style={styles.section}>Contribuer</Text>
        <Card>
          <Field
            label="Montant (XAF)"
            placeholder="10000"
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            testID="fund-contribute-submit"
            label="Contribuer"
            onPress={contribute}
            loading={busy}
            disabled={!amount}
          />
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
  desc: { fontSize: 14, color: Colors.textMuted, marginTop: 6, lineHeight: 20 },
  section: { fontSize: 14, fontWeight: "800", color: Colors.text, marginTop: 24, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 13, color: Colors.textMuted, fontWeight: "600" },
  value: { fontSize: 15, color: Colors.text, fontWeight: "800" },
  progressBar: { height: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 4, overflow: "hidden", marginTop: 4 },
  progressFill: { height: "100%", backgroundColor: Colors.primary, borderRadius: 4 },
  progressText: { fontSize: 12, color: Colors.textMuted, fontWeight: "600", marginTop: 4, textAlign: "right" },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: "600", marginBottom: 12 },
});
