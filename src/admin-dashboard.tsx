// Super Admin home — Investor-Ready Control Center.
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ShieldAlert, Users, Activity, ChevronRight, Crown, Sparkles, FileText,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Zap, DollarSign,
} from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { EMPTY_ADMIN_ANALYTICS } from "@/src/db/admin";
import { DegradedDataBanner } from "@/src/degraded-banner";
import { Card, StatCard, SkeletonBox, SkeletonCard } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { LineChart } from "@/src/charts";

interface Series { days: number; series: { date: string; value: number }[] }

type Analytics = typeof EMPTY_ADMIN_ANALYTICS & {
  users: { total: number; active: number; new_7d: number; new_30d: number };
  kyc: { level1: number; level2_approved: number; pending_review: number };
};

const DEFAULT_ANALYTICS = EMPTY_ADMIN_ANALYTICS as Analytics;

function TrendBadge({ value, suffix = "" }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <View style={[trendStyles.badge, { backgroundColor: up ? "#D1FAE5" : "#FEE2E2" }]}>
      {up ? <TrendingUp color="#059669" size={10} /> : <TrendingDown color="#DC2626" size={10} />}
      <Text style={[trendStyles.text, { color: up ? "#059669" : "#DC2626" }]}>
        {up ? "+" : ""}{value}{suffix}
      </Text>
    </View>
  );
}

const trendStyles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99 },
  text: { fontSize: 10, fontWeight: "800" },
});

