import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Trophy, Medal, ArrowLeft } from "lucide-react-native";
import { api, formatXAF } from "@/src/api";
import { Card } from "@/src/ui";
import { Colors, Spacing, Radius, Shadow } from "@/src/theme";
import { COUNTRY_FLAGS } from "@/src/payment-methods";

interface LeaderboardEntry {
  rank: number;
  display_name: string;
  country: string;
  total: number;
}

function Podium({ top3 }: { top3: LeaderboardEntry[] }) {
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  const heights = [80, 110, 60];
  const barColors = ["#C0C0C0", "#FFD700", "#CD7F32"];

  return (
    <View style={styles.podiumContainer}>
      {order.map((entry, idx) => {
        const isCenter = idx === 1;
        return (
          <View key={entry.rank} style={styles.podiumColumn}>
            <View style={styles.podiumNameBox}>
              {isCenter && <Text style={styles.crownEmoji}>👑</Text>}
              <Text style={styles.podiumName} numberOfLines={1}>{entry.display_name}</Text>
              <Text style={styles.podiumTotal}>{formatXAF(entry.total)}</Text>
              <Text style={styles.podiumFlag}>{COUNTRY_FLAGS[entry.country] ?? "🌍"}</Text>
            </View>
            <View style={[styles.podiumBar, { height: heights[idx], backgroundColor: barColors[idx] }]}>
              <Text style={styles.podiumRank}>#{entry.rank}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function TontineLeaderboard() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.get<LeaderboardEntry[]>(`/tontines/${id}/leaderboard`);
      setEntries(data ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const top3 = entries.filter((e) => e.rank <= 3);
  const rest = entries.filter((e) => e.rank > 3);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={Colors.primary} size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Classement</Text>
          <Text style={styles.headerSub}>Top épargnants</Text>
        </View>
        <Trophy color={Colors.accent} size={22} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <Medal color={Colors.textSubtle} size={48} />
          <Text style={styles.emptyText}>Aucun classement disponible</Text>
          <Text style={styles.emptySubtext}>Les épargnants apparaîtront ici</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {/* Podium */}
          {top3.length > 0 && (
            <View style={styles.podiumSection}>
              <Podium top3={top3} />
            </View>
          )}

          {/* Ranks 4–10 */}
          {rest.length > 0 && (
            <View style={{ paddingHorizontal: Spacing.xl, gap: 8, marginTop: Spacing.lg }}>
              {rest.map((entry) => (
                <Card key={entry.rank} style={styles.listRow}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{entry.rank}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listName}>{entry.display_name}</Text>
                    <Text style={styles.listCountry}>
                      {COUNTRY_FLAGS[entry.country] ?? "🌍"} {entry.country}
                    </Text>
                  </View>
                  <Text style={styles.listTotal}>{formatXAF(entry.total)}</Text>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: Colors.primary, fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
  headerSub: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 1 },

  podiumSection: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xxl, paddingBottom: Spacing.lg, backgroundColor: Colors.surface, marginBottom: 4 },
  podiumContainer: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 8 },
  podiumColumn: { flex: 1, alignItems: "center" },
  podiumNameBox: { alignItems: "center", marginBottom: 6, paddingHorizontal: 4 },
  crownEmoji: { fontSize: 22, marginBottom: 2 },
  podiumName: { color: Colors.text, fontWeight: "800", fontSize: 12, textAlign: "center" },
  podiumTotal: { color: Colors.accent, fontWeight: "700", fontSize: 11, marginTop: 2, textAlign: "center" },
  podiumFlag: { fontSize: 16, marginTop: 2 },
  podiumBar: { width: "100%", borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: "center", justifyContent: "center" },
  podiumRank: { color: "#fff", fontWeight: "900", fontSize: 18 },

  listRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  rankBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  rankText: { color: Colors.textMuted, fontWeight: "800", fontSize: 13 },
  listName: { color: Colors.text, fontWeight: "700", fontSize: 14 },
  listCountry: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  listTotal: { color: Colors.accent, fontWeight: "900", fontSize: 15 },
  emptyText: { color: Colors.textMuted, fontSize: 16, fontWeight: "700" },
  emptySubtext: { color: Colors.textSubtle, fontSize: 13 },
});
