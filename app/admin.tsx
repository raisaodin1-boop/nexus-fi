// Admin Console — premium redesign
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft, Users, ShieldCheck, Crown, BarChart3, Bell,
  CheckCircle, XCircle, Send, ChevronRight, ShieldAlert,
  Search, Zap, MessageCircle, Globe,
} from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { supabase } from "@/src/supabase";
import { useAuth } from "@/src/auth-context";
import { SkeletonCard } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { MIN_TOUCH, useResponsive } from "@/src/hooks/use-responsive";
import { KycReviewModal, type KycReviewTarget } from "@/src/admin-kyc-review-modal";
import { AdminCompliancePanel } from "@/src/admin-compliance-panel";
import { AdminPromotionRequestsPanel } from "@/src/admin-promotion-requests";
import { AdminDiasporaPanel } from "@/src/admin-diaspora-panel";

type Tab = "users" | "kyc" | "promotions" | "tontines" | "messages" | "broadcast" | "compliance" | "diaspora";

interface AdminUser {
  id: string; email: string; full_name: string; role: string;
  is_active?: boolean | null; created_at: string;
}
interface KycEntry {
  id?: string | null;
  user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  country?: string;
  kyc_status: string;
  created_at: string;
  submitted_at?: string | null;
  verification_mode?: string | null;
  id_type?: string | null;
  id_front_path?: string | null;
  id_back_path?: string | null;
  selfie_path?: string | null;
}

function isPendingKyc(status: string) {
  return status === "pending_review" || status === "pending";
}
interface PromoRequest {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  kyc_status?: string;
  reason: string;
  status: string;
  created_at: string;
}
interface AdminTontine {
  id: string; name: string; invite_code: string; status: string; members_count: number; created_at: string;
}
interface AdminUsersPage {
  items: AdminUser[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}
interface AdminStats {
  total_users: number;
  total_tontines: number;
  pending_kyc: number;
}
interface AdminMessageThread {
  user_id: string;
  full_name: string;
  last_message: string;
  last_at: string;
  unread_count: number;
}
interface AdminChatMessage {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  content: string;
  created_at: string;
  sender_name?: string;
}

const ROLE_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  super_admin: { label: "Super Admin", bg: "#7C3AED", color: "#fff" },
  tontine_manager: { label: "Manager", bg: "#F59E0B", color: "#fff" },
  admin: { label: "Admin", bg: "#3B82F6", color: "#fff" },
  member: { label: "Membre", bg: "#E5E7EB", color: "#374151" },
};

const KYC_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  verified: { label: "Vérifié", bg: "#D1FAE5", color: "#065F46" },
  approved: { label: "Vérifié", bg: "#D1FAE5", color: "#065F46" },
  pending_review: { label: "En attente", bg: "#FEF3C7", color: "#92400E" },
  pending: { label: "En attente", bg: "#FEF3C7", color: "#92400E" },
  rejected: { label: "Rejeté", bg: "#FEE2E2", color: "#991B1B" },
  not_started: { label: "Non démarré", bg: "#F3F4F6", color: "#6B7280" },
  not_submitted: { label: "Non soumis", bg: "#F3F4F6", color: "#6B7280" },
};

function Avatar({ name, size = 40, bg }: { name: string; size?: number; bg?: string }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const colors = ["#6366F1", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#3B82F6"];
  const colorIndex = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  const bgColor = bg ?? colors[colorIndex];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.35 }}>{initials}</Text>
    </View>
  );
}

function StatusBadge({ config }: { config: { label: string; bg: string; color: string } }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: config.bg }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: config.color }}>{config.label}</Text>
    </View>
  );
}

