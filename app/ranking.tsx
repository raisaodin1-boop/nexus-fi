import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Trophy } from "lucide-react-native";
import { api } from "@/src/api";
import { Card } from "@/src/ui";
import { Colors, Spacing, Radius, Shadow } from "@/src/theme";

interface RankEntry {
  rank: number;
  display_name: string;
  score: number;
  is_me: boolean;
}

interface RegionalRanking {
  ranking: RankEntry[];
  my_rank: number;
  total_users: number;
  is_pillar: boolean;
}

function ScoreBar({ score }: { score: number }) {
  const maxScore = 1000;
  const pct = Math.min(score / maxScore, 1);
  // Interpolate color: green (score=0) → gold (score=1000)
  const r = Math.round(16 + (245 - 16) * pct);
  const g = Math.round(185 - (185 - 200) * pct);
  const b = Math.round(129 - 129 * pct);
  const color = `rgb(${r},${g},${b})`;
  return (
    <View style={styles.scoreBarBg}>
      <View style={[styles.scoreBarFill, { width: `${Math.max(pct * 100, 4)}%`, backgroundColor: color }]} />
    </View>
  );
}

function rankBadgeColor(rank: number): string {
  if (rank === 1) return "#FFD700";
  if (rank === 2) return "#C0C0C0";
  if (rank === 3) return "#CD7F32";
  return Colors.surfaceAlt;
}

function rankTextColor(rank: number): string {
  return rank <= 3 ? "#fff" : Colors.textMuted;
}

export default function RankingScreen() {
  const router = useRouter();
  const [data, setData] = useState<RegionalRanking | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await api.get<RegionalRanking>("/ranking/regional");
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={Colors.primary} size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Classement Régional</Text>
          {data ? (
            <Text style={styles.headerSub}>{data.total_users} membres dans votre région</Text>
          ) : null}
        </View>
        <Trophy color={Colors.accent} size={22} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : !data ? (
        <View style={styles.center}>
          <Trophy color={Colors.textSubtle} size={48} />
          <Text style={styles.emptyText}>Classement indisponible</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {/* Pillar banner */}
          {data.is_pillar && (
            <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg }}>
              <LinearGradient
                colors={[Colors.gradGold1, Colors.gradGold2, Colors.gradGold3]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.pillarBanner}
              >
                <Text style={styles.pillarText}>🏆 Pilier de la communauté</Text>
                <Text style={styles.pillarSub}>Vous faites partie des membres les plus engagés</Text>
              </LinearGradient>
            </View>
          )}

          {/* My rank card */}
          <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.lg }}>
            <LinearGradient
              colors={[Colors.primary, Colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.myRankCard, Shadow.cardMd]}
            >
              <View>
                <Text style={styles.myRankLabel}>Mon classement</Text>
                <Text style={styles.myRankNumber}>#{data.my_rank}</Text>
                <Text style={styles.myRankSub}>sur {data.total_users} membres</Text>
              </View>
              <View style={styles.myRankBadge}>
                <Trophy color={Colors.accent} size={32} />
              </View>
            </LinearGradient>
          </View>

          {/* Top 10 list */}
          <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.lg, gap: 8 }}>
            {data.ranking.map((entry) => (
              <Card
                key={entry.rank}
                style={[styles.rankRow, entry.is_me && styles.rankRowMe]}
              >
                <View style={[styles.rankBadge, { backgroundColor: rankBadgeColor(entry.rank) }]}>
                  <Text style={[styles.rankBadgeText, { color: rankTextColor(entry.rank) }]}>
                    #{entry.rank}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={[styles.entryName, entry.is_me && styles.entryNameMe]}>
                      {entry.display_name}{entry.is_me ? " (Vous)" : ""}
                    </Text>
                    <Text style={styles.entryScore}>{entry.score}</Text>
                  </View>
                  <ScoreBar score={entry.score} />
                </View>
              </Card>
            ))}
          </View>

          {/* Anonymity note */}
          <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.lg }}>
            <Text style={styles.anonymityNote}>
              🔒 Les noms sont anonymisés pour la confidentialité
            </Text>
          </View>
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

  pillarBanner: { borderRadius: Radius.xl, padding: 16 },
  pillarText: { color: Colors.premium, fontSize: 16, fontWeight: "900" },
  pillarSub: { color: Colors.premium, fontSize: 12, fontWeight: "600", opacity: 0.8, marginTop: 3 },

  myRankCard: { borderRadius: Radius.xxl, padding: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  myRankLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  myRankNumber: { color: "#fff", fontSize: 48, fontWeight: "900", lineHeight: 54, letterSpacing: -2 },
  myRankSub: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600", marginTop: 2 },
  myRankBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },

  rankRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  rankRowMe: { borderWidth: 2, borderColor: Colors.primary },
  rankBadge: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  rankBadgeText: { fontWeight: "900", fontSize: 12 },
  entryName: { color: Colors.text, fontWeight: "700", fontSize: 14 },
  entryNameMe: { color: Colors.primary },
  entryScore: { color: Colors.textMuted, fontWeight: "800", fontSize: 13 },

  scoreBarBg: { height: 5, backgroundColor: Colors.surfaceAlt, borderRadius: 3, overflow: "hidden" },
  scoreBarFill: { height: "100%", borderRadius: 3 },

  anonymityNote: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", textAlign: "center" },
  emptyText: { color: Colors.textMuted, fontSize: 16, fontWeight: "700" },
});
