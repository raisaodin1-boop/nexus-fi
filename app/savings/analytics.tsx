import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, TrendingUp, TrendingDown, Minus, AlertCircle, Users, Target, Lightbulb } from "lucide-react-native";
import Svg, { Rect, Text as SvgText, Line } from "react-native-svg";

import { api } from "@/src/api";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { SkeletonBox } from "@/src/ui";
import type { GoalPrediction, PeerStats, MonthBar } from "@/src/savings-ai";

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({ bars }: { bars: MonthBar[] }) {
  const maxAmt = Math.max(...bars.map(b => b.amount), 1);
  const W = 300, H = 100, BAR_W = 32, GAP = (W - bars.length * BAR_W) / (bars.length + 1);

  return (
    <Svg width={W} height={H + 20}>
      {bars.map((b, i) => {
        const barH = Math.max(2, (b.amount / maxAmt) * H);
        const x = GAP + i * (BAR_W + GAP);
        const y = H - barH;
        const isLast = i === bars.length - 1;
        return (
          <React.Fragment key={b.month}>
            <Rect
              x={x} y={y} width={BAR_W} height={barH}
              rx={6} fill={isLast ? Colors.secondary : Colors.secondary + "55"}
            />
            <SvgText x={x + BAR_W / 2} y={H + 15} fontSize={10} fill={Colors.textMuted}
              textAnchor="middle">{b.month}</SvgText>
            {b.amount > 0 && (
              <SvgText x={x + BAR_W / 2} y={y - 4} fontSize={9} fill={isLast ? Colors.secondary : Colors.textMuted}
                textAnchor="middle">
                {b.amount >= 1000 ? `${Math.round(b.amount / 1000)}k` : String(b.amount)}
              </SvgText>
            )}
          </React.Fragment>
        );
      })}
      <Line x1={0} y1={H} x2={W} y2={H} stroke={Colors.border} strokeWidth={1} />
    </Svg>
  );
}

// ─── Progress arc ─────────────────────────────────────────────────────────────

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 900, delay: 200, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={ringStyles.wrap}>
      <View style={[ringStyles.track, { borderColor: Colors.surfaceAlt }]}>
        <Animated.View style={[
          ringStyles.fill,
          { borderColor: color, transform: [{ rotate: anim.interpolate({ inputRange: [0, 100], outputRange: ["0deg", "360deg"] }) }] },
        ]} />
      </View>
      <View style={ringStyles.center}>
        <Text style={[ringStyles.pct, { color }]}>{pct}%</Text>
        <Text style={ringStyles.label}>atteint</Text>
      </View>
    </View>
  );
}
const ringStyles = StyleSheet.create({
  wrap: { width: 110, height: 110, alignItems: "center", justifyContent: "center" },
  track: { position: "absolute", width: 110, height: 110, borderRadius: 55, borderWidth: 10 },
  fill: { position: "absolute", width: 110, height: 110, borderRadius: 55, borderWidth: 10, borderTopColor: "transparent", borderRightColor: "transparent", borderBottomColor: "transparent" },
  center: { alignItems: "center" },
  pct: { fontSize: 24, fontWeight: "900" },
  label: { fontSize: 10, color: Colors.textMuted, fontWeight: "600" },
});