export default function AdminConsole() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { user } = useAuth();
  const { show } = useToast();
  const { isCompact, horizontalPad } = useResponsive();
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.tab;
    if (t === "compliance" || t === "kyc" || t === "users" || t === "promotions" || t === "tontines" || t === "messages" || t === "broadcast" || t === "diaspora") {
      return t;
    }
    return "users";
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const [adminStats, setAdminStats] = useState<AdminStats>({ total_users: 0, total_tontines: 0, pending_kyc: 0 });
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSearchDebounce = useRef(true);
  const [kyc, setKyc] = useState<KycEntry[]>([]);
  const [promos, setPromos] = useState<PromoRequest[]>([]);
  const [tontines, setTontines] = useState<AdminTontine[]>([]);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [msgThreads, setMsgThreads] = useState<AdminMessageThread[]>([]);
  const [activeMsgUser, setActiveMsgUser] = useState<AdminMessageThread | null>(null);
  const [adminChatMsgs, setAdminChatMsgs] = useState<AdminChatMessage[]>([]);
  const [adminReply, setAdminReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [kycReviewTarget, setKycReviewTarget] = useState<KycReviewTarget | null>(null);
  const [openFraudAlerts, setOpenFraudAlerts] = useState(0);

  if (user?.role !== "super_admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <LinearGradient colors={["#0F172A", "#1E293B"]} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <ShieldAlert color="#EF4444" size={48} />
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>Accès refusé</Text>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Zone réservée aux super admins</Text>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  const loadUsers = useCallback(async (searchTerm: string, offset = 0, append = false) => {
    if (append) setUsersLoadingMore(true);
    else if (offset === 0) setLoading(true);
    try {
      const qs = new URLSearchParams({ offset: String(offset), limit: "50" });
      if (searchTerm.trim()) qs.set("search", searchTerm.trim());
      const res = await api.get<AdminUsersPage>(`/admin/users?${qs.toString()}`);
      setUserTotal(res.total);
      setUsersHasMore(res.has_more);
      setUsers((prev) => (append ? [...prev, ...res.items] : res.items));
    } catch (e) {
      console.warn("[admin] loadUsers failed:", e);
    }
    setLoading(false);
    setUsersLoadingMore(false);
  }, []);

  const loadMessageThreads = useCallback(async () => {
    try {
      const data = await api.get<AdminMessageThread[]>("/admin/messages/threads");
      setMsgThreads(data);
    } catch {
      setMsgThreads([]);
    }
  }, []);

  const loadAdminChat = useCallback(async (userId: string) => {
    try {
      const data = await api.get<AdminChatMessage[]>(`/messages/direct/${userId}`);
      setAdminChatMsgs(data);
    } catch {
      setAdminChatMsgs([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch { return null; }
    };
    const [statsData, kycData, promosData, tontinesData, complianceStats] = await Promise.all([
      safe(() => api.get<AdminStats>("/admin/stats")),
      safe(() => api.get<KycEntry[]>("/admin/kyc")),
      safe(() => api.get<PromoRequest[]>("/admin/promotion-requests")),
      safe(() => api.get<AdminTontine[]>("/admin/tontines")),
      safe(() => api.get<{ open_fraud_alerts: number }>("/admin/compliance/stats")),
    ]);
    if (statsData) setAdminStats(statsData);
    if (kycData) setKyc(kycData);
    if (promosData) setPromos(promosData);
    if (tontinesData) setTontines(tontinesData);
    if (complianceStats) setOpenFraudAlerts(complianceStats.open_fraud_alerts);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    loadUsers(search, 0, false);
    loadMessageThreads();
    const ch = supabase
      .channel("rt-admin-console")
      .on("postgres_changes", { event: "*", schema: "public", table: "kyc_submissions" }, () => { load(); loadUsers(search, 0, false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => { load(); loadUsers(search, 0, false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "tontines" }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "fraud_alerts" }, () => { load(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        loadMessageThreads();
        if (activeMsgUser) loadAdminChat(activeMsgUser.user_id);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, loadUsers, search, loadMessageThreads, activeMsgUser, loadAdminChat]));

  useEffect(() => {
    if (tab !== "users") return;
    if (skipSearchDebounce.current) {
      skipSearchDebounce.current = false;
      return;
    }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => loadUsers(search, 0, false), 350);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [search, tab, loadUsers]);

  const openKycReview = (entry: KycEntry) => {
    setKycReviewTarget({
      user_id: entry.user_id,
      full_name: entry.full_name,
      kyc_status: entry.kyc_status,
    });
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.patch("/admin/users/role", { user_id: userId, role: newRole });
      show("Rôle mis à jour", "success");
      load();
      loadUsers(search, 0, false);
    } catch (e) { show(e instanceof ApiError ? e.detail : "Erreur", "error"); }
  };

  const handleDeactivate = (userId: string) => {
    const doIt = async () => {
      try {
        await api.post("/admin/users/deactivate", { user_id: userId });
        show("Compte désactivé", "success");
        load();
        loadUsers(search, 0, false);
      } catch (e) { show(e instanceof ApiError ? e.detail : "Erreur", "error"); }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Désactiver ce compte ?")) doIt();
    } else {
      Alert.alert("Confirmer", "Désactiver ce compte ?", [
        { text: "Annuler", style: "cancel" },
        { text: "Désactiver", style: "destructive", onPress: doIt },
      ]);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) { show("Remplissez le titre et le message", "error"); return; }
    setBroadcasting(true);
    try {
      const res = await api.post<{ detail: string }>("/admin/broadcast", { title: broadcastTitle.trim(), body: broadcastBody.trim() });
      show(res.detail ?? "Annonce envoyée à tous les membres !", "success");
      setBroadcastTitle(""); setBroadcastBody("");
    } catch (e) { show(e instanceof ApiError ? e.detail : "Erreur", "error"); }
    finally { setBroadcasting(false); }
  };

  const handleAdminReply = async () => {
    if (!activeMsgUser || !adminReply.trim()) return;
    setSendingReply(true);
    try {
      await api.post("/admin/messages", { user_id: activeMsgUser.user_id, content: adminReply.trim() });
      setAdminReply("");
      await loadAdminChat(activeMsgUser.user_id);
      loadMessageThreads();
      show("Message envoyé", "success");
    } catch (e) { show(e instanceof ApiError ? e.detail : "Erreur", "error"); }
    finally { setSendingReply(false); }
  };

  const openMsgThread = async (thread: AdminMessageThread) => {
    setActiveMsgUser(thread);
    loadAdminChat(thread.user_id);
    try {
      await api.post("/messages/thread/read", { thread_type: "direct", peer_id: thread.user_id });
      loadMessageThreads();
    } catch {}
  };

  const msgUnreadTotal = msgThreads.reduce((s, t) => s + t.unread_count, 0);

  const TABS: { key: Tab; label: string; icon: any; count?: number }[] = [
    { key: "users", label: "Membres", icon: Users, count: userTotal || undefined },
    { key: "kyc", label: "KYC", icon: ShieldCheck, count: kyc.filter(k => isPendingKyc(k.kyc_status)).length || undefined },
    { key: "promotions", label: "Promos", icon: Crown, count: promos.filter(p => p.status === "pending").length || undefined },
    { key: "tontines", label: "Tontines", icon: BarChart3 },
    { key: "messages", label: "Messages", icon: MessageCircle, count: msgUnreadTotal || undefined },
    { key: "diaspora", label: "Diaspora", icon: Globe },
    { key: "compliance", label: "Compliance", icon: ShieldAlert, count: openFraudAlerts || undefined },
    { key: "broadcast", label: "Annonces", icon: Bell },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <LinearGradient colors={["#0F172A", "#1E3A5F"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Zap color="#F5C842" size={14} fill="#F5C842" />
            <Text style={styles.headerEyebrow}>HODIX CONTROL CENTER</Text>
          </View>
          <Text style={styles.headerTitle}>Console Admin</Text>
        </View>
        <Avatar name={user?.full_name ?? "A"} size={38} bg="#6366F1" />
      </LinearGradient>

      {/* Stats strip */}
      <LinearGradient colors={["#1E3A5F", "#0F172A"]} style={styles.statsStrip}>
        {[
          { label: "Membres", value: adminStats.total_users, color: "#60A5FA" },
          { label: "KYC pending", value: adminStats.pending_kyc, color: "#FBBF24" },
          { label: "Tontines", value: adminStats.total_tontines, color: "#34D399" },
        ].map((s) => (
          <View key={s.label} style={styles.statItem}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </LinearGradient>

      {/* Tabs — hauteur fixe pour éviter l'étirement vertical */}
      <View style={styles.tabsBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          style={styles.tabsScroll}
          bounces={false}
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.key === tab;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                activeOpacity={0.75}
              >
                {active ? (
                  <LinearGradient colors={["#6366F1", "#8B5CF6"]} style={styles.tabBtnGrad}>
                    <Icon color="#fff" size={13} />
                    <Text style={styles.tabLabelActive}>{t.label}</Text>
                    {!!t.count && (
                      <View style={styles.tabBadge}>
                        <Text style={styles.tabBadgeText}>{t.count}</Text>
                      </View>
                    )}
                  </LinearGradient>
                ) : (
                  <>
                    <Icon color={Colors.textMuted} size={13} />
                    <Text style={styles.tabLabel}>{t.label}</Text>
                    {!!t.count && (
                      <View style={[styles.tabBadge, { backgroundColor: Colors.danger }]}>
                        <Text style={styles.tabBadgeText}>{t.count}</Text>
                      </View>
                    )}
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      {loading && tab !== "compliance" ? (
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: 12 }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </ScrollView>
      ) : tab === "users" ? (
        <View style={{ flex: 1 }}>
          <View style={[styles.searchRow, { marginHorizontal: horizontalPad }]}>
            <Search color={Colors.textMuted} size={15} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un membre..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            contentContainerStyle={{ paddingHorizontal: horizontalPad, paddingBottom: 100, gap: 10 }}
            onEndReached={() => {
              if (usersHasMore && !usersLoadingMore && !loading) {
                loadUsers(search, users.length, true);
              }
            }}
            onEndReachedThreshold={0.35}
            ListHeaderComponent={
              users.length < userTotal ? (
                <Text style={styles.pageHint}>
                  Affichage de {users.length} sur {userTotal} membres
                </Text>
              ) : null
            }
            ListFooterComponent={
              usersLoadingMore ? (
                <ActivityIndicator color={Colors.secondary} style={{ marginVertical: 16 }} />
              ) : null
            }
            renderItem={({ item: u }) => {
              const roleConf = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.member;
              const isDeactivated = u.is_active === false;
              return (
                <View style={[styles.userCard, isCompact && styles.userCardStack]}>
                  <View style={styles.userCardLeft}>
                    <Avatar name={u.full_name} size={44} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={styles.userName} numberOfLines={1}>{u.full_name}</Text>
                        {isDeactivated && (
                          <View style={{ backgroundColor: "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>
                            <Text style={{ color: "#991B1B", fontSize: 10, fontWeight: "700" }}>Inactif</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.userEmail} numberOfLines={1}>{u.email}</Text>
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                        <StatusBadge config={roleConf} />
                      </View>
                    </View>
                  </View>
                  <View style={[styles.userActions, isCompact && styles.userActionsStack]}>
                    {u.role === "member" && (
                      <TouchableOpacity style={styles.promoteBtn} onPress={() => handleRoleChange(u.id, "tontine_manager")}>
                        <Text style={styles.promoteBtnText}>↑ Manager</Text>
                      </TouchableOpacity>
                    )}
                    {u.role === "tontine_manager" && (
                      <TouchableOpacity style={[styles.promoteBtn, { backgroundColor: "#EDE9FE" }]} onPress={() => handleRoleChange(u.id, "member")}>
                        <Text style={[styles.promoteBtnText, { color: "#6D28D9" }]}>↓ Membre</Text>
                      </TouchableOpacity>
                    )}
                    {!isDeactivated && u.role !== "super_admin" && (
                      <TouchableOpacity style={styles.deactivateBtn} onPress={() => handleDeactivate(u.id)}>
                        <XCircle color="#EF4444" size={14} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>Aucun membre trouvé</Text>}
          />
        </View>
      ) : tab === "kyc" ? (
        <FlatList
          data={kyc}
          keyExtractor={(k) => k.user_id}
          contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 100, gap: 10 }}
          renderItem={({ item: k }) => {
            const kycConf = KYC_CONFIG[k.kyc_status] ?? KYC_CONFIG.not_started;
            const pending = isPendingKyc(k.kyc_status);
            const hasDocs = !!(k.id_front_path || k.id_back_path || k.selfie_path);
            return (
              <TouchableOpacity style={styles.userCard} onPress={() => openKycReview(k)} activeOpacity={0.85}>
                <View style={styles.userCardLeft}>
                  <Avatar name={k.full_name} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName} numberOfLines={1}>{k.full_name}</Text>
                    <Text style={styles.userEmail} numberOfLines={1}>{k.email || k.phone || "—"}</Text>
                    {!!k.country && <Text style={styles.userEmail} numberOfLines={1}>{k.country}{k.id_type ? ` · ${k.id_type}` : ""}</Text>}
                    <View style={{ marginTop: 4, flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                      <StatusBadge config={kycConf} />
                      {hasDocs && (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "#DBEAFE" }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: "#1D4ED8" }}>Documents</Text>
                        </View>
                      )}
                      {!!k.verification_mode && (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "#EEF2FF" }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: "#4338CA" }}>{k.verification_mode}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <ChevronRight color={Colors.textMuted} size={18} />
                  {pending && (
                    <Text style={{ fontSize: 10, fontWeight: "700", color: Colors.secondary }}>Examiner →</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Aucun dossier KYC dans Supabase</Text>}
        />
      ) : tab === "promotions" ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 100, gap: 16 }}>
          <Text style={styles.sectionHeading}>En attente ({promos.filter((p) => p.status === "pending").length})</Text>
          <AdminPromotionRequestsPanel
            requests={promos}
            onChanged={load}
            onSuccess={(msg) => show(msg, "success")}
            onError={(msg) => show(msg, "error")}
          />

          {promos.filter((p) => p.status !== "pending").length > 0 ? (
            <>
              <Text style={styles.sectionHeading}>Historique</Text>
              {promos.filter((p) => p.status !== "pending").map((p) => {
                const statusConf = p.status === "approved"
                  ? { label: "Approuvé", bg: "#D1FAE5", color: "#065F46" }
                  : { label: "Refusé", bg: "#FEE2E2", color: "#991B1B" };
                return (
                  <View key={p.id} style={styles.userCard}>
                    <View style={styles.userCardLeft}>
                      <Avatar name={p.full_name} size={44} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.userName} numberOfLines={1}>{p.full_name}</Text>
                        <Text style={styles.userEmail} numberOfLines={1}>{p.email}</Text>
                        <Text style={styles.userEmail} numberOfLines={2}>{p.reason}</Text>
                        <View style={{ marginTop: 4 }}>
                          <StatusBadge config={statusConf} />
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          ) : null}
        </ScrollView>
      ) : tab === "tontines" ? (
        <FlatList
          data={tontines}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 100, gap: 10 }}
          renderItem={({ item: t }) => {
            const statusConf = t.status === "active"
              ? { label: "Active", bg: "#D1FAE5", color: "#065F46" }
              : t.status === "completed"
              ? { label: "Terminée", bg: "#DBEAFE", color: "#1D4ED8" }
              : { label: t.status, bg: "#F3F4F6", color: "#6B7280" };
            return (
              <TouchableOpacity style={styles.userCard} onPress={() => router.push(`/tontines/${t.id}` as any)} activeOpacity={0.8}>
                <View style={styles.userCardLeft}>
                  <Avatar name={t.name} size={44} bg="#10B981" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName} numberOfLines={1}>{t.name}</Text>
                    <Text style={styles.userEmail}>Code : <Text style={{ fontWeight: "800", color: Colors.primary }}>{t.invite_code}</Text></Text>
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 4, alignItems: "center" }}>
                      <StatusBadge config={statusConf} />
                      <Text style={{ fontSize: 11, color: Colors.textMuted, fontWeight: "600" }}>{t.members_count} membre(s)</Text>
                    </View>
                  </View>
                </View>
                <ChevronRight color={Colors.textMuted} size={18} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Aucune tontine</Text>}
        />
      ) : tab === "messages" ? (
        <View style={{ flex: 1 }}>
          {activeMsgUser ? (
            <View style={{ flex: 1 }}>
              <View style={styles.msgThreadHeader}>
                <TouchableOpacity onPress={() => setActiveMsgUser(null)} style={styles.backBtn}>
                  <ArrowLeft color={Colors.text} size={18} />
                </TouchableOpacity>
                <Avatar name={activeMsgUser.full_name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName} numberOfLines={1}>{activeMsgUser.full_name}</Text>
                  <Text style={styles.userEmail}>Conversation privée</Text>
                </View>
              </View>
              <FlatList
                data={adminChatMsgs}
                keyExtractor={(m) => m.id}
                contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 8, gap: 8 }}
                renderItem={({ item: m }) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <View style={[styles.adminBubble, mine ? styles.adminBubbleMe : styles.adminBubbleThem]}>
                      {!mine && m.sender_name ? <Text style={styles.adminBubbleSender}>{m.sender_name}</Text> : null}
                      <Text style={[styles.adminBubbleText, mine && { color: "#fff" }]}>{m.content}</Text>
                    </View>
                  );
                }}
                ListEmptyComponent={<Text style={styles.empty}>Aucun message</Text>}
              />
              <View style={styles.adminReplyRow}>
                <TextInput
                  style={styles.adminReplyInput}
                  value={adminReply}
                  onChangeText={setAdminReply}
                  placeholder="Répondre au membre…"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.adminReplySend, (!adminReply.trim() || sendingReply) && { opacity: 0.5 }]}
                  onPress={handleAdminReply}
                  disabled={!adminReply.trim() || sendingReply}
                >
                  {sendingReply ? <ActivityIndicator color="#fff" size="small" /> : <Send color="#fff" size={16} />}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <FlatList
              data={msgThreads}
              keyExtractor={(t) => t.user_id}
              contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 100, gap: 10 }}
              renderItem={({ item: t }) => (
                <TouchableOpacity style={styles.userCard} onPress={() => openMsgThread(t)} activeOpacity={0.85}>
                  <View style={styles.userCardLeft}>
                    <Avatar name={t.full_name} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName} numberOfLines={1}>{t.full_name}</Text>
                      <Text style={styles.userEmail} numberOfLines={2}>{t.last_message}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    {t.unread_count > 0 ? (
                      <View style={styles.msgUnreadBadge}>
                        <Text style={styles.msgUnreadText}>{t.unread_count}</Text>
                      </View>
                    ) : null}
                    <ChevronRight color={Colors.textMuted} size={18} />
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>Aucun message de membre</Text>}
            />
          )}
        </View>
      ) : tab === "compliance" ? (
        <AdminCompliancePanel embedded />
      ) : tab === "diaspora" ? (
        <AdminDiasporaPanel embedded />
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: 16, paddingBottom: 100 }}>
          <View style={styles.broadcastCard}>
            <LinearGradient colors={["#6366F1", "#8B5CF6"]} style={styles.broadcastIconBg}>
              <Bell color="#fff" size={22} />
            </LinearGradient>
            <Text style={styles.broadcastTitle}>Canal publicitaire</Text>
            <Text style={styles.broadcastDesc}>
              Envoyez une annonce à tous les membres : notification push + message dans « Annonces HODIX ».
            </Text>
            <TextInput
              style={styles.broadcastInput}
              value={broadcastTitle}
              onChangeText={setBroadcastTitle}
              placeholder="Titre de la notification"
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={[styles.broadcastInput, { minHeight: 90, textAlignVertical: "top" }]}
              value={broadcastBody}
              onChangeText={setBroadcastBody}
              placeholder="Message à envoyer..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
            <TouchableOpacity style={[styles.sendBtn, broadcasting && { opacity: 0.6 }]} onPress={handleBroadcast} disabled={broadcasting} activeOpacity={0.85}>
              <LinearGradient colors={["#6366F1", "#8B5CF6"]} style={styles.sendBtnGrad}>
                {broadcasting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Send color="#fff" size={15} /><Text style={styles.sendBtnText}>Envoyer à tous</Text></>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
      <KycReviewModal
        target={kycReviewTarget}
        onClose={() => setKycReviewTarget(null)}
        onUpdated={() => {
          load();
          loadUsers(search, 0, false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center",
  },
  headerEyebrow: { color: "#F5C842", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 1 },
  statsStrip: {
    flexDirection: "row", justifyContent: "space-around",
    paddingVertical: 12, paddingHorizontal: 20,
  },
  statItem: { alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "900" },
  statLabel: { fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: "600", marginTop: 1 },
  tabsBar: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    flexGrow: 0,
    flexShrink: 0,
  },
  tabsScroll: { flexGrow: 0, flexShrink: 0 },
  tabsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: "center",
    flexDirection: "row",
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: "#F1F5F9",
    flexShrink: 0,
    flexGrow: 0,
    height: 36,
    alignSelf: "center",
  },
  tabBtnActive: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: "transparent",
    height: 36,
    flexShrink: 0,
    flexGrow: 0,
    overflow: "hidden",
    borderRadius: Radius.full,
  },
  tabBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    height: 36,
    borderRadius: Radius.full,
  },
  tabLabel: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  tabLabelActive: { fontSize: 12, fontWeight: "700", color: "#fff" },
  tabBadge: {
    minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  tabBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginVertical: 12,
    backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB",
    paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#1E293B", outlineStyle: "none" } as any,
  userCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  userCardStack: { flexDirection: "column", alignItems: "stretch", gap: 12 },
  userCardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  userActions: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  userActionsStack: { flexWrap: "wrap", justifyContent: "flex-end" },
  userName: { fontSize: 14, fontWeight: "800", color: "#1E293B" },
  userEmail: { fontSize: 11, color: "#94A3B8", fontWeight: "500", marginTop: 1 },
  promoteBtn: {
    backgroundColor: "#EFF6FF", paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8,
  },
  promoteBtnText: { fontSize: 11, fontWeight: "800", color: "#2563EB" },
  deactivateBtn: {
    width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: 8,
    backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center",
  },
  approveBtn: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#10B981", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  approveBtnText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  rejectBtn: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#EF4444", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  rejectBtnText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  empty: { textAlign: "center", color: "#94A3B8", fontWeight: "600", marginTop: 48, fontSize: 14 },
  sectionHeading: { color: Colors.text, fontSize: 15, fontWeight: "900", marginBottom: 4 },
  pageHint: { fontSize: 12, color: Colors.textMuted, marginBottom: 10, textAlign: "center" },
  broadcastCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 20, gap: 14,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  broadcastIconBg: {
    width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center",
  },
  broadcastTitle: { fontSize: 18, fontWeight: "900", color: "#1E293B" },
  broadcastDesc: { fontSize: 13, color: "#94A3B8", lineHeight: 19 },
  broadcastInput: {
    borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
    color: "#1E293B", backgroundColor: "#F8FAFC",
  },
  sendBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  sendBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15 },
  sendBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  msgThreadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  adminBubble: { maxWidth: "80%", padding: 12, borderRadius: 14 },
  adminBubbleMe: { alignSelf: "flex-end", backgroundColor: Colors.primary },
  adminBubbleThem: { alignSelf: "flex-start", backgroundColor: "#F1F5F9" },
  adminBubbleSender: { fontSize: 11, fontWeight: "700", color: Colors.primary, marginBottom: 4 },
  adminBubbleText: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  adminReplyRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: Spacing.xl,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  adminReplyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1E293B",
    maxHeight: 100,
    outlineStyle: "none",
  } as any,
  adminReplySend: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  msgUnreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  msgUnreadText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