function KpiCard({
  label, value, sub, trend, trendSuffix = "", color, icon: Icon,
}: {
  label: string; value: string; sub?: string; trend?: number; trendSuffix?: string;
  color: string; icon: React.ComponentType<any>;
}) {
  return (
    <View style={[kpiStyles.card, Shadow.card]}>
      <View style={[kpiStyles.iconWrap, { backgroundColor: color + "18" }]}>
        <Icon color={color} size={18} />
      </View>
      <Text style={kpiStyles.value}>{value}</Text>
      <Text style={kpiStyles.label}>{label}</Text>
      {(sub || trend !== undefined) ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
          {sub ? <Text style={kpiStyles.sub}>{sub}</Text> : null}
          {trend !== undefined ? <TrendBadge value={trend} suffix={trendSuffix} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  value: { color: Colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  label: { color: Colors.textMuted, fontSize: 11, fontWeight: "600" },
  sub: { color: Colors.textSubtle, fontSize: 10, fontWeight: "600" },
});

function SectionHeader({ children, accent }: { children: string; accent?: string }) {
  return (
    <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.xl, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: accent ?? Colors.accent }} />
      <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: "900", letterSpacing: 0.3 }}>{children}</Text>
    </View>
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<Analytics>(DEFAULT_ANALYTICS);
  const [savings, setSavings] = useState<Series | null>(null);
  const [usersSeries, setUsersSeries] = useState<Series | null>(null);
  const [pendingReqs, setPendingReqs] = useState(0);
  const [openFraudAlerts, setOpenFraudAlerts] = useState(0);
  const [criticalFraudAlerts, setCriticalFraudAlerts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyticsDegraded, setAnalyticsDegraded] = useState(false);

  const load = useCallback(async () => {
    const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch { return null; }
    };
    const [a, s, u, p, comp] = await Promise.all([
      safe(() => api.get<Analytics>("/admin/analytics")),
      safe(() => api.get<Series>("/analytics/platform/savings?days=14")),
      safe(() => api.get<Series>("/analytics/platform/users?days=14")),
      safe(() => api.get<any[]>("/admin/promotion-requests")),
      safe(() => api.get<{ open_fraud_alerts: number; critical_fraud_alerts: number }>("/admin/compliance/stats")),
    ]);
    setAnalytics(a ?? DEFAULT_ANALYTICS);
    setAnalyticsDegraded(!a);
    if (s) setSavings(s);
    if (u) setUsersSeries(u);
    if (p) setPendingReqs(p.filter((r: any) => r.status === "pending").length);
    if (comp) {
      setOpenFraudAlerts(comp.open_fraud_alerts);
      setCriticalFraudAlerts(comp.critical_fraud_alerts ?? 0);
    }
    setLoading(false);
  }, []);

  const retry = () => { setLoading(true); load(); };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
  }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={styles.header}>
            <View style={{ gap: 8 }}>
              <SkeletonBox width={120} height={12} />
              <SkeletonBox width={180} height={28} />
            </View>
            <SkeletonBox width={44} height={44} borderRadius={22} />
          </View>
          <View style={{ paddingHorizontal: Spacing.xl }}>
            <SkeletonBox height={140} borderRadius={20} />
          </View>
          <View style={styles.statsRow}><SkeletonBox height={90} borderRadius={16} style={{ flex: 1 }} /><SkeletonBox height={90} borderRadius={16} style={{ flex: 1 }} /></View>
          <View style={styles.statsRow}><SkeletonBox height={90} borderRadius={16} style={{ flex: 1 }} /><SkeletonBox height={90} borderRadius={16} style={{ flex: 1 }} /></View>
          <View style={{ paddingHorizontal: Spacing.xl, marginTop: 12, gap: 10 }}>
            <SkeletonCard /><SkeletonCard />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const dist = analytics.score_distribution ?? { excellent: 0, very_good: 0, good: 0, emerging: 0, new: 0 };
  const totalDist = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  const tier = analytics.tier_distribution ?? { bronze: 0, silver: 0, gold: 0, platinum: 0 };
  const totalTier = Object.values(tier).reduce((a, b) => a + b, 0) || 1;
  const activeGroups = analytics.active_groups ?? { tontines: 0, tontines_active: 0, associations: 0, cooperatives: 0 };
  const payments = analytics.payments ?? { count: 0, amount_minor: 0, commission_minor: 0, currency: "XAF" };
  const commission = payments.commission_minor / 100;
  const users = analytics.users ?? { total: 0, active: 0, new_7d: 0, new_30d: 0 };
  const funds = analytics.funds ?? { count: 0, balance: 0, collected: 0 };
  const kyc = analytics.kyc ?? { level1: 0, level2_approved: 0, pending_review: 0 };
  const avgTrustScore = analytics.avg_trust_score ?? 0;

  const activeRate = users.total > 0 ? Math.round((users.active / users.total) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <View style={styles.rolePill}>
              <ShieldAlert color="#fff" size={11} />
              <Text style={styles.rolePillText}>SUPER ADMIN · INVESTOR DASHBOARD</Text>
            </View>
            <Text style={styles.hello}>Console Hodix</Text>
            <Text style={styles.name}>Control Center</Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/admin")} style={styles.bellWrap} testID="admin-go-full">
            <Activity color={Colors.primary} size={20} />
          </TouchableOpacity>
        </View>

        {analyticsDegraded ? <DegradedDataBanner onRetry={retry} testID="admin-retry-analytics" /> : null}

        {/* Alert Banners */}
        {pendingReqs > 0 ? (
          <TouchableOpacity onPress={() => router.push("/admin")} style={[styles.alertCard, Shadow.card]} testID="admin-pending-banner">
            <View style={[styles.alertIcon, { backgroundColor: Colors.warning }]}><Users color="#fff" size={18} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{pendingReqs} demande{pendingReqs > 1 ? "s" : ""} de promotion en attente</Text>
              <Text style={styles.alertDesc}>Membres souhaitant devenir Tontine Managers.</Text>
            </View>
            <ChevronRight color={Colors.text} size={16} />
          </TouchableOpacity>
        ) : null}

        {openFraudAlerts > 0 ? (
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/admin", params: { tab: "compliance" } } as any)}
            style={[styles.alertCard, styles.fraudAlertCard, Shadow.card]}
            testID="admin-fraud-banner"
          >
            <View style={[styles.alertIcon, { backgroundColor: "#DC2626" }]}>
              <AlertTriangle color="#fff" size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertTitle, { color: "#991B1B" }]}>
                {openFraudAlerts} alerte{openFraudAlerts > 1 ? "s" : ""} fraude
                {criticalFraudAlerts > 0 ? ` · ${criticalFraudAlerts} critique${criticalFraudAlerts > 1 ? "s" : ""}` : ""}
              </Text>
              <Text style={[styles.alertDesc, { color: "#B45309" }]}>COBAC/CEMAC — examen requis immédiatement.</Text>
            </View>
            <View style={styles.severityBadge}><Text style={styles.severityText}>URGENT</Text></View>
          </TouchableOpacity>
        ) : null}

        {/* Hero gradient card */}
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <LinearGradient colors={["#0B1F3A", "#1a3a5c", "#0B1F3A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, Shadow.cardDark]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View>
                <Text style={styles.heroLbl}>VOLUME TOTAL D'ÉPARGNE</Text>
                <Text style={styles.heroVal}>{formatXAF(analytics.savings_volume)}</Text>
              </View>
              <View style={styles.heroIcon}><DollarSign color={Colors.accent} size={22} /></View>
            </View>
            <View style={styles.heroSep} />
            <View style={styles.heroRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStVal}>{users.total.toLocaleString()}</Text>
                <Text style={styles.heroStLbl}>Utilisateurs</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={styles.heroStVal}>{users.active}</Text>
                  <View style={{ backgroundColor: "#059669", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                    <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>{activeRate}%</Text>
                  </View>
                </View>
                <Text style={styles.heroStLbl}>Actifs</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStVal, { color: Colors.accent }]}>+{users.new_7d}</Text>
                <Text style={styles.heroStLbl}>Nouveaux (7j)</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStVal, { color: "#10B981" }]}>+{users.new_30d}</Text>
                <Text style={styles.heroStLbl}>Nouveaux (30j)</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* KPI Grid — Utilisateurs */}
        <SectionHeader accent={Colors.secondary}>Utilisateurs</SectionHeader>
        <View style={styles.statsRow}>
          <KpiCard label="Total inscrits" value={`${users.total}`} icon={Users} color={Colors.secondary} trend={users.new_30d} trendSuffix=" ce mois" />
          <KpiCard label="Taux d'activité" value={`${activeRate}%`} icon={Zap} color={Colors.accent} sub={`${users.active} actifs`} />
        </View>
        <View style={styles.statsRow}>
          <KpiCard label="KYC niveau 2" value={`${kyc.level2_approved}`} icon={CheckCircle} color="#059669" sub={`${kyc.pending_review} en attente`} />
          <KpiCard label="Trust Score moy." value={`${avgTrustScore.toFixed(1)}`} icon={Crown} color={Colors.warning} sub="/ 100" />
        </View>

        {/* KPI Grid — Communautés */}
        <SectionHeader accent={Colors.primary}>Communautés</SectionHeader>
        <View style={styles.statsRow}>
          <KpiCard label="Tontines actives" value={`${activeGroups.tontines_active}`} icon={Users} color={Colors.accent} sub={`/ ${activeGroups.tontines} total`} />
          <KpiCard label="Associations" value={`${activeGroups.associations}`} icon={Users} color={Colors.secondary} />
        </View>
        <View style={styles.statsRow}>
          <KpiCard label="Coopératives" value={`${activeGroups.cooperatives}`} icon={Users} color={Colors.primary} />
          <KpiCard label="Fonds commun." value={`${funds.count}`} icon={DollarSign} color={Colors.warning} sub={formatXAF(funds.balance)} />
        </View>

        {/* KPI Grid — Finances */}
        <SectionHeader accent={Colors.accent}>Finances</SectionHeader>
        <View style={styles.statsRow}>
          <KpiCard label="Contributions" value={formatXAF(analytics.tontine_contributions_volume)} icon={TrendingUp} color={Colors.accent} sub={`${analytics.tontine_contributions_count ?? 0} ops`} />
          <KpiCard label="Commission HODIX" value={`${commission.toFixed(0)} ${payments.currency}`} icon={DollarSign} color="#7C3AED" sub="Taux 1%" />
        </View>

        {/* Tier distribution — premium card */}
        <SectionHeader accent="#8B5CF6">Identité financière</SectionHeader>
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <Card>
            <Text style={styles.distTitle}>Niveaux d'identité</Text>
            {[
              { l: "Platinum (81+)", v: tier.platinum, c: "#8B5CF6", Icon: Crown },
              { l: "Gold (61-80)", v: tier.gold, c: "#D4AF37", Icon: Crown },
              { l: "Silver (31-60)", v: tier.silver, c: "#9CA3AF", Icon: Sparkles },
              { l: "Bronze (0-30)", v: tier.bronze, c: "#CD7F32", Icon: Sparkles },
            ].map((r) => (
              <View key={r.l} style={{ marginTop: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: r.c + "20", alignItems: "center", justifyContent: "center" }}>
                      <r.Icon color={r.c} size={12} />
                    </View>
                    <Text style={styles.distLbl}>{r.l}</Text>
                  </View>
                  <Text style={[styles.distVal, { color: r.c }]}>{r.v} · {Math.round((r.v / totalTier) * 100)}%</Text>
                </View>
                <View style={styles.distBar}>
                  <View style={[styles.distFill, { width: `${(r.v / totalTier) * 100}%`, backgroundColor: r.c }]} />
                </View>
              </View>
            ))}
          </Card>
        </View>

        <View style={{ paddingHorizontal: Spacing.xl, marginTop: 10 }}>
          <Card>
            <Text style={styles.distTitle}>Distribution Trust Score</Text>
            {[
              { l: "Excellent (80+)", v: dist.excellent, c: Colors.accent },
              { l: "Très bon (60-79)", v: dist.very_good, c: Colors.secondary },
              { l: "Bon (40-59)", v: dist.good, c: Colors.warning },
              { l: "Émergent (20-39)", v: dist.emerging, c: "#F97316" },
              { l: "Nouveau (0-19)", v: dist.new, c: Colors.textSubtle },
            ].map((r) => (
              <View key={r.l} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={styles.distLbl}>{r.l}</Text>
                  <Text style={[styles.distVal, { color: r.c }]}>{r.v}</Text>
                </View>
                <View style={styles.distBar}><View style={[styles.distFill, { width: `${(r.v / totalDist) * 100}%`, backgroundColor: r.c }]} /></View>
              </View>
            ))}
          </Card>
        </View>

        {/* Charts */}
        <SectionHeader>Tendances (14 jours)</SectionHeader>
        <View style={{ paddingHorizontal: Spacing.xl, gap: 12 }}>
          <Card>
            <LineChart title="Volume d'épargne" data={savings?.series ?? []} color={Colors.accent} format={(v) => formatXAF(v)} />
          </Card>
          <Card>
            <LineChart title="Nouveaux utilisateurs" data={usersSeries?.series ?? []} color={Colors.secondary} format={(v) => `${v.toFixed(0)}`} />
          </Card>
        </View>

        {/* Quick links */}
        <SectionHeader>Actions rapides</SectionHeader>
        <View style={{ paddingHorizontal: Spacing.xl, gap: 10 }}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/admin", params: { tab: "compliance" } } as any)}
            testID="admin-open-compliance"
          >
            <Card style={styles.linkCard}>
              <View style={[styles.linkIcon, { backgroundColor: "#0B1F3A" }]}><FileText color="#fff" size={18} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>Compliance & LCB-FT</Text>
                <Text style={styles.linkDesc}>Journal audit immuable · alertes fraude
                  {openFraudAlerts > 0 ? ` · ${openFraudAlerts} ouverte(s)` : " · Aucune alerte"}
                </Text>
              </View>
              {openFraudAlerts > 0
                ? <View style={styles.countBadge}><Text style={styles.countBadgeText}>{openFraudAlerts}</Text></View>
                : <ChevronRight color={Colors.textMuted} size={18} />
              }
            </Card>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/admin")} testID="admin-open-console">
            <Card style={styles.linkCard}>
              <View style={[styles.linkIcon, { backgroundColor: Colors.primary }]}><ShieldAlert color="#fff" size={18} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>Console Admin complète</Text>
                <Text style={styles.linkDesc}>Utilisateurs, audit logs, promotions, KYC, modération</Text>
              </View>
              <ChevronRight color={Colors.textMuted} size={18} />
            </Card>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.xl },
  rolePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start", marginBottom: 6 },
  rolePillText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  hello: { color: Colors.textMuted, fontSize: 12, fontWeight: "600" },
  name: { color: Colors.primary, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  bellWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  alertCard: { backgroundColor: "#FEF3C7", marginHorizontal: Spacing.xl, padding: 14, borderRadius: Radius.xl, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#FCD34D", marginBottom: 10 },
  alertIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  alertTitle: { color: "#92400E", fontSize: 13, fontWeight: "800" },
  alertDesc: { color: "#92400E", fontSize: 11, marginTop: 2 },
  fraudAlertCard: { backgroundColor: "#FEE2E2", borderColor: "#FECACA" },
  severityBadge: { backgroundColor: "#DC2626", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  severityText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  hero: { borderRadius: Radius.xxl, padding: 22 },
  heroLbl: { color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: "700", letterSpacing: 1.2, marginBottom: 4 },
  heroVal: { color: "#fff", fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  heroIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(201,162,39,0.15)", alignItems: "center", justifyContent: "center" },
  heroSep: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 16 },
  heroRow: { flexDirection: "row", justifyContent: "space-between" },
  heroStat: { alignItems: "center" },
  heroStatDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.1)" },
  heroStLbl: { color: "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: "600", letterSpacing: 0.3, marginTop: 3 },
  heroStVal: { color: "#fff", fontSize: 15, fontWeight: "900" },
  statsRow: { flexDirection: "row", paddingHorizontal: Spacing.xl, gap: 10, marginTop: 8 },
  distTitle: { color: Colors.text, fontSize: 14, fontWeight: "800", marginBottom: 4 },
  distLbl: { color: Colors.text, fontSize: 12, fontWeight: "600" },
  distVal: { fontSize: 12, fontWeight: "800" },
  distBar: { height: 6, backgroundColor: Colors.surfaceAlt, borderRadius: 3, overflow: "hidden" },
  distFill: { height: "100%", borderRadius: 3 },
  linkCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  linkIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  linkTitle: { color: Colors.text, fontWeight: "800", fontSize: 14 },
  linkDesc: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  countBadge: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: Colors.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  countBadgeText: { color: "#fff", fontSize: 11, fontWeight: "900" },
});
