import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft } from "lucide-react-native";

import { api } from "@/src/api";
import { Button } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { formatAmount } from "@/src/exchange-rates";
import type { WalletTx } from "@/src/wallet-db";
import { getTxMeta, txStatusLabel } from "@/src/wallet-tx-meta";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function WalletTxDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tx, setTx] = useState<WalletTx | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) { setError("Transaction introuvable"); setLoading(false); return; }
    setLoading(true);
    try {
      const row = await api.get<WalletTx>(`/wallet/transactions/${id}`);
      setTx(row);
      setError(null);
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? "Transaction introuvable");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const meta = tx ? getTxMeta(tx) : null;
  const st = tx ? txStatusLabel(tx.status) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <LinearGradient colors={["#0B1F3A", "#1D4ED8"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ChevronLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détail transaction</Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.secondary} size="large" />
        </View>
      ) : error || !tx || !meta || !st ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? "Transaction introuvable"}</Text>
          <Button label="Retour au wallet" onPress={() => router.replace("/wallet")} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.hero, { backgroundColor: meta.categoryColor + "18" }]}>
            <Text style={{ fontSize: 40 }}>{meta.emoji}</Text>
            <Text style={styles.heroLabel}>{meta.categoryLabel}</Text>
            <Text style={[styles.heroAmount, { color: meta.categoryColor }]}>
              {meta.sign}{formatAmount(tx.amount, tx.currency as any)}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: st.color + "22" }]}>
              <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <DetailRow label="Date" value={new Date(tx.created_at).toLocaleString("fr-FR")} />
            {tx.reference ? <DetailRow label="Référence" value={tx.reference} /> : null}
            {tx.counterpart_name ? <DetailRow label="Contrepartie" value={tx.counterpart_name} /> : null}
            {tx.mobile_money_provider ? <DetailRow label="Opérateur" value={tx.mobile_money_provider} /> : null}
            {tx.mobile_money_number ? <DetailRow label="Téléphone" value={tx.mobile_money_number} /> : null}
            {tx.note ? <DetailRow label="Note" value={tx.note} /> : null}
            <DetailRow label="Montant XAF" value={formatAmount(tx.amount_xaf, "XAF")} />
            {tx.balance_after != null ? (
              <DetailRow label="Solde après" value={formatAmount(tx.balance_after, tx.currency as any)} />
            ) : null}
          </View>

          <View style={{ gap: 10 }}>
            {tx.tontine_id && tx.type === "contribution" ? (
              <Button
                label="Voir la tontine"
                onPress={() => router.push(`/tontines/${tx.tontine_id}` as any)}
              />
            ) : null}
            <Button label="Retour au wallet" variant="secondary" onPress={() => router.replace("/wallet")} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: Spacing.xl, paddingBottom: 20 },
  back: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xxxl, gap: 16 },
  errorText: { fontSize: 14, color: Colors.danger, textAlign: "center" },
  body: { padding: Spacing.xl, gap: 16, paddingBottom: 40 },
  hero: { borderRadius: Radius.xxl, padding: Spacing.xl, alignItems: "center", gap: 8 },
  heroLabel: { fontSize: 14, fontWeight: "700", color: Colors.textMuted },
  heroAmount: { fontSize: 32, fontWeight: "900" },
  statusPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, marginTop: 4 },
  statusText: { fontSize: 12, fontWeight: "800" },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { fontSize: 13, color: Colors.textMuted, flex: 1 },
  rowValue: { fontSize: 13, fontWeight: "700", color: Colors.text, flex: 1.2, textAlign: "right" },
});
