// Admin Console — full management panel
import { useCallback, useState } from "react";
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
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft, Users, ShieldCheck, ShieldAlert, Crown, CheckCircle, XCircle,
  Search, Send, Bell, ChevronRight, BarChart3,
} from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Card, SectionTitle, SkeletonCard } from "@/src/ui";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";
import { useToast } from "@/src/toast";

type Tab = "users" | "kyc" | "promotions" | "tontines" | "broadcast";

interface AdminUser {
  id: string; email: string; full_name: string; role: string;
  is_active: boolean; created_at: string;
}
interface KycEntry {
  user_id: string; full_name: string; email: string; kyc_status: string; created_at: string;
}
interface PromoRequest {
  id: string; user_id: string; full_name: string; email: string; status: string; created_at: string;
}
interface AdminTontine {
  id: string; name: string; invite_code: string; status: string; members_count: number; created_at: string;
}

export default function AdminConsole() {
  const router = useRouter();
  const { user } = useAuth();
  const { show } = useToast();
  const [tab, setTab] = useState<Tab>("users");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [kyc, setKyc] = useState<KycEntry[]>([]);
  const [promos, setPromos] = useState<PromoRequest[]>([]);
  const [tontines, setTontines] = useState<AdminTontine[]>([]);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  if (user?.role !== "super_admin") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ShieldAlert color={Colors.danger} size={40} />
          <Text style={styles.denied}>Accès refusé</Text>
        </View>
      </SafeAreaView>
    );
  }

  const load = useCallback(async () => {
    setLoading(true);
    const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch { return null; }
    };
    if (tab === "users") {
      const data = await safe(() => api.get<AdminUser[]>("/admin/users"));
      if (data) setUsers(data);
    } else if (tab === "kyc") {
      const data = await safe(() => api.get<KycEntry[]>("/admin/kyc"));
      if (data) setKyc(data);
    } else if (tab === "promotions") {
      const data = await safe(() => api.get<PromoRequest[]>("/admin/promotion-requests"));
      if (data) setPromos(data);
    } else if (tab === "tontines") {
      const data = await safe(() => api.get<AdminTontine[]>("/admin/tontines"));
      if (data) setTontines(data);
    }
    setLoading(false);
  }, [tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleKyc = async (userId: string, approve: boolean) => {
    try {
      const ep = approve ? "/admin/kyc/approve" : "/admin/kyc/reject";
      await api.post(ep, { user_id: userId });
      show(approve ? "KYC approuvé" : "KYC rejeté", approve ? "success" : "error");
      load();
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    }
  };

  const handlePromotion = async (userId: string, approve: boolean) => {
    try {
      const ep = approve ? "/admin/promotion/approve" : "/admin/promotion/reject";
      await api.post(ep, { user_id: userId });
      show(approve ? "Promotion accordée !" : "Demande refusée", approve ? "success" : "error");
      load();
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.patch("/admin/users/role", { user_id: userId, role: newRole });
      show("Rôle mis à jour", "success");
      load();
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    }
  };

  const handleDeactivate = (userId: string) => {
    const doIt = async () => {
      try {
        await api.post("/admin/users/deactivate", { user_id: userId });
        show("Compte désactivé", "success");
        load();
      } catch (e) {
        show(e instanceof ApiError ? e.detail : "Erreur", "error");
      }
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
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      show("Remplissez le titre et le message", "error"); return;
    }
    setBroadcasting(true);
    try {
      await api.post("/admin/broadcast", { title: broadcastTitle.trim(), body: broadcastBody.trim() });
      show("Notification envoyée à tous les membres !", "success");
      setBroadcastTitle(""); setBroadcastBody("");
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    } finally {
      setBroadcasting(false);
    }
  };

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: "users", label: "Membres", icon: Users },
    { key: "kyc", label: "KYC", icon: ShieldCheck },
    { key: "promotions", label: "Promotions", icon: Crown },
    { key: "tontines", label: "Tontines", icon: BarChart3 },
    { key: "broadcast", label: "Broadcast", icon: Bell },
  ];

  const filteredUsers = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Console Super Admin</Text>
          <Text style={styles.headerSub}>Hodix Control Center</Text>
        </View>
        <View style={styles.adminBadge}>
          <ShieldAlert color={Colors.accent} size={16} />
        </View>
      </LinearGradient>

      {/* Tabs */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.key === tab;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
            >
              <Icon color={active ? "#fff" : Colors.textMuted} size={14} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: 12 }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </ScrollView>
      ) : tab === "users" ? (
        <View style={{ flex: 1 }}>
          <View style={styles.searchRow}>
            <Search color={Colors.textMuted} size={16} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un membre..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <FlatList
            data={filteredUsers}
            keyExtractor={(u) => u.id}
            contentContainerStyle={{ padding: Spacing.xl, gap: 10, paddingBottom: 40 }}
            renderItem={({ item: u }) => (
              <Card style={{ padding: 14 }}>
                <Text style={styles.userName}>{u.full_name}</Text>
                <Text style={styles.userEmail}>{u.email}</Text>
                <View style={styles.userMeta}>
                  <View style={[styles.rolePill, { backgroundColor: u.role === "super_admin" ? Colors.danger : u.role === "tontine_manager" ? Colors.accent : Colors.border }]}>
                    <Text style={[styles.rolePillText, { color: u.role !== "member" ? "#fff" : Colors.text }]}>{u.role}</Text>
                  </View>
                  {!u.is_active && <View style={[styles.rolePill, { backgroundColor: Colors.danger }]}><Text style={[styles.rolePillText, { color: "#fff" }]}>Inactif</Text></View>}
                </View>
                <View style={styles.actionRow}>
                  {u.role === "member" && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleRoleChange(u.id, "tontine_manager")}>
                      <Text style={styles.actionBtnText}>→ Manager</Text>
                    </TouchableOpacity>
                  )}
                  {u.role === "tontine_manager" && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleRoleChange(u.id, "member")}>
                      <Text style={styles.actionBtnText}>→ Membre</Text>
                    </TouchableOpacity>
                  )}
                  {u.is_active && u.role !== "super_admin" && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: `${Colors.danger}15`, borderColor: Colors.danger }]} onPress={() => handleDeactivate(u.id)}>
                      <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Désactiver</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Card>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Aucun membre trouvé</Text>}
          />
        </View>
      ) : tab === "kyc" ? (
        <FlatList
          data={kyc}
          keyExtractor={(k) => k.user_id}
          contentContainerStyle={{ padding: Spacing.xl, gap: 10, paddingBottom: 40 }}
          renderItem={({ item: k }) => (
            <Card style={{ padding: 14 }}>
              <Text style={styles.userName}>{k.full_name}</Text>
              <Text style={styles.userEmail}>{k.email}</Text>
              <Text style={[styles.userEmail, { marginBottom: 10 }]}>Statut : {k.kyc_status}</Text>
              {k.kyc_status === "pending_review" && (
                <View style={styles.actionRow}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: `${Colors.accent}15`, borderColor: Colors.accent }]} onPress={() => handleKyc(k.user_id, true)}>
                    <CheckCircle color={Colors.accent} size={14} />
                    <Text style={[styles.actionBtnText, { color: Colors.accent }]}>Approuver</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: `${Colors.danger}15`, borderColor: Colors.danger }]} onPress={() => handleKyc(k.user_id, false)}>
                    <XCircle color={Colors.danger} size={14} />
                    <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Rejeter</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Aucune soumission KYC en attente</Text>}
        />
      ) : tab === "promotions" ? (
        <FlatList
          data={promos}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: Spacing.xl, gap: 10, paddingBottom: 40 }}
          renderItem={({ item: p }) => (
            <Card style={{ padding: 14 }}>
              <Text style={styles.userName}>{p.full_name}</Text>
              <Text style={styles.userEmail}>{p.email}</Text>
              <Text style={[styles.userEmail, { marginBottom: 10 }]}>Statut : {p.status}</Text>
              {p.status === "pending" && (
                <View style={styles.actionRow}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: `${Colors.accent}15`, borderColor: Colors.accent }]} onPress={() => handlePromotion(p.user_id, true)}>
                    <CheckCircle color={Colors.accent} size={14} />
                    <Text style={[styles.actionBtnText, { color: Colors.accent }]}>Accorder</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: `${Colors.danger}15`, borderColor: Colors.danger }]} onPress={() => handlePromotion(p.user_id, false)}>
                    <XCircle color={Colors.danger} size={14} />
                    <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Refuser</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Aucune demande de promotion</Text>}
        />
      ) : tab === "tontines" ? (
        <FlatList
          data={tontines}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: Spacing.xl, gap: 10, paddingBottom: 40 }}
          renderItem={({ item: t }) => (
            <Card style={{ padding: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{t.name}</Text>
                  <Text style={styles.userEmail}>Code : {t.invite_code}</Text>
                  <Text style={styles.userEmail}>{t.members_count} membre(s) · {t.status}</Text>
                </View>
                <TouchableOpacity onPress={() => router.push(`/tontines/${t.id}` as any)} style={styles.chevronBtn}>
                  <ChevronRight color={Colors.textMuted} size={18} />
                </TouchableOpacity>
              </View>
            </Card>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Aucune tontine</Text>}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: 16, paddingBottom: 40 }}>
          <Card style={{ padding: 20, gap: 14 }}>
            <Text style={styles.broadcastTitle}>Notification à tous les membres</Text>
            <Text style={styles.broadcastDesc}>Envoyez une notification push à l'ensemble de la communauté Hodix.</Text>
            <TextInput
              style={styles.broadcastInput}
              value={broadcastTitle}
              onChangeText={setBroadcastTitle}
              placeholder="Titre de la notification"
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={[styles.broadcastInput, { minHeight: 80, textAlignVertical: "top" }]}
              value={broadcastBody}
              onChangeText={setBroadcastBody}
              placeholder="Message à envoyer..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, broadcasting && { opacity: 0.6 }]}
              onPress={handleBroadcast}
              disabled={broadcasting}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[Colors.secondary, Colors.accent]} style={styles.sendBtnGrad}>
                {broadcasting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Send color="#fff" size={16} /><Text style={styles.sendBtnText}>Envoyer à tous</Text></>}
              </LinearGradient>
            </TouchableOpacity>
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  denied: { fontSize: 18, fontWeight: "800", color: Colors.danger },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "600" },
  adminBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  tabsRow: { paddingHorizontal: Spacing.xl, paddingVertical: 12, gap: 8 },
  tabBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabLabel: { fontSize: 12, fontWeight: "700", color: Colors.textMuted },
  tabLabelActive: { color: "#fff" },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: Spacing.xl, marginBottom: 4,
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text, outlineStyle: "none" } as any,
  userName: { fontSize: 15, fontWeight: "800", color: Colors.primary, marginBottom: 2 },
  userEmail: { fontSize: 12, color: Colors.textMuted, fontWeight: "500", marginBottom: 4 },
  userMeta: { flexDirection: "row", gap: 6, marginBottom: 8 },
  rolePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full },
  rolePillText: { fontSize: 11, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  actionBtnText: { fontSize: 12, fontWeight: "700", color: Colors.text },
  chevronBtn: { padding: 4 },
  empty: { textAlign: "center", color: Colors.textMuted, fontWeight: "600", marginTop: 40 },
  broadcastTitle: { fontSize: 17, fontWeight: "900", color: Colors.primary },
  broadcastDesc: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  broadcastInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
    color: Colors.text, backgroundColor: Colors.surfaceAlt,
  },
  sendBtn: { borderRadius: Radius.lg, overflow: "hidden" },
  sendBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  sendBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
