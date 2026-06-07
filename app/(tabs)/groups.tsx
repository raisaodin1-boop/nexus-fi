import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Users, Plus, ChevronRight, Wallet, Building2, Coins } from "lucide-react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { useAuth } from "@/src/auth-context";
import { api, formatXAF } from "@/src/api";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

interface Group { id: string; name: string; type: "tontine" | "association" | "cooperative"; total_pot?: number; members_count?: number; my_balance?: number; status?: string }

const TYPE_LABELS: Record<string, string> = { tontine: "Tontine", association: "Association", cooperative: "Coopérative" };
const TYPE_COLORS: Record<string, string> = { tontine: Colors.primary, association: Colors.secondary, cooperative: Colors.accent };
const TYPE_ICONS: Record<string, any> = { tontine: Coins, association: Users, cooperative: Building2 };

export default function GroupsTab() {
  const router = useRouter();
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "tontine" | "association" | "cooperative">("all");

  const load = useCallback(async () => {
    try {
      const [t, a, c] = await Promise.all([
        api.get<{ items: any[] }>("/tontines?member=true").catch(() => ({ items: [] })),
        api.get<{ items: any[] }>("/associations?member=true").catch(() => ({ items: [] })),
        api.get<{ items: any[] }>("/cooperatives?member=true").catch(() => ({ items: [] })),
      ]);
      const all: Group[] = [
        ...(t.items ?? []).map((x: any) => ({ ...x, type: "tontine" as const })),
        ...(a.items ?? []).map((x: any) => ({ ...x, type: "association" as const })),
        ...(c.items ?? []).map((x: any) => ({ ...x, type: "cooperative" as const })),
      ];
      setGroups(all);
    } catch { setGroups([]); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const isManager = user?.role === "tontine_manager" || user?.role === "super_admin";
  const filtered = filter === "all" ? groups : groups.filter(g => g.type === filter);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Mes Groupes</Text>
            <Text style={styles.headerSub}>{groups.length} groupe{groups.length !== 1 ? "s" : ""}</Text>
          </View>
          {isManager && (
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.createBtn} onPress={() => router.push("/tontines/create")}>
                <Plus size={16} color="#fff" />
                <Text style={styles.createBtnText}>Tontine</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersBar} contentContainerStyle={{ gap: 8, paddingHorizontal: Spacing.xl }}>
        {(["all", "tontine", "association", "cooperative"] as const).map(f => (
          <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === "all" ? "Tous" : TYPE_LABELS[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Users size={48} color={Colors.border} />
          <Text style={styles.emptyTitle}>Aucun groupe</Text>
          <Text style={styles.emptyText}>Rejoignez ou créez un groupe pour commencer.</Text>
          <TouchableOpacity style={styles.joinBtn} onPress={() => router.push("/join")}>
            <Text style={styles.joinBtnText}>Rejoindre un groupe</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: Spacing.xl, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          renderItem={({ item }) => {
            const Icon = TYPE_ICONS[item.type];
            const color = TYPE_COLORS[item.type];
            return (
              <TouchableOpacity style={styles.card} onPress={() => router.push(`/${item.id}`)}>
                <View style={[styles.cardIcon, { backgroundColor: color + "18" }]}>
                  <Icon size={22} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardType}>{TYPE_LABELS[item.type]}</Text>
                  {item.total_pot != null && (
                    <Text style={styles.cardStat}>{formatXAF(item.total_pot)} · {item.members_count ?? 0} membres</Text>
                  )}
                </View>
                <ChevronRight size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: Spacing.xl, paddingTop: Spacing.xxl, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  headerActions: { flexDirection: "row", gap: 8 },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full },
  createBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  filtersBar: { marginTop: Spacing.md, maxHeight: 52 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  filterTextActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: Spacing.xxxl },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  joinBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.full, marginTop: 8 },
  joinBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: 14, ...(Shadow.card as object) },
  cardIcon: { width: 48, height: 48, borderRadius: Radius.md, alignItems: "center", justifyContent: "center" },
  cardName: { fontSize: 15, fontWeight: "700", color: Colors.text },
  cardType: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  cardStat: { fontSize: 12, color: Colors.primary, marginTop: 4, fontWeight: "600" },
});
