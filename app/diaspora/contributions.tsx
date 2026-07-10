import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import type { DiasporaRequest } from "@/src/db/diaspora";
import { Card } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { DiasporaStatusBadge } from "@/src/diaspora-ui";
import { useDiasporaGuard, DiasporaGuardSpinner } from "@/src/use-diaspora-guard";

const FILTERS = [
  { key: "all", label: "Toutes" },
  { key: "pending_payment", label: "À payer" },
  { key: "under_review", label: "En vérification" },
  { key: "validated", label: "Validées" },
  { key: "rejected", label: "Rejetées" },
];

export default function DiasporaContributionsScreen() {
  const router = useRouter();
  const { checking } = useDiasporaGuard();
  const [items, setItems] = useState<DiasporaRequest[]>([]);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const qs = filter !== "all" ? `?status=${filter}` : "";
      const data = await api.get<DiasporaRequest[]>(`/diaspora/contributions${qs}`);
      setItems(data);
    } catch {
      setItems([]);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { if (!checking) load(); }, [load, checking]));

  if (checking) {
    return (
      <SafeAreaView style={styles.safe}>
        <DiasporaGuardSpinner checking={checking} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft color={Colors.text} size={22} /></TouchableOpacity>
        <Text style={styles.title}>Mes cotisations</Text>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.key} style={[styles.chip, filter === f.key && styles.chipActive]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: Spacing.lg, gap: 10, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>Aucune cotisation pour ce filtre.</Text>}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.tontine_name ?? "Tontine"}</Text>
                <Text style={styles.amount}>{formatXAF(item.amount_expected)}</Text>
                <Text style={styles.meta}>{item.reference_code}</Text>
                {item.due_date ? (
                  <Text style={styles.meta}>Échéance {new Date(item.due_date).toLocaleDateString("fr-FR")}</Text>
                ) : null}
              </View>
              <DiasporaStatusBadge status={item.status} />
            </View>
            <View style={styles.btnRow}>
              {item.status === "validated" ? (
                <TouchableOpacity style={styles.btn} onPress={() => router.push(`/diaspora/receipt/${item.id}` as any)}>
                  <Text style={styles.btnText}>Voir le reçu</Text>
                </TouchableOpacity>
              ) : null}
              {["rejected", "needs_info", "pending_payment", "proof_submitted"].includes(item.status) ? (
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => router.push(`/diaspora/proof/${item.id}` as any)}>
                  <Text style={[styles.btnText, { color: "#fff" }]}>
                    {item.status === "proof_submitted" ? "Continuer la preuve" : "Nouvelle preuve"}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {item.status === "pending_payment" ? (
                <TouchableOpacity style={styles.btn} onPress={() => router.push(`/diaspora/pay/${item.id}` as any)}>
                  <Text style={styles.btnText}>Payer</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {item.rejection_reason ? (
              <Text style={styles.reject}>Motif : {item.rejection_reason}</Text>
            ) : null}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, padding: Spacing.lg },
  title: { fontSize: 20, fontWeight: "900", color: Colors.text },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: Spacing.lg, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.surfaceAlt },
  chipActive: { backgroundColor: Colors.primaryLight },
  chipText: { fontSize: 12, fontWeight: "700", color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  empty: { textAlign: "center", color: Colors.textMuted, marginTop: 40 },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  name: { fontSize: 15, fontWeight: "800", color: Colors.text },
  amount: { fontSize: 18, fontWeight: "900", color: Colors.primary, marginTop: 2 },
  meta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  btnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  btnText: { fontSize: 12, fontWeight: "800", color: Colors.primary },
  reject: { fontSize: 12, color: Colors.danger, marginTop: 8 },
});
