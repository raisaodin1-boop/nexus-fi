import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, CreditCard } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { Card, EmptyState, SkeletonCard } from "@/src/ui";
import { Colors, Spacing } from "@/src/theme";

interface Payment {
  id: string; type: string; amount: number; currency: string;
  description: string; status: string; created_at: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PaymentsScreen() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    api.get<Payment[]>("/payments/history")
      .then(setPayments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historique des paiements</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {loading ? (
        <View style={{ padding: Spacing.xl, gap: 12 }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: Spacing.xl, gap: 10, paddingBottom: 40 }}
          renderItem={({ item: p }) => {
            const isIn = p.type === "credit" || p.type === "deposit";
            return (
              <Card style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.iconBox, { backgroundColor: isIn ? `${Colors.accent}20` : `${Colors.danger}20` }]}>
                  {isIn
                    ? <ArrowDownLeft color={Colors.accent} size={20} />
                    : <ArrowUpRight color={Colors.danger} size={20} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.desc}>{p.description}</Text>
                  <Text style={styles.date}>{formatDate(p.created_at)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.amount, { color: isIn ? Colors.accent : Colors.danger }]}>
                    {isIn ? "+" : "-"}{formatXAF(p.amount, p.currency)}
                  </Text>
                  <Text style={styles.status}>{p.status}</Text>
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <Card style={{ marginTop: 20 }}>
              <EmptyState
                title="Aucun paiement"
                description="Vos transactions apparaîtront ici."
                icon={<CreditCard color={Colors.textMuted} size={40} />}
              />
            </Card>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  iconBox: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  desc: { fontSize: 14, fontWeight: "700", color: Colors.text },
  date: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "900" },
  status: { fontSize: 11, color: Colors.textMuted, fontWeight: "600", marginTop: 2 },
});
