// Notification center — premium redesign
import { useCallback, useState } from "react";
import {
  FlatList, Platform, RefreshControl,
  StyleSheet, Switch, Text, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Bell, CheckCheck, Sparkles, AlertCircle, Info, ChevronRight, ArrowLeft } from "lucide-react-native";

import { api } from "@/src/api";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";
import { SkeletonList } from "@/src/ui";

interface Notif {
  id: string; title: string; body: string; kind: string;
  is_read: boolean; created_at: string; action_url?: string;
}

type FilterKey = "all" | "unread" | "success" | "alert";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "unread", label: "Non lues" },
  { key: "success", label: "Succès" },
  { key: "alert", label: "Alertes" },
];

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins}min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function NotifIcon({ kind }: { kind: string }) {
  const map: Record<string, { Icon: any; color: string }> = {
    success: { Icon: Sparkles, color: Colors.accent },
    warning: { Icon: AlertCircle, color: Colors.warning },
    alert: { Icon: AlertCircle, color: Colors.danger },
    info: { Icon: Info, color: Colors.secondary },
  };
  const { Icon, color } = map[kind] ?? { Icon: Info, color: Colors.secondary };
  return (
    <View style={[styles.iconCircle, { backgroundColor: color + "22" }]}>
      <Icon color={color} size={20} />
    </View>
  );
}

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [pushEnabled, setPushEnabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, me] = await Promise.all([
        api.get<{ items?: Notif[] } | Notif[]>("/notifications"),
        Platform.OS !== "web" ? api.get<{ push_consent?: boolean }>("/users/me") : Promise.resolve(null),
      ]);
      const list = Array.isArray(d) ? d : (d?.items ?? []);
      setItems(list);
      if (me) setPushEnabled(!!me.push_consent);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  const togglePush = async (enabled: boolean) => {
    try {
      await api.post("/notifications/consent", { push_consent: enabled, marketing_consent: enabled });
      setPushEnabled(enabled);
      if (enabled && Platform.OS !== "web") {
        const { requestPushPermissionAndRegister } = await import("@/src/push-notifications");
        await requestPushPermissionAndRegister();
      }
    } catch {}
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markAll = async () => {
    try {
      await api.post("/notifications/read-all");
      setItems((p) => p.map((n) => ({ ...n, is_read: true })));
    } catch {}
  };

  const markRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setItems((p) => p.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch {}
  };

  const filtered = items.filter((n) => {
    if (filter === "unread") return !n.is_read;
    if (filter === "success") return n.kind === "success";
    if (filter === "alert") return n.kind === "alert" || n.kind === "warning";
    return true;
  });

  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Gradient Header */}
      <LinearGradient
        colors={[Colors.primary, Colors.gradMid, Colors.secondary]}
        style={styles.gradHeader}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="notif-back">
            <ArrowLeft color="#fff" size={22} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <Text style={styles.headerSub}>{unreadCount} non lue{unreadCount > 1 ? "s" : ""}</Text>
            )}
          </View>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
          <TouchableOpacity
            testID="notif-mark-all"
            onPress={markAll}
            style={styles.markAllBtn}
          >
            <CheckCheck color="#fff" size={18} />
          </TouchableOpacity>
        </View>

        {/* Filter tabs */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            >
              <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {Platform.OS !== "web" ? (
        <View style={styles.pushRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pushTitle}>Notifications push</Text>
            <Text style={styles.pushSub}>Rappels de cotisation, paiements et alertes sécurité</Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={togglePush}
            trackColor={{ false: Colors.border, true: Colors.secondary }}
            thumbColor="#fff"
            testID="notif-push-toggle"
          />
        </View>
      ) : null}

      {loading ? (
        <View style={{ padding: Spacing.xl }}>
          <SkeletonList count={5} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyBell}>
            <Bell color={Colors.textSubtle} size={40} />
          </View>
          <Text style={styles.emptyTitle}>Tout est calme par ici</Text>
          <Text style={styles.emptyDesc}>
            {filter === "unread"
              ? "Aucune notification non lue."
              : filter === "success"
              ? "Aucune notification de succès."
              : filter === "alert"
              ? "Aucune alerte pour le moment."
              : "Vous serez notifié pour vos contributions, objectifs et trust score."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: Spacing.xl, gap: 10, paddingBottom: 48 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={Colors.secondary}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`notif-${item.id}`}
              activeOpacity={0.85}
              onPress={() => {
                markRead(item.id);
                if (item.action_url) {
                  try { router.push(item.action_url as any); } catch {}
                }
              }}
            >
              <View style={[styles.card, Shadow.card, !item.is_read && styles.cardUnread]}>
                {!item.is_read && <View style={styles.accentStripe} />}
                <NotifIcon kind={item.kind} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, !item.is_read && { color: Colors.primary }]}>
                    {item.title}
                  </Text>
                  <Text style={styles.cardBody}>{item.body}</Text>
                  <Text style={styles.cardTime}>{relativeTime(item.created_at)}</Text>
                </View>
                <View style={styles.cardRight}>
                  {!item.is_read && <View style={styles.dot} />}
                  <ChevronRight color={Colors.textSubtle} size={16} />
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  gradHeader: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  pushRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: Spacing.xl,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pushTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  pushSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  headerSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 1,
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginRight: 8,
  },
  unreadBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  markAllBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  filterTabActive: {
    backgroundColor: "#fff",
  },
  filterTabText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "700",
  },
  filterTabTextActive: {
    color: Colors.primary,
  },
  // Cards
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    gap: 12,
    overflow: "hidden",
  },
  cardUnread: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: Colors.secondary + "30",
  },
  accentStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.secondary,
    borderTopLeftRadius: Radius.lg,
    borderBottomLeftRadius: Radius.lg,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: Colors.text,
    fontWeight: "800",
    fontSize: 14,
    lineHeight: 20,
  },
  cardBody: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  cardTime: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 6,
  },
  cardRight: {
    alignItems: "center",
    gap: 6,
    paddingTop: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.secondary,
  },
  // Empty state
  empty: {
    alignItems: "center",
    paddingHorizontal: 40,
    marginTop: 60,
  },
  emptyBell: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
  },
});
