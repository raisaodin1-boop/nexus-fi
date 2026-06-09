// Super Admin home — Investor-Ready Control Center.
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ShieldAlert, Users, Activity, ChevronRight, Crown, Sparkles } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { Card, StatCard, SkeletonBox, SkeletonCard } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { LineChart } from "@/src/charts";

interface Analytics {
  users: { total: number; active: number; new_7d: number; new_30d: number };
  savings_volume: number;
  savings_count: number;
  tontine_contributions_volume: number;
  tontine_contributions_count: number;
  funds: { count: number; balance: number; collected: number };
  payments: { count: number; amount_minor: number; commission_minor: number; currency: string };
  active_groups: { tontines: number; tontines_active: number; associations: number; cooperatives: number };
  score_distribution: { excellent: number; very_good: number; good: number; emerging: number; new: number };
  avg_trust_score: number;
  tier_distribution: { bronze: number; silver: number; gold: number; platinum: number };
  kyc: { level1: number; level2_approved: number; pending_review: number };
}
interface Series { days: number; series: { date: string; value: number }[] }

export function AdminDashboard() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [savings, setSavings] = useState<Series | null>(null);
  const [usersSeries, setUsersSeries] = useState<Series | null>(null);
  const [pendingReqs, setPendingReqs] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch { return null; }
    };
    const [a, s, u, p] = await Promise.all([
      safe(() => api.get<Analytics>("/admin/analytics")),
      safe(() => api.get<Series>("/analytics/platform/savings?days=14")),
      safe(() => api.get<Series>("/analytics/platform/users?days=14")),
      safe(() => api.get<any[]>("/admin/promotion-requests")),
    ]);
    if (a) setAnalytics(a);
    if (s) setSavings(s);
    if (u) setUsersSeries(u);
    if (p) setPendingReqs(p.filter((r: any) => r.status === "pending").length);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !analytics) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={styles.header}>
            <View style={{ gap: 8 }}>
              <SkeletonBox width={120} height={12} />
              <SkeletonBox width={180} height={28} />
              <SkeletonBox width={100} height={18} style={{ marginTop: 4 }} />
            </View>
            <SkeletonBox width={44} height={44} borderRadius={22} />
          </View>
          <View style={{ paddingHorizontal: Spacing.xl }}>
            <SkeletonBox height={120} borderRadius={20} />
          </View>
          <View style={styles.statsRow}>
            <SkeletonBox height={80} borderRadius={16} style={{ flex: 1 }} />
            <SkeletonBox height={80} borderRadius={16} style={{ flex: 1 }} />
          </View>
          <View style={styles.statsRow}>
            <SkeletonBox height={80} borderRadius={16} style={{ flex: 1 }} />
            <SkeletonBox height={80} borderRadius={16} style={{ flex: 1 }} />
          </View>
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
  const totalGroups = activeGroups.tontines + activeGroups.associations + activeGroups.cooperatives;
  const payments = analytics.payments ?? { count: 0, amount_minor: 0, commission_minor: 0, currency: "XAF" };
  const commission = payments.commission_minor / 100;
  const users = analytics.users ?? { total: 0, active: 0, new_7d: 0, new_30d: 0 };
  const funds = analytics.funds ?? { count: 0, balance: 0, collected: 0 };
  const kyc = analytics.kyc ?? { level1: 0, level2_approved: 0, pending_review: 0 };
  const avgTrustScore = analytics.avg_trust_score ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <View style={styles.rolePill}>
              <ShieldAlert color={Colors.accent} size={11} />
              <Text style={styles.rolePillText}>SUPER ADMIN · INVESTOR DASHBOARD</Text>
            </View>
            <Text style={styles.hello}>Console Hodix</Text>
            <Text style={styles.name}>Control Center</Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/admin")} style={styles.bellWrap} testID="admin-go-full">
            <Activity color={Colors.primary} size={20} />
          </TouchableOpacity>
        </View>

        {/* Pending promotion requests banner */}
        {pendingReqs > 0 ? (
          <TouchableOpacity onPress={() => router.push("/admin")} style={[styles.alertCard, Shadow.card]} testID="admin-pending-banner">
            <View style={styles.alertIcon}><Users color="#fff" size={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{pendingReqs} demande{pendingReqs > 1 ? "s" : ""} de promotion en attente</Text>
              <Text style={styles.alertDesc}>Examinez les Membres qui veulent devenir Tontine Managers.</Text>
            </View>
            <ChevronRight color={Colors.text} size={18} />
          </TouchableOpacity>
        ) : null}

        {/* Hero — Top metric for investors */}
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={[styles.hero, Shadow.cardDark]}>
            <Text style={styles.heroLbl}>Volume total d'épargne</Text>
            <Text style={styles.heroVal}>{formatXAF(analytics.savings_volume)}</Text>
            <View style={styles.heroRow}>
              <View><Text style={styles.heroStLbl}>Utilisateurs</Text><Text style={styles.heroStVal}>{users.total}</Text></View>
              <View><Text style={styles.heroStLbl}>Actifs</Text><Text style={styles.heroStVal}>{users.active}</Text></View>
              <View><Text style={styles.heroStLbl}>+7j</Text><Text style={styles.heroStVal}>{users.new_7d}</Text></View>
            </View>
          </LinearGradient>
        </View>

        {/* === SECTION 1: UTILISATEURS === */}
        <SectionTitle>👥 Utilisateurs</SectionTitle>
        <View style={styles.statsRow}>
          <StatCard label="Total" value={`${users.total}`} accent={Colors.secondary} />
          <StatCard label="Actifs" value={`${users.active}`} accent={Colors.accent} />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Nouveaux 7j" value={`+${users.new_7d}`} accent={Colors.accentDark} />
          <StatCard label="Nouveaux 30j" value={`+${users.new_30d}`} accent={Colors.warning} />
        </View>

        {/* === SECTION 2: COMMUNAUTÉS === */}
        <SectionTitle>🤝 Communautés</SectionTitle>
        <View style={styles.statsRow}>
          <StatCard label="Tontines actives" value={`${activeGroups.tontines_active}/${activeGroups.tontines}`} accent={Colors.secondary} />
          <StatCard label="Associations" value={`${activeGroups.associations}`} accent={Colors.accent} />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Coopératives" value={`${activeGroups.cooperatives}`} accent={Colors.primary} />
          <StatCard label="Fonds communaut." value={`${funds.count}`} accent={Colors.warning} hint={`Solde : ${formatXAF(funds.balance)}`} />
        </View>

        {/* === SECTION 3: FINANCES === */}
        <SectionTitle>💰 Finances</SectionTitle>
        <View style={styles.statsRow}>
          <StatCard label="Épargne totale" value={formatXAF(analytics.savings_volume)} accent={Colors.accent} hint={`${analytics.savings_count} dépôts`} />
          <StatCard label="Contributions" value={formatXAF(analytics.tontine_contributions_volume)} accent={Colors.secondary} hint={`${analytics.tontine_contributions_count} ops`} />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Paiements Stripe" value={`${payments.count}`} accent={Colors.primary} hint={`${(payments.amount_minor / 100).toFixed(2)} ${payments.currency.toUpperCase()}`} />
          <StatCard label="Commission Hodix (1%)" value={`${commission.toFixed(2)} ${payments.currency.toUpperCase()}`} accent={Colors.accentDark} />
        </View>

        {/* === SECTION 4: IDENTITÉ FINANCIÈRE === */}
        <SectionTitle>🪪 Identité financière</SectionTitle>
        <View style={styles.statsRow}>
          <StatCard label="Trust Score moyen" value={`${avgTrustScore.toFixed(1)}/100`} accent={Colors.accent} />
          <StatCard label="KYC niveau 2" value={`${kyc.level2_approved}`} accent={Colors.secondary} hint={`${kyc.pending_review} en attente`} />
        </View>

        {/* Tier distribution */}
        <View style={{ paddingHorizontal: Spacing.xl, marginTop: 10 }}>
          <Card>
            <Text style={styles.distTitle}>Distribution des niveaux d'identité</Text>
            {[
              { l: "Platinum (81+)", v: tier.platinum, c: "#8B5CF6", Icon: Crown },
              { l: "Gold (61-80)", v: tier.gold, c: "#D4AF37", Icon: Crown },
              { l: "Silver (31-60)", v: tier.silver, c: "#C0C0C0", Icon: Sparkles },
              { l: "Bronze (0-30)", v: tier.bronze, c: "#CD7F32", Icon: Sparkles },
            ].map((r) => (
              <View key={r.l} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <r.Icon color={r.c} size={13} />
                    <Text style={styles.distLbl}>{r.l}</Text>
                  </View>
                  <Text style={styles.distVal}>{r.v} ({Math.round((r.v / totalTier) * 100)}%)</Text>
                </View>
                <View style={styles.distBar}><View style={[styles.distFill, { width: `${(r.v / totalTier) * 100}%`, backgroundColor: r.c }]} /></View>
              </View>
            ))}
          </Card>
        </View>

        {/* Trust score distribution */}
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
                  <Text style={styles.distVal}>{r.v}</Text>
                </View>
                <View style={styles.distBar}><View style={[styles.distFill, { width: `${(r.v / totalDist) * 100}%`, backgroundColor: r.c }]} /></View>
              </View>
            ))}
          </Card>
        </View>

        {/* Charts */}
        <SectionTitle>📊 Tendances (14 jours)</SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl, gap: 12 }}>
          <Card>
            <LineChart title="Volume d'épargne" data={savings?.series ?? []} color={Colors.accent} format={(v) => formatXAF(v)} />
          </Card>
          <Card>
            <LineChart title="Nouveaux utilisateurs" data={usersSeries?.series ?? []} color={Colors.secondary} format={(v) => `${v.toFixed(0)}`} />
          </Card>
        </View>

        {/* Full admin link */}
        <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.lg }}>
          <TouchableOpacity onPress={() => router.push("/admin")} testID="admin-open-console">
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
              <View style={[styles.linkIcon, { backgroundColor: Colors.primary }]}>
                <ShieldAlert color="#fff" size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>Console Admin complète</Text>
                <Text style={styles.linkDesc}>Utilisateurs, audit logs, promotions, KYC, modération</Text>
              </View>
              <ChevronRight color={Colors.textMuted} size={20} />
            </Card>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.xl, marginBottom: 6 }}>
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.xl },
  rolePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start", marginBottom: 6 },
  rolePillText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  hello: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },
  name: { color: Colors.primary, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  bellWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  alertCard: { backgroundColor: "#FEF3C7", marginHorizontal: Spacing.xl, padding: 14, borderRadius: Radius.xl, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#FCD34D", marginBottom: 12 },
  alertIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.warning, alignItems: "center", justifyContent: "center" },
  alertTitle: { color: "#92400E", fontSize: 13, fontWeight: "800" },
  alertDesc: { color: "#92400E", fontSize: 11, marginTop: 2, fontWeight: "600" },
  hero: { borderRadius: Radius.xxl, padding: 22 },
  heroLbl: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  heroVal: { color: "#fff", fontSize: 36, fontWeight: "900", letterSpacing: -1, marginTop: 6 },
  heroRow: { flexDirection: "row", gap: 28, marginTop: 18, paddingTop: 18, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  heroStLbl: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "600", letterSpacing: 0.3 },
  heroStVal: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 2 },
  statsRow: { flexDirection: "row", paddingHorizontal: Spacing.xl, gap: 10, marginTop: 8 },
  sectionTitle: { color: Colors.primary, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },
  distTitle: { color: Colors.text, fontSize: 14, fontWeight: "800", marginBottom: 4, letterSpacing: -0.2 },
  distLbl: { color: Colors.text, fontSize: 12, fontWeight: "600" },
  distVal: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  distBar: { height: 6, backgroundColor: Colors.surfaceAlt, borderRadius: 3, overflow: "hidden" },
  distFill: { height: "100%", borderRadius: 3 },
  linkIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  linkTitle: { color: Colors.text, fontWeight: "800", fontSize: 14 },
  linkDesc: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
});
