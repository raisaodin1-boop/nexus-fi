import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ShieldCheck, TrendingUp, Star, AlertCircle, ChevronRight, Award } from "lucide-react-native";
import { useFocusEffect } from "expo-router";

import { useAuth } from "@/src/auth-context";
import { api } from "@/src/api";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { TrustGauge } from "@/src/trust-gauge";

interface TrustScore {
  score: number; level: string; risk: string; color: string;
  tips: string[];
  stats: { total_saved: number; tontines: number; associations: number; cooperatives: number; deposits_90d: number; contributions_made: number; account_age_days: number };
}

const LEVEL_COLORS: Record<string, string> = {
  "Platine": "#E5E4E2",
  "Or": Colors.accent,
  "Argent": "#C0C0C0",
  "Bronze": "#CD7F32",
  "Débutant": Colors.textMuted,
};

export default function IdentityTab() {
  const { user } = useAuth();
  const [trust, setTrust] = useState<TrustScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await api.get<TrustScore>("/trust-score");
      setTrust(t);
    } catch {
      // Backend unavailable — show empty state
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const levelColor = trust ? (LEVEL_COLORS[trust.level] ?? Colors.primary) : Colors.primary;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.header}>
          <View style={styles.headerRow}>
            <ShieldCheck size={28} color="#fff" />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.headerLabel}>Identité Financière</Text>
              <Text style={styles.headerSub}>{user?.full_name ?? "—"}</Text>
            </View>
          </View>
          {trust && (
            <View style={styles.scoreWrap}>
              <TrustGauge score={trust.score} label={trust.level} color={levelColor} />
            </View>
          )}
          {loading && <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />}
        </LinearGradient>

        {/* Level badge */}
        {trust && (
          <View style={styles.section}>
            <View style={[styles.badge, { backgroundColor: levelColor + "22" }]}>
              <Award size={18} color={levelColor} />
              <Text style={[styles.badgeText, { color: levelColor }]}>Niveau {trust.level}</Text>
            </View>
            <Text style={styles.riskLabel}>Profil de risque : <Text style={{ color: levelColor, fontWeight: "700" }}>{trust.risk}</Text></Text>
          </View>
        )}

        {/* Stats */}
        {trust && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mes statistiques</Text>
            <View style={styles.statsGrid}>
              <StatItem label="Total épargné" value={`${Math.round(trust.stats.total_saved).toLocaleString("fr-FR")} XAF`} icon={<TrendingUp size={16} color={Colors.primary} />} />
              <StatItem label="Tontines" value={`${trust.stats.tontines}`} icon={<Star size={16} color={Colors.accent} />} />
              <StatItem label="Associations" value={`${trust.stats.associations}`} icon={<ShieldCheck size={16} color={Colors.secondary} />} />
              <StatItem label="Cotisations" value={`${trust.stats.contributions_made}`} icon={<TrendingUp size={16} color={Colors.success} />} />
              <StatItem label="Dépôts (90j)" value={`${trust.stats.deposits_90d}`} icon={<Star size={16} color={Colors.primary} />} />
              <StatItem label="Ancienneté" value={`${trust.stats.account_age_days}j`} icon={<Award size={16} color={Colors.accent} />} />
            </View>
          </View>
        )}

        {/* Tips */}
        {trust && trust.tips.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Conseils pour progresser</Text>
            {trust.tips.map((tip, i) => (
              <View key={i} style={styles.tip}>
                <AlertCircle size={16} color={Colors.primary} style={{ marginTop: 2 }} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {!loading && !trust && (
          <View style={styles.empty}>
            <ShieldCheck size={48} color={Colors.border} />
            <Text style={styles.emptyTitle}>Score indisponible</Text>
            <Text style={styles.emptyText}>Effectuez des transactions pour construire votre identité financière.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatItem({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <View style={styles.statItem}>
      <View style={styles.statIcon}>{icon}</View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: Spacing.xl, paddingTop: Spacing.xxl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  headerLabel: { fontSize: 18, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  scoreWrap: { alignItems: "center", marginTop: Spacing.xl },
  section: { margin: Spacing.xl, marginBottom: 0 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: Colors.text, marginBottom: Spacing.md },
  badge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, gap: 6, marginBottom: 8 },
  badgeText: { fontSize: 14, fontWeight: "700" },
  riskLabel: { fontSize: 14, color: Colors.textMuted },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statItem: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, width: "47%", alignItems: "center", gap: 4, ...(Shadow.card as object) },
  statIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 16, fontWeight: "800", color: Colors.text, textAlign: "center" },
  statLabel: { fontSize: 11, color: Colors.textMuted, textAlign: "center" },
  tip: { flexDirection: "row", gap: 10, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: 8, ...(Shadow.card as object) },
  tipText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 20 },
  empty: { alignItems: "center", padding: Spacing.xxxl, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
});
