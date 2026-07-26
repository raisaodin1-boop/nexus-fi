import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { api } from "@/src/api";
import type { DiasporaRequest } from "@/src/db/diaspora";
import { Colors, Radius, Spacing } from "@/src/theme";
import { DiasporaStatusBadge } from "@/src/diaspora-ui";
import { useDiasporaGuard, DiasporaGuardSpinner } from "@/src/use-diaspora-guard";
import { useAuth } from "@/src/auth-context";
import { DiasporaAmount } from "@/src/diaspora-amount";
import type { Currency } from "@/src/exchange-rates";
import { DiasporaPanel, DiasporaScreenShell } from "@/src/diaspora-shell";

const FILTERS = [
  { key: "all", label: "Toutes" },
  { key: "pending_payment", label: "À payer" },
  { key: "under_review", label: "En vérif." },
  { key: "validated", label: "Validées" },
  { key: "rejected", label: "Rejetées" },
];

export default function DiasporaContributionsScreen() {
  const router = useRouter();
  const { checking } = useDiasporaGuard();
  const { user } = useAuth();
  const displayCur = (user?.diaspora_currency ?? "EUR") as Currency;
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
      <DiasporaScreenShell variant="app" title="Mes cotisations" scroll={false} contentStyle={styles.center}>
        <DiasporaGuardSpinner checking={checking} />
      </DiasporaScreenShell>
    );
  }

  return (
    <DiasporaScreenShell
      variant="app"
      title="Mes cotisations"
      subtitle="Suivi, paiements et preuves"
      scroll={false}
      contentStyle={styles.body}
    >
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: 10, paddingBottom: 48 }}
        ListEmptyComponent={<Text style={styles.empty}>Aucune cotisation pour ce filtre.</Text>}
        renderItem={({ item }) => (
          <DiasporaPanel style={styles.itemPanel}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.tontine_name ?? "Tontine"}</Text>
                <DiasporaAmount amountXaf={item.amount_expected} currency={displayCur} size="md" />
                <Text style={styles.meta}>{item.reference_code}</Text>
                {item.due_date ? (
                  <Text style={styles.meta}>
                    Échéance {new Date(item.due_date).toLocaleDateString("fr-FR")}
                  </Text>
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
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => router.push(`/diaspora/proof/${item.id}` as any)}
                >
                  <Text style={[styles.btnText, { color: "#fff" }]}>
                    {item.status === "proof_submitted" ? "Continuer la preuve" : "Joindre une preuve"}
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
          </DiasporaPanel>
        )}
      />
    </DiasporaScreenShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, paddingHorizontal: 0, gap: 0 },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: Spacing.lg,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.md,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  chipActive: { backgroundColor: "#fff", borderColor: "#fff" },
  chipText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.7)" },
  chipTextActive: { color: Colors.brandNavy },
  empty: { textAlign: "center", color: "rgba(255,255,255,0.55)", marginTop: 40, fontWeight: "600" },
  itemPanel: { gap: 4 },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  name: { fontSize: 15, fontWeight: "800", color: Colors.text },
  meta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  btnText: { fontSize: 12, fontWeight: "800", color: Colors.primary },
  reject: { fontSize: 12, color: Colors.danger, marginTop: 8 },
});
