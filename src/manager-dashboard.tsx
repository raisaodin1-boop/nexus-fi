// Manager dashboard component — used inside (tabs)/index.tsx when role is tontine_manager.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Users, Building2, Network, Wallet, TrendingUp, Activity, Plus, Bell, ChevronRight } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { Card, SectionTitle, StatCard } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { LineChart } from "@/src/charts";
import { useAuth } from "@/src/auth-context";
import { Tooltip } from "@/src/tooltip";

interface Overview {
  groups: { tontines: number; associations: number; cooperatives: number; funds: number };
  total_members: number;
  total_collected: number;
  avg_compliance: number;
  health_score: number;
  new_members_30d: number;
  tontines: any[];
  currency: string;
}
interface Series { days: number; series: { date: string; value: number }[] }

export function ManagerDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch { return null; }
    };
    const [o, s, n] = await Promise.all([
      safe(() => api.get<Overview>("/manager/overview")),
      safe(() => api.get<Series>("/analytics/me/contributions?days=14")),
      safe(() => api.get<{ unread_count: number }>("/notifications")),
    ]);
    if (o) setOverview(o);
    if (s) setSeries(s);
    if (n) setUnread(n.unread_count ?? 0);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !overview) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={Colors.secondary} size="large" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Tooltip
        tip={{
          id: "manager-welcome",
          title: "Bienvenue, Tontine Manager !",
          body: "Vous avez accès à un centre de commande dédié : Community Health Score, taux de conformité, et création illimitée de tontines, associations, coopératives et fonds.",
          cta: "Découvrir",
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <View style={styles.rolePill}><Text style={styles.rolePillText}>TONTINE MANAGER</Text></View>
            <Text style={styles.hello}>Centre de commande</Text>
            <Text style={styles.name}>{user?.full_name?.split(" ")[0]}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/notifications")} style={styles.bellWrap} testID="manager-notif-btn">
            <Bell color={Colors.primary} size={22} />
            {unread > 0 ? <View style={styles.bellDot}><Text style={styles.bellDotText}>{unread}</Text></View> : null}
          </TouchableOpacity>
        </View>

        {/* Hero: Community Health */}
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <LinearGradient colors={[Colors.primary, Colors.gradMid, Colors.secondary]} style={[styles.hero, Shadow.cardDark]}>
            <Text style={styles.heroLbl}>Community Health Score</Text>
            <Text style={styles.heroVal}>{overview.health_score.toFixed(0)}<Text style={styles.heroOf}> / 100</Text></Text>
            <View style={styles.heroBar}>
              <View style={[styles.heroFill, { width: `${Math.min(100, overview.health_score)}%` }]} />
            </View>
            <View style={styles.heroStats}>
              <View><Text style={styles.heroStLbl}>Conformité</Text><Text style={styles.heroStVal}>{overview.avg_compliance}%</Text></View>
              <View><Text style={styles.heroStLbl}>Membres</Text><Text style={styles.heroStVal}>{overview.total_members}</Text></View>
              <View><Text style={styles.heroStLbl}>Nouveaux (30j)</Text><Text style={styles.heroStVal}>{overview.new_members_30d}</Text></View>
            </View>
          </LinearGradient>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatCard label="Total collecté" value={formatXAF(overview.total_collected)} accent={Colors.accent} testID="manager-stat-collected" />
          <StatCard label="Membres" value={`${overview.total_members}`} hint={`+${overview.new_members_30d} ce mois`} accent={Colors.secondary} testID="manager-stat-members" />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Tontines" value={`${overview.groups.tontines}`} accent={Colors.primary} />
          <StatCard label="Associations" value={`${overview.groups.associations}`} accent={Colors.accentDark} />
          <StatCard label="Coop." value={`${overview.groups.cooperatives}`} accent={Colors.warning} />
        </View>

        {/* Chart: contributions */}
        <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.lg }}>
          <Card>
            <LineChart
              title="Contributions reçues (14 derniers jours)"
              data={series?.series ?? []}
              color={Colors.accent}
              format={(v) => formatXAF(v)}
            />
          </Card>
        </View>

        {/* Quick actions */}
        <SectionTitle>Actions Manager</SectionTitle>
        <View style={styles.qaGrid}>
          <ManagerAction icon={<Users color={Colors.accent} size={20} />} label="Créer une tontine" onPress={() => router.push("/tontines/create")} testID="manager-create-tontine" />
          <ManagerAction icon={<Building2 color={Colors.secondary} size={20} />} label="Créer une association" onPress={() => router.push("/associations/create")} testID="manager-create-assoc" />
          <ManagerAction icon={<Network color={Colors.primary} size={20} />} label="Créer une coopérative" onPress={() => router.push("/cooperatives/create")} testID="manager-create-coop" />
          <ManagerAction icon={<Wallet color={Colors.accentDark} size={20} />} label="Créer un fonds" onPress={() => router.push("/funds/create")} testID="manager-create-fund" />
        </View>

        {/* My tontines list */}
        <SectionTitle action={
          <TouchableOpacity onPress={() => router.push("/(tabs)/groups")} testID="manager-see-all-tontines">
            <Text style={styles.linkText}>Voir tout</Text>
          </TouchableOpacity>
        }>
          Mes Tontines
        </SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl, gap: 10 }}>
          {overview.tontines.length === 0 ? (
            <Card>
              <Text style={{ color: Colors.textMuted, textAlign: "center", padding: 16 }}>
                Aucune tontine pour l'instant. Créez-en une !
              </Text>
            </Card>
          ) : overview.tontines.map((t) => (
            <TouchableOpacity key={t.id} testID={`manager-tontine-${t.id}`} activeOpacity={0.85} onPress={() => router.push(`/tontines/${t.id}` as any)}>
              <Card style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12 }}>
                <View style={[styles.tontineIcon, { backgroundColor: Colors.accent + "20" }]}>
                  <Users color={Colors.accent} size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tontineName}>{t.name}</Text>
                  <Text style={styles.tontineMeta}>
                    {t.members_count}/{t.max_members} membres · Cycle {t.current_cycle} · {formatXAF(t.total_collected, t.currency)}
                  </Text>
                </View>
                <ChevronRight color={Colors.textSubtle} size={18} />
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ManagerAction({ icon, label, onPress, testID }: { icon: React.ReactNode; label: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} testID={testID} style={[styles.qa, Shadow.card]}>
      <View style={styles.qaIcon}>{icon}</View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.xl },
  rolePill: { backgroundColor: Colors.accent + "20", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start", marginBottom: 6, borderWidth: 1, borderColor: Colors.accent + "40" },
  rolePillText: { color: Colors.accentDark, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  hello: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },
  name: { color: Colors.primary, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  bellWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, position: "relative" },
  bellDot: { position: "absolute", top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  bellDotText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  hero: { borderRadius: Radius.xxl, padding: 22 },
  heroLbl: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  heroVal: { color: "#fff", fontSize: 48, fontWeight: "900", letterSpacing: -1.5, marginTop: 4 },
  heroOf: { color: "rgba(255,255,255,0.5)", fontSize: 16 },
  heroBar: { marginTop: 8, height: 8, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 4, overflow: "hidden" },
  heroFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 4 },
  heroStats: { flexDirection: "row", gap: 24, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  heroStLbl: { color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },
  heroStVal: { color: "#fff", fontSize: 14, fontWeight: "800", marginTop: 2 },
  statsRow: { flexDirection: "row", paddingHorizontal: Spacing.xl, gap: 10, marginTop: 12 },
  qaGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: Spacing.xl, gap: 10 },
  qa: { width: "48%", backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  qaIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  qaLabel: { color: Colors.text, fontWeight: "700", fontSize: 13 },
  linkText: { color: Colors.secondary, fontWeight: "700", fontSize: 13 },
  tontineIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tontineName: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  tontineMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 2, fontWeight: "600" },
});
