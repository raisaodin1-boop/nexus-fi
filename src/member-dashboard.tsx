// Member dashboard — premium personal fintech home.
import { useCallback, useEffect, useState } from "react";
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Bell, ChevronRight, PiggyBank, Trophy, Users, Wallet, TrendingUp, Sparkles, QrCode, BarChart2 } from "lucide-react-native";

import { useAuth } from "@/src/auth-context";
import { api, formatXAF } from "@/src/api";
import { supabase } from "@/src/supabase";
import { Card, SectionTitle, StatCard, SkeletonBox, SkeletonCard } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { TrustGauge } from "@/src/trust-gauge";
import { LineChart } from "@/src/charts";
import { Tooltip } from "@/src/tooltip";

interface Summary { total_saved: number; total_target: number; active_goals: number; progress_pct: number; currency: string }
interface TrustScore {
  score: number; level: string; risk: string; color: string;
  components: Record<string, number>; tips: string[];
  stats: { total_saved: number; tontines: number; associations: number; cooperatives: number; deposits_90d: number; contributions_made: number; account_age_days: number };
}
interface Insight { text: string; kind: string }
interface Series { days: number; series: { date: string; value: number }[] }

export function MemberDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trust, setTrust] = useState<TrustScore | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [unread, setUnread] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [savingsSeries, setSavingsSeries] = useState<Series | null>(null);

  const load = useCallback(async () => {
    const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch { return null; }
    };
    const [s, t, i, n, ss, al] = await Promise.all([
      safe(() => api.get<Summary>("/savings/summary")),
      safe(() => api.get<TrustScore>("/trust-score")),
      safe(() => api.get<{ items: Insight[] }>("/insights")),
      safe(() => api.get<{ unread_count: number }>("/notifications")),
      safe(() => api.get<Series>("/analytics/me/savings?days=14")),
      safe(() => api.get<any[]>("/alerts")),
    ]);
    if (s) setSummary(s);
    if (t) setTrust(t);
    if (i) setInsights(i.items ?? []);
    if (n) setUnread(n.unread_count ?? 0);
    if (ss) setSavingsSeries(ss);
    if (al) setAlertCount(Array.isArray(al) ? al.length : 0);
    setLoading(false);
  }, []);

  // Real-time: subscribe only while screen is focused, auto-cleanup on blur
  useFocusEffect(useCallback(() => {
    load();
    const userId = user?.id;
    if (!userId) return;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const ch = supabase
      .channel(`rt-dashboard-member-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "savings_transactions", filter: `user_id=eq.${userId}` }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "savings_goals", filter: `user_id=eq.${userId}` }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "tontine_contributions", filter: `user_id=eq.${userId}` }, () => { load(); })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          // Real-time down — fall back to 30s polling
          console.warn("[dashboard] real-time subscription failed, switching to polling:", status);
          if (!pollTimer) pollTimer = setInterval(() => { load(); }, 30_000);
        } else if (status === "SUBSCRIBED" && pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      });
    return () => {
      supabase.removeChannel(ch);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [load, user?.id]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={styles.header}>
            <View style={{ gap: 8 }}>
              <SkeletonBox width={80} height={14} />
              <SkeletonBox width={140} height={26} />
            </View>
            <SkeletonBox width={44} height={44} borderRadius={22} />
          </View>
          <View style={{ paddingHorizontal: Spacing.xl }}>
            <SkeletonBox height={200} borderRadius={20} />
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
            <SkeletonCard />
            <SkeletonCard />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>Bienvenue,</Text>
            <Text style={styles.name}>{user?.full_name?.split(" ")[0] ?? "User"}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/notifications")} testID="home-notif-btn" style={styles.bellWrap}>
            <Bell color={Colors.primary} size={22} />
            {unread > 0 ? <View style={styles.bellDot}><Text style={styles.bellDotText}>{unread > 9 ? "9+" : unread}</Text></View> : null}
          </TouchableOpacity>
        </View>

        {/* Alerts row */}
        <TouchableOpacity
          onPress={() => router.push("/alerts" as any)}
          activeOpacity={0.85}
          style={styles.alertsRow}
          testID="home-alerts-btn"
        >
          <Bell color={alertCount > 0 ? Colors.warning : Colors.textMuted} size={16} />
          <Text style={[styles.alertsRowText, alertCount > 0 && { color: Colors.warning }]}>
            Alertes intelligentes
          </Text>
          {alertCount > 0 ? (
            <View style={styles.alertsBadge}>
              <Text style={styles.alertsBadgeText}>{alertCount}</Text>
            </View>
          ) : null}
          <Text style={{ color: Colors.textMuted, fontSize: 14, marginLeft: "auto" }}>›</Text>
        </TouchableOpacity>

        {/* Trust Score card */}
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <TouchableOpacity activeOpacity={0.9} onPress={() => router.push("/(tabs)/identity")} testID="home-trust-card">
            <LinearGradient
              colors={[Colors.primary, Colors.gradMid, Colors.secondary]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.scoreCard, Shadow.cardDark]}
            >
              <View style={styles.scoreHeader}>
                <View>
                  <Text style={styles.scoreLabel}>Score Hodix</Text>
                  <Text style={styles.scoreRisk}>Risque {trust?.risk}</Text>
                </View>
                <View style={[styles.glow, { backgroundColor: trust?.color ?? Colors.accent }]} />
              </View>
              {trust ? <TrustGauge score={trust.score} level={trust.level} color={trust.color} size={220} /> : null}
              <View style={styles.scoreFooter}>
                <Text style={styles.scoreFooterText}>Voir mon identité financière</Text>
                <ChevronRight color="rgba(255,255,255,0.7)" size={16} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard label="Total épargné" value={formatXAF(summary?.total_saved ?? 0, summary?.currency)} hint={summary && summary.total_target > 0 ? `${summary.progress_pct}% de l'objectif` : "Aucun objectif"} accent={Colors.accent} testID="stat-total-saved" />
          <StatCard label="Objectifs actifs" value={`${summary?.active_goals ?? 0}`} hint="Créez-en plus !" accent={Colors.secondary} testID="stat-active-goals" />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Tontines" value={`${trust?.stats.tontines ?? 0}`} hint="participations" accent={Colors.primary} />
          <StatCard label="Groupes" value={`${(trust?.stats.associations ?? 0) + (trust?.stats.cooperatives ?? 0)}`} hint="associations + coop." accent={Colors.accent} />
        </View>

        {/* Chart - savings 14d */}
        <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.lg }}>
          <Card>
            <LineChart
              title="Mon épargne — 14 derniers jours"
              data={savingsSeries?.series ?? []}
              color={Colors.accent}
              format={(v) => formatXAF(v)}
            />
          </Card>
        </View>

        {/* Quick actions */}
        <SectionTitle>Actions rapides</SectionTitle>
        <View style={styles.qaRow}>
          <QuickAction icon={<PiggyBank color={Colors.accent} size={22} />} label="Nouvel objectif" onPress={() => router.push("/savings/create")} testID="home-action-savings" />
          <QuickAction icon={<Users color={Colors.secondary} size={22} />} label="Tontine" onPress={() => router.push("/(tabs)/groups")} testID="home-action-group" />
        </View>
        <View style={styles.qaRow}>
          <QuickAction icon={<Wallet color={Colors.primary} size={22} />} label="Fonds Communautaire" onPress={() => router.push("/funds/create")} testID="home-action-fund" />
          <QuickAction icon={<TrendingUp color={Colors.accentDark} size={22} />} label="Mon Identité" onPress={() => router.push("/(tabs)/identity")} testID="home-action-identity" />
        </View>
        <View style={styles.qaRow}>
          <QuickAction icon={<QrCode color="#7C3AED" size={22} />} label="Recevoir" onPress={() => router.push("/qr-receive")} testID="home-action-qr-receive" />
          <QuickAction icon={<Wallet color="#10B981" size={22} />} label="Mon Wallet" onPress={() => router.push("/wallet")} testID="home-action-wallet" />
        </View>
        <View style={styles.qaRow}>
          <QuickAction icon={<BarChart2 color={Colors.secondary} size={22} />} label="Tableau de bord" onPress={() => router.push("/analytics")} testID="home-action-analytics" />
          <QuickAction icon={<Users color={Colors.primary} size={22} />} label="Famille" onPress={() => router.push("/family")} testID="home-action-family" />
        </View>
        <View style={styles.qaRow}>
          <QuickAction icon={<Trophy color={Colors.accent} size={22} />} label="Classement" onPress={() => router.push("/ranking")} testID="home-action-ranking" />
          <View style={{ flex: 1 }} />
        </View>

        {/* Promotion CTA for members */}
        {user?.role === "member" ? (
          <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.lg }}>
            <TouchableOpacity onPress={() => router.push("/promotion-request")} testID="home-promotion-cta">
              <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={[styles.promoCta, Shadow.card]}>
                <Sparkles color="#fff" size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.promoTitle}>Devenir Tontine Manager</Text>
                  <Text style={styles.promoDesc}>Créer des tontines illimitées, gérer associations et coopératives.</Text>
                </View>
                <ChevronRight color="#fff" size={20} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Insights */}
        <SectionTitle>Vos insights</SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl }}>
          {insights.slice(0, 4).map((it, i) => (
            <Card key={i} style={{ marginBottom: 10, padding: 16 }}>
              <Text style={styles.insightText}>{it.text}</Text>
            </Card>
          ))}
        </View>

        {/* Hero image */}
        <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.lg }}>
          <View style={[styles.heroCard, Shadow.card]}>
            <Image
              source={{ uri: "https://images.unsplash.com/photo-1694286066858-462538cd9886?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njl8MHwxfHNlYXJjaHwzfHxhZnJpY2FuJTIwcGVvcGxlJTIwc2F2aW5nJTIwbW9uZXklMjBzbWlsaW5nfGVufDB8fHx8MTc4MDE3MTQ5N3ww&ixlib=rb-4.1.0&q=85" }}
              style={styles.heroImg}
              resizeMode="cover"
            />
            <LinearGradient colors={["transparent", "rgba(11,31,58,0.95)"]} style={styles.heroOverlay} />
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>Bâtir ensemble, durablement.</Text>
              <Text style={styles.heroSub}>Hodix transforme votre épargne en histoire financière reconnue.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress, testID }: { icon: React.ReactNode; label: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.qa, Shadow.card]} testID={testID}>
      <View style={styles.qaIconBox}>{icon}</View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg },
  hello: { color: Colors.textMuted, fontSize: 14, fontWeight: "600" },
  name: { color: Colors.primary, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  bellWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  bellDot: { position: "absolute", top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  bellDotText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  alertsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  alertsRowText: { color: Colors.textMuted, fontSize: 13, fontWeight: "700" },
  alertsBadge: {
    backgroundColor: Colors.warning,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: "center",
  },
  alertsBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  scoreCard: { borderRadius: Radius.xxl, padding: 24, overflow: "hidden" },
  scoreHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  scoreLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  scoreRisk: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 4 },
  glow: { width: 18, height: 18, borderRadius: 9 },
  scoreFooter: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  scoreFooterText: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },
  statsRow: { flexDirection: "row", paddingHorizontal: Spacing.xl, gap: 10, marginTop: 12, minWidth: 0 },
  qaRow: { flexDirection: "row", paddingHorizontal: Spacing.xl, gap: 10, marginBottom: 10 },
  qa: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, flexDirection: "row", alignItems: "center", gap: 12 },
  qaIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  qaLabel: { color: Colors.text, fontWeight: "700", fontSize: 13, flex: 1 },
  promoCta: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: Radius.xl },
  promoTitle: { color: "#fff", fontWeight: "900", fontSize: 14 },
  promoDesc: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2, fontWeight: "600" },
  insightText: { color: Colors.text, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  heroCard: { borderRadius: Radius.xxl, overflow: "hidden", height: 180, position: "relative" },
  heroImg: { width: "100%", height: "100%" },
  heroOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, top: "30%" },
  heroContent: { position: "absolute", left: 20, right: 20, bottom: 20 },
  heroTitle: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 },
});
