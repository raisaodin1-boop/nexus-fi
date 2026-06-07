import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { CreditCard, ArrowUpRight, ArrowDownLeft } from "lucide-react-native";
import { Colors, Spacing } from "@/src/theme";
import { Card, EmptyState } from "@/src/ui";
import { api, formatXAF } from "@/src/api";

interface Payment {
  id: string;
  amount: number;
  direction: "in" | "out";
  description: string;
  created_at: string;
}

export default function PaymentsScreen() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api.get<any>("/payments/history");
      setPayments(Array.isArray(d) ? d : (d.payments ?? d.results ?? []));
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} testID="payments-back" style={{ marginBottom: 12 }}>
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <CreditCard color={Colors.primary} size={24} />
          <Text style={styles.title}>Historique des paiements</Text>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.secondary} /></View>
        ) : payments.length === 0 ? (
          <EmptyState
            title="Aucun paiement"
            description="Vos transactions apparaîtront ici."
            icon={<CreditCard color={Colors.textSubtle} size={36} />}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {payments.map((p) => (
              <Card key={p.id} testID={`payment-item-${p.id}`} style={styles.paymentRow}>
                <View style={[styles.dirIcon, { backgroundColor: p.direction === "in" ? Colors.successLight : Colors.dangerLight }]}>
                  {p.direction === "in"
                    ? <ArrowDownLeft color={Colors.success} size={18} />
                    : <ArrowUpRight color={Colors.danger} size={18} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payDesc}>{p.description}</Text>
                  <Text style={styles.payDate}>
                    {new Date(p.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <Text style={[styles.payAmt, { color: p.direction === "in" ? Colors.success : Colors.danger }]}>
                  {p.direction === "in" ? "+" : "-"}{formatXAF(p.amount)}
                </Text>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.xl, paddingBottom: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  back: { color: Colors.textMuted, fontWeight: "600" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "900", color: Colors.primary, letterSpacing: -0.5 },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  dirIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  payDesc: { fontSize: 14, fontWeight: "700", color: Colors.text },
  payDate: { fontSize: 11, color: Colors.textMuted, fontWeight: "500", marginTop: 2 },
  payAmt: { fontSize: 15, fontWeight: "800" },
});
