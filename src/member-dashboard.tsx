// Member dashboard — premium personal fintech home.
import { useCallback, useRef, useState } from "react";
import {
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
import { Bell, ChevronRight, PiggyBank, Trophy, Users, Wallet, TrendingUp, Sparkles, QrCode, BarChart2, Brain, Repeat, Receipt, PieChart, MessageCircle, CreditCard, Store, Gavel, Target } from "lucide-react-native";

import { useAuth } from "@/src/auth-context";
import { api, formatXAF } from "@/src/api";
import { supabase } from "@/src/supabase";
import { Card, SectionTitle, StatCard, SkeletonBox, SkeletonCard } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { EngagementStrip } from "@/src/engagement-strip";
import { MemberDashboardHero } from "@/src/member-dashboard-hero";
import { LineChart } from "@/src/charts";
import { debounce } from "@/src/utils/debounce";
import { useResponsive } from "@/src/hooks/use-responsive";

interface Summary { total_saved: number; total_target: number; active_goals: number; progress_pct: number; currency: string }
interface TrustScore {
  score: number; level: string; risk: string; color: string;
  components: Record<string, number>; tips: string[];
  stats: { total_saved: number; tontines: number; associations: number; cooperatives: number; deposits_90d: number; contributions_made: number; account_age_days: number };
}
interface Insight { text: string; kind: string; route?: string; action_label?: string }
interface Series { days: number; series: { date: string; value: number }[] }

export function MemberDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { horizontalPad, isCompact } = useResponsive();
  const contentPad = { paddingHorizontal: horizontalPad };
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trust, setTrust] = useState<TrustScore | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [unread, setUnread] = useState(0);
  const [msgUnread, setMsgUnread] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [savingsSeries, setSavingsSeries] = useState<Series | null>(null);
  const [streakWeeks, setStreakWeeks] = useState(0);

  const load = useCallback(async (opts?: { secondaryOnly?: boolean }) => {
    const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch { return null; }
    };

    if (!opts?.secondaryOnly) {
      const [s, t, n] = await Promise.all([
        safe(() => api.get<Summary>("/savings/summary")),
        safe(() => api.get<TrustScore>("/trust-score")),
        safe(() => api.get<{ unread_count: number }>("/notifications")),
      ]);
      if (s) setSummary(s);
      if (t) setTrust(t);
      if (n) setUnread(n.unread_count ?? 0);
      setLoading(false);
    }

    const [i, ss, al, st, mu] = await Promise.all([
      safe(() => api.get<{ items: Insight[] }>("/insights")),
      safe(() => api.get<Series>("/analytics/me/savings?days=14")),
      safe(() => api.get<any[]>("/alerts")),
      safe(() => api.get<{ current_streak?: number }>("/streaks")),
      safe(() => api.get<{ unread_count: number }>("/messages/unread-count")),
    ]);
    if (i) setInsights(i.items ?? []);
    if (ss) setSavingsSeries(ss);
    if (al) setAlertCount(Array.isArray(al) ? al.length : 0);
    if (st) setStreakWeeks(st.current_streak ?? 0);
    if (mu) setMsgUnread(mu.unread_count ?? 0);
  }, []);

  const loadDebouncedRef = useRef(debounce(() => { load({ secondaryOnly: true }); }, 500));

  // Real-time: subscribe only while screen is focused, auto-cleanup on blur
  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
    const userId = user?.id;
    if (!userId) return;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const debouncedReload = loadDebouncedRef.current;

    const ch = supabase
      .channel(`rt-dashboard-member-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "savings_transactions", filter: `user_id=eq.${userId}` }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "savings_goals", filter: `user_id=eq.${userId}` }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "tontine_contributions", filter: `user_id=eq.${userId}` }, debouncedReload)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, debouncedReload)
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          // Real-time down — fall back to 30s polling
          console.warn("[dashboard] real-time subscription failed, switching to polling:", status);
          if (!pollTimer) pollTimer = setInterval(() => { load({ secondaryOnly: true }); }, 30_000);
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
          <View style={{ ...contentPad, paddingTop: Spacing.lg }}>
            <SkeletonBox height={280} borderRadius={20} />
          </View>
          <View style={[styles.statsRow, contentPad]}>
            <SkeletonBox height={80} borderRadius={16} style={{ flex: 1, minWidth: 0 }} />
            <SkeletonBox height={80} borderRadius={16} style={{ flex: 1, minWidth: 0 }} />
          </View>
          <View style={[styles.statsRow, contentPad]}>
            <SkeletonBox height={80} borderRadius={16} style={{ flex: 1, minWidth: 0 }} />
            <SkeletonBox height={80} borderRadius={16} style={{ flex: 1, minWidth: 0 }} />
          </View>
          <View style={{ ...contentPad, marginTop: 12, gap: 10 }}>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ ...contentPad, paddingTop: Spacing.lg }}>
          <MemberDashboardHero
            firstName={user?.full_name?.split(" ")[0]}
            trustScore={trust?.score ?? user?.trust_score ?? undefined}
            trustLevel={trust?.level}
            totalSaved={summary?.total_saved}
            currency={summary?.currency}
            unread={unread}
          />
        </View>

        {/* Alerts row */}
        <TouchableOpacity
          onPress={() => router.push("/alerts" as any)}
          activeOpacity={0.85}
          style={[styles.alertsRow, { marginHorizontal: horizontalPad }]}
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

        <EngagementStrip
          streakWeeks={streakWeeks}
          savingsProgressPct={summary?.progress_pct ?? 0}
          trustScore={trust?.score ?? user?.trust_score ?? undefined}
        />

        {/* Stats */}
        <View style={[styles.statsRow, { paddingHorizontal: horizontalPad }]}>
          <StatCard label="Total épargné" value={formatXAF(summary?.total_saved ?? 0, summary?.currency)} hint={summary && summary.total_target > 0 ? `${summary.progress_pct}% de l'objectif` : "Aucun objectif"} accent={Colors.accent} testID="stat-total-saved" />
          <StatCard label="Objectifs actifs" value={`${summary?.active_goals ?? 0}`} hint="Créez-en plus !" accent={Colors.secondary} testID="stat-active-goals" />
        </View>
        <View style={[styles.statsRow, { paddingHorizontal: horizontalPad }]}>
          <StatCard label="Tontines" value={`${trust?.stats.tontines ?? 0}`} hint="participations" accent={Colors.primary} />
          <StatCard label="Groupes" value={`${(trust?.stats.associations ?? 0) + (trust?.stats.cooperatives ?? 0)}`} hint="associations + coop." accent={Colors.accent} />
        </View>

        {/* Chart - savings 14d */}
        <View style={{ ...contentPad, marginTop: Spacing.lg }}>
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
        <SectionTitle style={contentPad}>Actions rapides</SectionTitle>
        <View style={[styles.qaRow, contentPad]}>
          <QuickAction icon={<PiggyBank color={Colors.accent} size={22} />} label="Nouvel objectif" onPress={() => router.push("/savings/create")} testID="home-action-savings" compact={isCompact} />
          <QuickAction icon={<Users color={Colors.secondary} size={22} />} label="Tontine" onPress={() => router.push("/(tabs)/groups")} testID="home-action-group" compact={isCompact} />
        </View>
        <View style={[styles.qaRow, contentPad]}>
          <QuickAction icon={<Wallet color={Colors.primary} size={22} />} label="Fonds Communautaire" onPress={() => router.push("/funds/create")} testID="home-action-fund" compact={isCompact} />
          <QuickAction icon={<TrendingUp color={Colors.accentDark} size={22} />} label="Mon Identité" onPress={() => router.push("/(tabs)/identity")} testID="home-action-identity" compact={isCompact} />
        </View>
        <View style={[styles.qaRow, contentPad]}>
          <QuickAction icon={<QrCode color={Colors.secondary} size={22} />} label="Recevoir" onPress={() => router.push("/qr-receive")} testID="home-action-qr-receive" compact={isCompact} />
          <QuickAction icon={<Wallet color={Colors.primary} size={22} />} label="Mon Wallet" onPress={() => router.push("/wallet")} testID="home-action-wallet" compact={isCompact} />
        </View>
        <View style={[styles.qaRow, contentPad]}>
          <QuickAction icon={<BarChart2 color={Colors.secondary} size={22} />} label="Tableau de bord" onPress={() => router.push("/analytics")} testID="home-action-analytics" compact={isCompact} />
          <QuickAction icon={<Users color={Colors.primary} size={22} />} label="Famille" onPress={() => router.push("/family")} testID="home-action-family" compact={isCompact} />
        </View>
        <View style={[styles.qaRow, contentPad]}>
          <QuickAction icon={<Trophy color={Colors.accent} size={22} />} label="Classement" onPress={() => router.push("/ranking")} testID="home-action-ranking" compact={isCompact} />
          <QuickAction icon={<Brain color={Colors.brandNavyLight} size={22} />} label="Conseiller IA" onPress={() => router.push("/advisor")} testID="home-action-advisor" compact={isCompact} />
        </View>
        <View style={[styles.qaRow, contentPad]}>
          <QuickAction icon={<Repeat color={Colors.primary} size={22} />} label="Auto-épargne" onPress={() => router.push("/auto-savings")} testID="home-action-auto-savings" compact={isCompact} />
          <QuickAction icon={<PieChart color={Colors.warning} size={22} />} label="Mon budget" onPress={() => router.push("/budget")} testID="home-action-budget" compact={isCompact} />
        </View>
        <View style={[styles.qaRow, contentPad]}>
          <QuickAction icon={<MessageCircle color={Colors.secondary} size={22} />} label="Messagerie" onPress={() => router.push("/messages")} testID="home-action-messages" badge={msgUnread} compact={isCompact} />
          <QuickAction icon={<Receipt color={Colors.accent} size={22} />} label="Partager facture" onPress={() => router.push("/split-expense")} testID="home-action-split" compact={isCompact} />
        </View>
        <View style={styles.qaRow}>
          <QuickAction icon={<Gavel color="#7C3AED" size={22} />} label="Enchères Tontine" onPress={() => router.push("/tontine-auction" as any)} testID="home-action-auction" />
          <QuickAction icon={<Target color="#10B981" size={22} />} label="Objectif Collectif" onPress={() => router.push("/collective-goal" as any)} testID="home-action-collective" />
        </View>
        <View style={styles.qaRow}>
          <QuickAction icon={<CreditCard color="#0B1F3A" size={22} />} label="Carte Virtuelle" onPress={() => router.push("/virtual-card" as any)} testID="home-action-virtual-card" />
          <QuickAction icon={<Store color="#EF4444" size={22} />} label="HODIX Pay Pro" onPress={() => router.push("/merchant-qr" as any)} testID="home-action-merchant" />
        </View>

        {/* Promotion CTA for members */}
        {user?.role === "member" ? (
          <View style={{ ...contentPad, marginTop: Spacing.lg }}>
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
        <SectionTitle style={contentPad}>Vos insights</SectionTitle>
        <View style={contentPad}>
          {insights.slice(0, 4).map((it, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.85}
              onPress={() => it.route && router.push(it.route as any)}
              testID={`home-insight-${i}`}
            >
              <Card style={{ marginBottom: 10, padding: 16 }}>
                <Text style={styles.insightText}>{it.text}</Text>
                {it.action_label ? (
                  <Text style={styles.insightAction}>{it.action_label} →</Text>
                ) : null}
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress, testID, badge, compact }: { icon: React.ReactNode; label: string; onPress: () => void; testID?: string; badge?: number; compact?: boolean }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.qa, compact && styles.qaCompact, Shadow.card]} testID={testID}>
      <View style={styles.qaIconBox}>
        {icon}
        {badge && badge > 0 ? (
          <View style={styles.qaBadge}>
            <Text style={styles.qaBadgeText}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.qaLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  alertsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  statsRow: { flexDirection: "row", gap: 10, marginTop: 12, minWidth: 0 },
  qaRow: { flexDirection: "row", gap: 10, marginBottom: 10, minWidth: 0 },
  qa: { flex: 1, minWidth: 0, backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, flexDirection: "row", alignItems: "center", gap: 12 },
  qaCompact: { padding: Spacing.md, gap: 10 },
  qaIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center", position: "relative" },
  qaBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  qaBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  qaLabel: { color: Colors.text, fontWeight: "700", fontSize: 13, flex: 1, minWidth: 0 },
  promoCta: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: Radius.xl },
  promoTitle: { color: "#fff", fontWeight: "900", fontSize: 14 },
  promoDesc: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2, fontWeight: "600" },
  insightText: { color: Colors.text, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  insightAction: { color: Colors.primary, fontSize: 12, fontWeight: "700", marginTop: 8 },
});