// ─── Trend icon ───────────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "increasing") return <TrendingUp size={16} color="#10B981" />;
  if (trend === "decreasing") return <TrendingDown size={16} color="#EF4444" />;
  return <Minus size={16} color={Colors.textMuted} />;
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " XAF";
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SavingsAnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<{
    goal: any;
    prediction: GoalPrediction;
    histogram: MonthBar[];
    peer_stats: PeerStats;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>(`/savings/${id}/analytics`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={{ padding: Spacing.xl, gap: 14 }}>
          <SkeletonBox height={180} borderRadius={Radius.xxl} />
          <SkeletonBox height={120} borderRadius={Radius.xl} />
          <SkeletonBox height={160} borderRadius={Radius.xl} />
          <SkeletonBox height={120} borderRadius={Radius.xl} />
        </View>
      </SafeAreaView>
    );
  }
  if (!data) return null;

  const { goal, prediction: p, histogram, peer_stats: peer } = data;
  const { pattern } = p;

  // Color coding
  const statusColor = p.on_track === null ? Colors.secondary
    : p.on_track ? "#10B981" : "#F59E0B";

  const TREND_LABELS = { increasing: "En hausse 📈", decreasing: "En baisse 📉", stable: "Stable ➡️" };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* ── Header ── */}
        <LinearGradient colors={["#0B1F3A", "#1D4ED8"]} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <ChevronLeft color="#fff" size={24} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Analyse IA</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{goal.name}</Text>
          </View>
        </LinearGradient>

        {/* ── Progress + prediction hero ── */}
        <View style={[styles.section, { marginTop: -1 }]}>
          <LinearGradient colors={[statusColor + "18", Colors.background]} style={[styles.card, { borderColor: statusColor + "55" }]}>
            <View style={styles.heroRow}>
              <ProgressRing pct={p.progress_pct} color={statusColor} />
              <View style={{ flex: 1, gap: 8 }}>
                <Row label="Épargné" value={fmt(p.current_amount)} />
                <Row label="Objectif" value={fmt(p.target_amount)} />
                <Row label="Reste" value={fmt(p.remaining_xaf)} muted />
                {p.planned_deadline && (
                  <Row label="Échéance prévue" value={fmtDate(p.planned_deadline)} />
                )}
                {p.predicted_completion_date && (
                  <Row
                    label="Prédiction IA"
                    value={fmtDate(p.predicted_completion_date)}
                    valueColor={statusColor}
                  />
                )}
              </View>
            </View>

            {/* Alert */}
            {p.alert && (
              <View style={[styles.alertBox, { borderColor: statusColor + "44", backgroundColor: statusColor + "12" }]}>
                <AlertCircle size={16} color={statusColor} style={{ marginTop: 1 }} />
                <Text style={[styles.alertText, { color: statusColor === Colors.secondary ? Colors.text : statusColor }]}>
                  {p.alert}
                </Text>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* ── Deposit pattern ── */}
        <View style={styles.section}>
          <SectionHeader icon={TrendingUp} title="Patterns de dépôt" />
          <View style={[styles.card, Shadow.card]}>
            <View style={styles.statGrid}>
              <StatCell label="Moy. mensuelle" value={fmt(pattern.avg_monthly_xaf)} />
              <StatCell label="Dépôt médian" value={fmt(pattern.median_deposit_xaf)} />
              <StatCell label="Nb dépôts" value={String(pattern.deposit_count)} />
              <StatCell label="Constance" value={`${pattern.consistency_pct}%`} color={pattern.consistency_pct >= 70 ? "#10B981" : "#F59E0B"} />
            </View>
            <View style={styles.trendRow}>
              <TrendIcon trend={pattern.trend} />
              <Text style={styles.trendText}>
                Tendance : <Text style={{ fontWeight: "700" }}>{TREND_LABELS[pattern.trend as keyof typeof TREND_LABELS] ?? "—"}</Text>
                {pattern.trend !== "stable" && ` (${pattern.trend_slope > 0 ? "+" : ""}${fmt(pattern.trend_slope)}/dépôt)`}
              </Text>
            </View>
            {pattern.days_since_last < 999 && (
              <Text style={styles.lastDeposit}>
                Dernier dépôt : il y a {pattern.days_since_last} jour{pattern.days_since_last > 1 ? "s" : ""}
                {pattern.days_since_last > 45 ? " — pensez à alimenter votre objectif !" : ""}
              </Text>
            )}
          </View>
        </View>

        {/* ── Monthly histogram ── */}
        {histogram.some(b => b.amount > 0) && (
          <View style={styles.section}>
            <SectionHeader icon={TrendingUp} title="Dépôts des 6 derniers mois" />
            <View style={[styles.card, Shadow.card, { alignItems: "center" }]}>
              <BarChart bars={histogram} />
            </View>
          </View>
        )}

        {/* ── Recommendation ── */}
        <View style={styles.section}>
          <SectionHeader icon={Lightbulb} title="Recommandation" />
          <View style={[styles.card, Shadow.card]}>
            <View style={styles.recRow}>
              <View style={styles.recAmountBox}>
                <Text style={styles.recAmountLabel}>Montant optimal/mois</Text>
                <Text style={styles.recAmount}>{fmt(p.optimal_monthly_xaf)}</Text>
              </View>
              <View style={[styles.recDivider]} />
              <View style={styles.recAmountBox}>
                <Text style={styles.recAmountLabel}>Prochain dépôt conseillé</Text>
                <Text style={styles.recAmount}>{fmt(p.optimal_deposit_xaf)}</Text>
              </View>
            </View>
            {p.delay_months !== null && p.delay_months > 0 && (
              <Text style={styles.recTip}>
                Pour rattraper le retard de {p.delay_months} mois, augmentez vos dépôts de {fmt(p.optimal_monthly_xaf - pattern.avg_monthly_xaf)}/mois.
              </Text>
            )}
          </View>
        </View>

        {/* ── Peer comparison ── */}
        {peer.peer_count >= 3 && (
          <View style={styles.section}>
            <SectionHeader icon={Users} title={`Comparaison anonyme (${peer.peer_count} membres)`} />
            <View style={[styles.card, Shadow.card]}>
              <View style={styles.peerBarWrap}>
                {/* User bar */}
                <PeerBar label="Vous" amount={pattern.avg_monthly_xaf} max={Math.max(pattern.avg_monthly_xaf, peer.peer_avg_monthly_xaf) * 1.2} color={Colors.secondary} />
                {/* Peer avg bar */}
                <PeerBar label="Moyenne membres" amount={peer.peer_avg_monthly_xaf} max={Math.max(pattern.avg_monthly_xaf, peer.peer_avg_monthly_xaf) * 1.2} color={Colors.textSubtle} />
              </View>
              {/* Percentile badge */}
              <View style={[styles.percentileBadge, { backgroundColor: peer.user_percentile >= 50 ? "#10B98120" : "#F59E0B20" }]}>
                <Text style={[styles.percentileText, { color: peer.user_percentile >= 50 ? "#10B981" : "#F59E0B" }]}>
                  Top {100 - peer.user_percentile}%
                </Text>
              </View>
              <Text style={styles.peerLabel}>{peer.label}</Text>
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ label, value, muted, valueColor }: { label: string; value: string; muted?: boolean; valueColor?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={[styles.rowLabel, muted && { color: Colors.textSubtle }]}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor, fontWeight: "800" } : null]}>{value}</Text>
    </View>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Icon size={16} color={Colors.secondary} strokeWidth={2.5} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PeerBar({ label, amount, max, color }: { label: string; amount: number; max: number; color: string }) {
  const pct = max > 0 ? (amount / max) * 100 : 0;
  return (
    <View style={{ gap: 4, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 12, color: Colors.textMuted }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: "700", color }}>{new Intl.NumberFormat("fr-FR").format(amount)} XAF</Text>
      </View>
      <View style={styles.peerTrack}>
        <View style={[styles.peerFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: Spacing.xl, paddingBottom: 20 },
  back: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  section: { paddingHorizontal: Spacing.xl, marginTop: Spacing.xl },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.text, letterSpacing: -0.2 },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xxl,
    padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border,
  },
  heroRow: { flexDirection: "row", gap: 16, alignItems: "center", marginBottom: 14 },
  alertBox: { flexDirection: "row", gap: 10, padding: 12, borderRadius: Radius.lg, borderWidth: 1, alignItems: "flex-start" },
  alertText: { fontSize: 13, lineHeight: 19, flex: 1 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 0, marginBottom: 12 },
  statCell: { width: "50%", paddingVertical: 8, paddingRight: 12 },
  statValue: { fontSize: 16, fontWeight: "800", color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  trendText: { fontSize: 13, color: Colors.textMuted },
  lastDeposit: { fontSize: 11, color: Colors.textSubtle, marginTop: 6 },
  rowLabel: { fontSize: 12, color: Colors.textMuted },
  rowValue: { fontSize: 13, fontWeight: "600", color: Colors.text },
  recRow: { flexDirection: "row", gap: 0, alignItems: "stretch" },
  recAmountBox: { flex: 1, alignItems: "center", paddingVertical: 4 },
  recDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 12 },
  recAmountLabel: { fontSize: 11, color: Colors.textMuted, textAlign: "center", marginBottom: 4 },
  recAmount: { fontSize: 18, fontWeight: "900", color: Colors.secondary, textAlign: "center" },
  recTip: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  peerBarWrap: { gap: 0 },
  peerTrack: { height: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 4, overflow: "hidden" },
  peerFill: { height: "100%", borderRadius: 4 },
  percentileBadge: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.full, marginTop: 12 },
  percentileText: { fontSize: 13, fontWeight: "800" },
  peerLabel: { fontSize: 13, color: Colors.textMuted, marginTop: 8, lineHeight: 18 },
});
