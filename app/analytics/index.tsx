import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, { Circle, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { Download, BarChart2, PieChart, TrendingUp, Target } from "lucide-react-native";
import { api, formatXAF } from "@/src/api";
import { Card } from "@/src/ui";
import { Colors, Spacing } from "@/src/theme";

interface CashFlowItem { label: string; inflow: number; outflow: number }
interface DonutData { saved: number; contributed: number; total: number }
interface TrustHistoryItem { label: string; score: number }
interface Projection { name: string; pct: number; months_to_go: number | null; target: number; current: number }
interface AnalyticsData {
  cash_flow: CashFlowItem[];
  donut: DonutData;
  trust_history: TrustHistoryItem[];
  projections: Projection[];
  raw_rows: { date: string; type: string; amount: number; category: string }[];
}

/* ── CashFlowChart ─────────────────────────────────────────── */
function CashFlowChart({ data }: { data: CashFlowItem[] }) {
  const W = Dimensions.get("window").width - Spacing.xl * 2 - 32;
  const H = 140;
  const maxVal = Math.max(...data.flatMap(d => [d.inflow, d.outflow]), 1);
  const barW = Math.floor((W / data.length - 8) / 2);
  const gap = 2;
  const groupW = W / data.length;
  return (
    <Svg width={W} height={H + 24}>
      {data.map((d, i) => {
        const x = i * groupW + (groupW - barW * 2 - gap) / 2;
        const inflowH = Math.max(4, (d.inflow / maxVal) * H);
        const outflowH = Math.max(4, (d.outflow / maxVal) * H);
        return (
          <React.Fragment key={i}>
            <Rect x={x} y={H - inflowH} width={barW} height={inflowH} rx={3} fill="#10B981CC" />
            <Rect x={x + barW + gap} y={H - outflowH} width={barW} height={outflowH} rx={3} fill={Colors.secondary + "CC"} />
            <SvgText x={x + barW} y={H + 14} fontSize={9} fill={Colors.textMuted} textAnchor="middle">{d.label}</SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

/* ── DonutChart ────────────────────────────────────────────── */
function DonutChart({ saved, contributed }: { saved: number; contributed: number }) {
  const total = saved + contributed || 1;
  const SIZE = 160; const R = 60; const CX = SIZE / 2; const CY = SIZE / 2;
  const STROKE = 18;
  const circumference = 2 * Math.PI * R;
  const savePct = saved / total;
  const contribPct = contributed / total;
  const savedDash = savePct * circumference;
  const contribDash = contribPct * circumference;
  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={CX} cy={CY} r={R} fill="none" stroke={Colors.surfaceAlt} strokeWidth={STROKE} />
        <Circle
          cx={CX} cy={CY} r={R} fill="none" stroke="#10B981" strokeWidth={STROKE}
          strokeDasharray={`${savedDash} ${circumference}`}
          strokeDashoffset={circumference / 4}
          strokeLinecap="round"
          rotation={-90}
          origin={`${CX},${CY}`}
        />
        <Circle
          cx={CX} cy={CY} r={R} fill="none" stroke={Colors.secondary} strokeWidth={STROKE}
          strokeDasharray={`${contribDash} ${circumference}`}
          strokeDashoffset={-(savedDash - circumference / 4)}
          strokeLinecap="round"
          rotation={-90}
          origin={`${CX},${CY}`}
        />
        <SvgText x={CX} y={CY - 8} fontSize={18} fontWeight="900" fill={Colors.text} textAnchor="middle">
          {Math.round(savePct * 100)}%
        </SvgText>
        <SvgText x={CX} y={CY + 12} fontSize={10} fill={Colors.textMuted} textAnchor="middle">Épargne</SvgText>
      </Svg>
      <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#10B981" }} />
          <Text style={{ color: Colors.textMuted, fontSize: 12 }}>Épargne {formatXAF(saved)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.secondary }} />
          <Text style={{ color: Colors.textMuted, fontSize: 12 }}>Tontines {formatXAF(contributed)}</Text>
        </View>
      </View>
    </View>
  );
}

/* ── TrustLineChart ────────────────────────────────────────── */
function TrustLineChart({ data }: { data: TrustHistoryItem[] }) {
  if (data.length < 2) {
    return (
      <Text style={{ color: Colors.textMuted, fontSize: 13, textAlign: "center", padding: 16 }}>
        Pas encore assez de données
      </Text>
    );
  }
  const W = Dimensions.get("window").width - Spacing.xl * 2 - 32;
  const H = 100;
  const scores = data.map(d => d.score);
  const minS = Math.min(...scores);
  const maxS = Math.max(...scores, minS + 1);
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((d.score - minS) / (maxS - minS)) * H;
    return `${x},${y}`;
  }).join(" ");
  return (
    <Svg width={W} height={H + 20}>
      <Polyline points={pts} fill="none" stroke={Colors.secondary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = H - ((d.score - minS) / (maxS - minS)) * H;
        return (
          <React.Fragment key={i}>
            <Circle cx={x} cy={y} r={3} fill={Colors.secondary} />
            {(i === 0 || i === data.length - 1) ? (
              <SvgText x={x} y={H + 14} fontSize={9} fill={Colors.textMuted} textAnchor="middle">{d.label}</SvgText>
            ) : null}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

/* ── CSV Export ────────────────────────────────────────────── */
function exportCSV(rawRows: AnalyticsData["raw_rows"]) {
  const header = "Date,Type,Montant,Catégorie\n";
  const rows = rawRows.map(r =>
    `${new Date(r.date).toLocaleDateString("fr-FR")},${r.type},${r.amount},${r.category}`
  ).join("\n");
  const csv = header + rows;
  Share.share({ message: csv, title: "Historique HODIX" });
}

/* ── Main Screen ───────────────────────────────────────────── */
export default function FinancialAnalyticsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get<AnalyticsData>("/financial-analytics");
      setData(result);
    } catch (e) {
      // silently fail — show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Tableau de Bord</Text>
        <TouchableOpacity
          onPress={() => data?.raw_rows && exportCSV(data.raw_rows)}
          style={styles.exportBtn}
          disabled={!data}
        >
          <Download color={Colors.secondary} size={20} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.secondary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {/* Cash Flow */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <BarChart2 color={Colors.secondary} size={18} />
              <Text style={styles.sectionTitle}>Flux mensuels</Text>
            </View>
            <Card style={styles.card}>
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#10B981" }]} />
                  <Text style={styles.legendText}>Entrées</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.secondary }]} />
                  <Text style={styles.legendText}>Sorties</Text>
                </View>
              </View>
              {data && data.cash_flow.length > 0 ? (
                <CashFlowChart data={data.cash_flow} />
              ) : (
                <Text style={styles.emptyText}>Aucun flux pour le moment</Text>
              )}
            </Card>
          </View>

          {/* Donut */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <PieChart color={Colors.accent} size={18} />
              <Text style={styles.sectionTitle}>Répartition de l'épargne</Text>
            </View>
            <Card style={[styles.card, { alignItems: "center" }]}>
              <DonutChart
                saved={data?.donut.saved ?? 0}
                contributed={data?.donut.contributed ?? 0}
              />
            </Card>
          </View>

          {/* Trust Score */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <TrendingUp color={Colors.primary} size={18} />
              <Text style={styles.sectionTitle}>Évolution du Trust Score</Text>
            </View>
            <Card style={styles.card}>
              <TrustLineChart data={data?.trust_history ?? []} />
            </Card>
          </View>

          {/* Goal Projections */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Target color={Colors.accentDark} size={18} />
              <Text style={styles.sectionTitle}>Projection des objectifs</Text>
            </View>
            {data && data.projections.length > 0 ? (
              data.projections.map((proj, i) => (
                <Card key={i} style={[styles.card, { marginBottom: 10 }]}>
                  <View style={styles.projHeader}>
                    <Text style={styles.projName} numberOfLines={1}>{proj.name}</Text>
                    <Text style={styles.projPct}>{proj.pct}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${proj.pct}%` as any, backgroundColor: proj.pct >= 100 ? "#10B981" : Colors.secondary }]} />
                  </View>
                  <View style={styles.projFooter}>
                    <Text style={styles.projAmount}>
                      {formatXAF(proj.current)} / {formatXAF(proj.target)}
                    </Text>
                    {proj.pct >= 100 ? (
                      <Text style={[styles.projEta, { color: "#10B981" }]}>Objectif atteint !</Text>
                    ) : proj.months_to_go !== null ? (
                      <Text style={styles.projEta}>{proj.months_to_go} mois restants</Text>
                    ) : (
                      <Text style={styles.projEta}>Aucun dépôt récent</Text>
                    )}
                  </View>
                </Card>
              ))
            ) : (
              <Card style={styles.card}>
                <Text style={styles.emptyText}>Aucun objectif d'épargne actif</Text>
              </Card>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    backgroundColor: Colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, alignItems: "flex-start" },
  backText: { color: Colors.primary, fontSize: 28, lineHeight: 30, fontWeight: "300" },
  title: { flex: 1, textAlign: "center", color: Colors.text, fontSize: 18, fontWeight: "800" },
  exportBtn: {
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
  },
  section: { paddingHorizontal: Spacing.xl, marginTop: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  card: { padding: 16 },
  legend: { flexDirection: "row", gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: Colors.textMuted, fontSize: 12, fontWeight: "600" },
  emptyText: { color: Colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 16 },
  projHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  projName: { color: Colors.text, fontSize: 14, fontWeight: "700", flex: 1, marginRight: 8 },
  projPct: { color: Colors.secondary, fontSize: 14, fontWeight: "800" },
  progressTrack: { height: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  progressFill: { height: 8, borderRadius: 4 },
  projFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  projAmount: { color: Colors.textMuted, fontSize: 11, fontWeight: "600" },
  projEta: { color: Colors.textMuted, fontSize: 11, fontWeight: "600" },
});
