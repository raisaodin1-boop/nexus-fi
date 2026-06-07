// Admin Console — Complete fintech admin dashboard
import { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Shield, Users, Database, CheckCircle, XCircle, ChevronRight,
  Search, RefreshCw, TrendingUp, Activity, AlertTriangle,
  UserCheck, Lock, Unlock, Trash2, ArrowLeft, Crown,
  Clock, BarChart3, Star,
} from "lucide-react-native";

import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { Card } from "@/src/ui";
import { api, formatXAF } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { LineChart } from "@/src/charts";

type Tab = "overview" | "users" | "tontines" | "kyc" | "promotions";

interface Analytics {
  users: { total: number; new_7d: number; new_30d: number; managers: number; admins: number };
  tontines: { total: number; active: number; closed: number };
  associations: number;
  cooperatives: number;
  savings_volume: number;
  contributions_volume: number;
  kyc: { pending: number; approved: number };
  user_series: { date: string; value: number }[];
}

export default function AdminScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [tontines, setTontines] = useState<any[]>([]);
  const [kyc, setKyc] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  if (user?.role !== "super_admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <Shield color={Colors.danger} size={48} />
          <Text style={styles.denied}>Accès refusé</Text>
          <Text style={styles.deniedSub}>Réservé aux super administrateurs.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000));
      const [a, u, t, k, p] = await Promise.race([
        Promise.all([
          api.get<Analytics>("/admin/analytics"),
          api.get<any[]>("/admin/users"),
          api.get<any[]>("/admin/tontines"),
          api.get<any[]>("/admin/kyc"),
          api.get<any[]>("/admin/promotion-requests"),
        ]),
        timeout,
      ]);
      setAnalytics(a);
      setUsers(u);
      setTontines(t);
      setKyc(k);
      setPromotions(p);
    } catch (e) {
      console.warn("admin load", e);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirm = (title: string, msg: string, onOk: () => void) => {
    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n${msg}`)) onOk();
    } else {
      Alert.alert(title, msg, [
        { text: "Annuler", style: "cancel" },
        { text: "Confirmer", style: "destructive", onPress: onOk },
      ]);
    }
  };

  const doAction = async (key: string, fn: () => Promise<any>) => {
    setActionLoading(key);
    try { await fn(); await load(); }
    catch (e: any) { Alert.alert("Erreur", e?.detail ?? e?.message ?? "Échec"); }
    finally { setActionLoading(null); }
  };

  const changeRole = (u: any) => {
    if (Platform.OS === "web") {
      const r = window.prompt(
        `Nouveau rôle pour ${u.full_name}\nmember | tontine_manager | super_admin`,
        u.role,
      );
      if (r && ["member", "tontine_manager", "super_admin"].includes(r)) {
        doAction(`role-${u.id}`, () => api.patch("/admin/users/role", { user_id: u.id, role: r }));
      }
    } else {
      Alert.alert("Changer le rôle", u.full_name, [
        { text: "Membre", onPress: () => doAction(`role-${u.id}`, () => api.patch("/admin/users/role", { user_id: u.id, role: "member" })) },
        { text: "Manager", onPress: () => doAction(`role-${u.id}`, () => api.patch("/admin/users/role", { user_id: u.id, role: "tontine_manager" })) },
        { text: "Super Admin", onPress: () => doAction(`role-${u.id}`, () => api.patch("/admin/users/role", { user_id: u.id, role: "super_admin" })) },
        { text: "Annuler", style: "cancel" },
      ]);
    }
  };

  const setTontineAutoClose = (t: any) => {
    if (Platform.OS === "web") {
      const d = window.prompt(
        "Date de clôture auto (YYYY-MM-DD) ou vide = indéfinie :",
        t.auto_close_date ?? "",
      );
      if (d === null) return;
      doAction(`tontine-ac-${t.id}`, () => api.patch(`/admin/tontines/${t.id}`, { auto_close_date: d || null }));
    } else {
      Alert.alert("Durée de la tontine", t.name, [
        { text: "Indéfinie (pas de clôture)", onPress: () => doAction(`tontine-ac-${t.id}`, () => api.patch(`/admin/tontines/${t.id}`, { auto_close_date: null })) },
        { text: "Clôturer maintenant", style: "destructive", onPress: () => doAction(`close-now-${t.id}`, () => api.patch(`/admin/tontines/${t.id}`, { status: "closed" })) },
        { text: "Annuler", style: "cancel" },
      ]);
    }
  };

  const pendingPromos = promotions.filter(p => p.status === "pending").length;
  const pendingKyc = kyc.filter(k => k.status === "pending").length;

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Aperçu" },
    { id: "users", label: "Membres", badge: analytics?.users.total },
    { id: "tontines", label: "Tontines", badge: analytics?.tontines.total },
    { id: "kyc", label: "KYC", badge: pendingKyc || undefined },
    { id: "promotions", label: "Promotions", badge: pendingPromos || undefined },
  ];

  const filteredUsers = users.filter(u => !search || (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()));
  const filteredTontines = tontines.filter(t => !search || (t.name ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <LinearGradient colors={["#0D0F1A", "#1A1B2E"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color="#fff" size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={styles.adminBadge}>
            <Shield color={Colors.accent} size={10} />
            <Text style={styles.adminBadgeText}>SUPER ADMIN · HODIX</Text>
          </View>
          <Text style={styles.headerTitle}>Console Admin</Text>
        </View>
        <TouchableOpacity onPress={load} style={styles.iconBtn}>
          <RefreshCw color="#fff" size={18} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
              onPress={() => { setSearch(""); setActiveTab(tab.id); }}
            >
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
              {tab.badge != null && tab.badge > 0 ? (
                <View style={[styles.tabBadge, activeTab === tab.id && styles.tabBadgeActive]}>
                  <Text style={styles.tabBadgeText}>{tab.badge > 99 ? "99+" : tab.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {activeTab === "overview" && analytics && <OverviewTab analytics={analytics} />}
          {activeTab === "users" && (
            <UsersTab
              users={filteredUsers} search={search} onSearch={setSearch}
              onChangeRole={changeRole}
              onSuspend={(u) => confirm("Suspendre", `Suspendre ${u.full_name} ?`, () => doAction(`suspend-${u.id}`, () => api.post("/admin/users/deactivate", { user_id: u.id })))}
              actionLoading={actionLoading}
            />
          )}
          {activeTab === "tontines" && (
            <TontinesTab
              tontines={filteredTontines} search={search} onSearch={setSearch}
              onClose={(t) => confirm("Clôturer", `Clôturer "${t.name}" ?`, () => doAction(`close-${t.id}`, () => api.patch(`/admin/tontines/${t.id}`, { status: "closed" })))}
              onReopen={(t) => doAction(`open-${t.id}`, () => api.patch(`/admin/tontines/${t.id}`, { status: "active" }))}
              onSetAutoClose={setTontineAutoClose}
              onDelete={(t) => confirm("Supprimer", `Supprimer définitivement "${t.name}" et toutes ses données ?`, () => doAction(`del-${t.id}`, () => api.del(`/admin/tontines/${t.id}`)))}
              actionLoading={actionLoading}
            />
          )}
          {activeTab === "kyc" && (
            <KycTab
              kyc={kyc}
              onApprove={(k) => doAction(`kyc-a-${k.user_id}`, () => api.post("/admin/kyc/approve", { user_id: k.user_id }))}
              onReject={(k) => confirm("Rejeter KYC", `Rejeter le dossier de ${k.full_name} ?`, () => doAction(`kyc-r-${k.user_id}`, () => api.post("/admin/kyc/reject", { user_id: k.user_id })))}
              actionLoading={actionLoading}
            />
          )}
          {activeTab === "promotions" && (
            <PromotionsTab
              promotions={promotions}
              onApprove={(p) => doAction(`prom-a-${p.user_id}`, () => api.post("/admin/promotion/approve", { user_id: p.user_id }))}
              onReject={(p) => confirm("Refuser", `Refuser la promotion de ${p.full_name} ?`, () => doAction(`prom-r-${p.user_id}`, () => api.post("/admin/promotion/reject", { user_id: p.user_id })))}
              actionLoading={actionLoading}
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ── Overview Tab ─────────────────────────────────────────────── */
function OverviewTab({ analytics: a }: { analytics: Analytics }) {
  return (
    <View>
      {/* Hero KPI */}
      <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={styles.hero}>
        <Text style={styles.heroLbl}>💰 Volume total épargne + contributions</Text>
        <Text style={styles.heroVal}>{formatXAF(a.savings_volume + a.contributions_volume)}</Text>
        <View style={styles.heroStats}>
          <HeroStat label="Membres" val={`${a.users.total}`} />
          <HeroStat label="+7 jours" val={`+${a.users.new_7d}`} />
          <HeroStat label="+30 jours" val={`+${a.users.new_30d}`} />
        </View>
      </LinearGradient>

      <SectionHdr icon={<Users color={Colors.secondary} size={16} />} label="Utilisateurs" />
      <View style={styles.kpiGrid}>
        <KpiCard label="Total membres" val={`${a.users.total}`} color={Colors.secondary} icon="👥" />
        <KpiCard label="Managers" val={`${a.users.managers}`} color={Colors.primary} icon="🏆" />
        <KpiCard label="Nouveaux 7j" val={`+${a.users.new_7d}`} color={Colors.accent} icon="🆕" />
        <KpiCard label="Nouveaux 30j" val={`+${a.users.new_30d}`} color={Colors.warning} icon="📈" />
      </View>

      <SectionHdr icon={<Database color={Colors.primary} size={16} />} label="Groupes & Communautés" />
      <View style={styles.kpiGrid}>
        <KpiCard label="Tontines actives" val={`${a.tontines.active}`} color={Colors.primary} icon="✅" />
        <KpiCard label="Tontines clôturées" val={`${a.tontines.closed}`} color={Colors.textMuted} icon="🔒" />
        <KpiCard label="Associations" val={`${a.associations}`} color={Colors.secondary} icon="🤝" />
        <KpiCard label="Coopératives" val={`${a.cooperatives}`} color={Colors.accent} icon="🏗️" />
      </View>

      <SectionHdr icon={<BarChart3 color={Colors.accent} size={16} />} label="Finances & KYC" />
      <View style={styles.kpiGrid}>
        <KpiCard label="Épargne totale" val={formatXAF(a.savings_volume)} color={Colors.accent} icon="💵" />
        <KpiCard label="Contributions" val={formatXAF(a.contributions_volume)} color={Colors.secondary} icon="💳" />
        <KpiCard label="KYC approuvés" val={`${a.kyc.approved}`} color={Colors.success} icon="✔️" />
        <KpiCard label="KYC en attente" val={`${a.kyc.pending}`} color={Colors.warning} icon="⏳" />
      </View>

      <SectionHdr icon={<TrendingUp color={Colors.secondary} size={16} />} label="Croissance membres (30j)" />
      <View style={{ paddingHorizontal: Spacing.xl }}>
        <Card>
          <LineChart title="Membres cumulés" data={a.user_series} color={Colors.primary} format={(v) => `${Math.round(v)}`} />
        </Card>
      </View>
    </View>
  );
}

/* ── Users Tab ─────────────────────────────────────────────────── */
function UsersTab({ users, search, onSearch, onChangeRole, onSuspend, actionLoading }: {
  users: any[]; search: string; onSearch: (s: string) => void;
  onChangeRole: (u: any) => void; onSuspend: (u: any) => void; actionLoading: string | null;
}) {
  return (
    <View>
      <SearchBar value={search} onChange={onSearch} placeholder="Rechercher un membre…" />
      <View style={{ paddingHorizontal: Spacing.xl, marginBottom: 10 }}>
        <Text style={styles.listCount}>{users.length} membre{users.length !== 1 ? "s" : ""}</Text>
      </View>
      {users.map(u => (
        <View key={u.id} style={{ paddingHorizontal: Spacing.xl, marginBottom: 8 }}>
          <Card style={{ gap: 0 }}>
            <View style={styles.userRow}>
              <View style={[styles.avatarCircle, { backgroundColor: roleColor(u.role) + "22" }]}>
                <Text style={[styles.avatarLetter, { color: roleColor(u.role) }]}>
                  {(u.full_name?.[0] ?? "?").toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{u.full_name || "—"}</Text>
                <Text style={styles.userMeta}>{u.phone || u.country || "—"} · {u.created_at?.slice(0, 10)}</Text>
                <View style={[styles.rolePill, { backgroundColor: roleColor(u.role) + "22" }]}>
                  <Text style={[styles.rolePillTxt, { color: roleColor(u.role) }]}>{roleLabel(u.role)}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => onChangeRole(u)}>
                  <Crown color={Colors.secondary} size={13} />
                  <Text style={styles.actionBtnTxt}>Rôle</Text>
                </TouchableOpacity>
                {u.role !== "suspended" ? (
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.dangerLight }]} onPress={() => onSuspend(u)}>
                    <Lock color={Colors.danger} size={13} />
                    <Text style={[styles.actionBtnTxt, { color: Colors.danger }]}>Suspendre</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.actionBtn, { backgroundColor: Colors.warningLight }]}>
                    <AlertTriangle color={Colors.warning} size={13} />
                    <Text style={[styles.actionBtnTxt, { color: Colors.warning }]}>Suspendu</Text>
                  </View>
                )}
              </View>
            </View>
          </Card>
        </View>
      ))}
    </View>
  );
}

/* ── Tontines Tab ──────────────────────────────────────────────── */
function TontinesTab({ tontines, search, onSearch, onClose, onReopen, onSetAutoClose, onDelete, actionLoading }: {
  tontines: any[]; search: string; onSearch: (s: string) => void;
  onClose: (t: any) => void; onReopen: (t: any) => void;
  onSetAutoClose: (t: any) => void; onDelete: (t: any) => void;
  actionLoading: string | null;
}) {
  return (
    <View>
      <SearchBar value={search} onChange={onSearch} placeholder="Rechercher une tontine…" />
      <View style={{ paddingHorizontal: Spacing.xl, marginBottom: 10 }}>
        <Text style={styles.listCount}>{tontines.length} tontine{tontines.length !== 1 ? "s" : ""}</Text>
      </View>
      {tontines.map(t => (
        <View key={t.id} style={{ paddingHorizontal: Spacing.xl, marginBottom: 10 }}>
          <Card style={{ gap: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <View style={[styles.tontineIcon, { backgroundColor: t.status === "active" ? Colors.successLight : Colors.surfaceAlt }]}>
                <Text style={{ fontSize: 22 }}>{t.status === "active" ? "✅" : "🔒"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tontineName}>{t.name}</Text>
                <Text style={styles.tontineMeta}>{t.members_count} membres · {formatXAF(t.amount_per_cycle)}/{t.frequency}</Text>
                <Text style={styles.tontineMeta}>Créateur : {t.owner_name} · {t.created_at?.slice(0, 10)}</Text>
                {t.auto_close_date ? (
                  <Text style={[styles.tontineMeta, { color: Colors.warning }]}>⏰ Clôture auto : {t.auto_close_date}</Text>
                ) : (
                  <Text style={[styles.tontineMeta, { color: Colors.textSubtle }]}>⏳ Durée indéfinie</Text>
                )}
                <View style={[styles.statusPill, { backgroundColor: t.status === "active" ? Colors.successLight : Colors.surfaceAlt }]}>
                  <Text style={[styles.statusPillTxt, { color: t.status === "active" ? Colors.success : Colors.textMuted }]}>
                    {t.status === "active" ? "Active" : t.status === "closed" ? "Clôturée" : t.status}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.tontineActions}>
              <TouchableOpacity style={[styles.tontineBtn, { backgroundColor: Colors.secondaryLight }]} onPress={() => onSetAutoClose(t)}>
                <Clock color={Colors.secondary} size={13} />
                <Text style={[styles.tonBtnTxt, { color: Colors.secondary }]}>Durée</Text>
              </TouchableOpacity>
              {t.status === "active" ? (
                <TouchableOpacity style={[styles.tontineBtn, { backgroundColor: Colors.warningLight }]} onPress={() => onClose(t)}>
                  <Lock color={Colors.warning} size={13} />
                  <Text style={[styles.tonBtnTxt, { color: Colors.warning }]}>Clôturer</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.tontineBtn, { backgroundColor: Colors.successLight }]} onPress={() => onReopen(t)}>
                  <Unlock color={Colors.success} size={13} />
                  <Text style={[styles.tonBtnTxt, { color: Colors.success }]}>Rouvrir</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.tontineBtn, { backgroundColor: Colors.dangerLight }]} onPress={() => onDelete(t)}>
                <Trash2 color={Colors.danger} size={13} />
                <Text style={[styles.tonBtnTxt, { color: Colors.danger }]}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      ))}
    </View>
  );
}

/* ── KYC Tab ───────────────────────────────────────────────────── */
function KycTab({ kyc, onApprove, onReject, actionLoading }: {
  kyc: any[]; onApprove: (k: any) => void; onReject: (k: any) => void; actionLoading: string | null;
}) {
  const pending = kyc.filter(k => k.status === "pending");
  const done = kyc.filter(k => k.status !== "pending");
  return (
    <View style={{ paddingHorizontal: Spacing.xl }}>
      <Text style={[styles.listCount, { marginVertical: 12 }]}>{pending.length} dossier{pending.length !== 1 ? "s" : ""} en attente</Text>
      {pending.length === 0 && (
        <Card><Text style={{ color: Colors.textMuted, textAlign: "center", padding: 20 }}>✅ Aucun dossier en attente</Text></Card>
      )}
      {pending.map(k => (
        <Card key={k.id} style={{ marginBottom: 10, gap: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <View style={[styles.avatarCircle, { backgroundColor: Colors.warningLight }]}>
              <AlertTriangle color={Colors.warning} size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{k.full_name}</Text>
              <Text style={styles.userMeta}>{k.phone} · {k.country}</Text>
              <Text style={styles.userMeta}>Soumis le {k.submitted_at?.slice(0, 10)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={[styles.kycBtn, { backgroundColor: Colors.success }]} onPress={() => onApprove(k)}>
              <CheckCircle color="#fff" size={14} />
              <Text style={styles.kycBtnTxt}>Approuver</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.kycBtn, { backgroundColor: Colors.danger }]} onPress={() => onReject(k)}>
              <XCircle color="#fff" size={14} />
              <Text style={styles.kycBtnTxt}>Rejeter</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ))}
      {done.length > 0 && (
        <>
          <Text style={[styles.listCount, { marginTop: 16, marginBottom: 8 }]}>Traités récemment ({done.length})</Text>
          {done.slice(0, 10).map(k => (
            <Card key={k.id} style={{ marginBottom: 6, opacity: 0.65, gap: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[styles.avatarCircle, { backgroundColor: k.status === "approved" ? Colors.successLight : Colors.dangerLight }]}>
                  {k.status === "approved"
                    ? <CheckCircle color={Colors.success} size={16} />
                    : <XCircle color={Colors.danger} size={16} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{k.full_name}</Text>
                  <Text style={styles.userMeta}>{k.status === "approved" ? "✅ Approuvé" : "❌ Refusé"}</Text>
                </View>
              </View>
            </Card>
          ))}
        </>
      )}
    </View>
  );
}

/* ── Promotions Tab ────────────────────────────────────────────── */
function PromotionsTab({ promotions, onApprove, onReject, actionLoading }: {
  promotions: any[]; onApprove: (p: any) => void; onReject: (p: any) => void; actionLoading: string | null;
}) {
  const pending = promotions.filter(p => p.status === "pending");
  const done = promotions.filter(p => p.status !== "pending");
  return (
    <View style={{ paddingHorizontal: Spacing.xl }}>
      <Text style={[styles.listCount, { marginVertical: 12 }]}>{pending.length} demande{pending.length !== 1 ? "s" : ""} en attente</Text>
      {pending.length === 0 && (
        <Card><Text style={{ color: Colors.textMuted, textAlign: "center", padding: 20 }}>✅ Aucune demande en attente</Text></Card>
      )}
      {pending.map(p => (
        <Card key={p.id} style={{ marginBottom: 10, gap: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <View style={[styles.avatarCircle, { backgroundColor: Colors.secondaryLight }]}>
              <Star color={Colors.secondary} size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{p.full_name}</Text>
              <Text style={styles.userMeta}>{p.phone}</Text>
              <Text style={styles.userMeta}>{p.body}</Text>
              <Text style={styles.userMeta}>{p.created_at?.slice(0, 10)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={[styles.kycBtn, { backgroundColor: Colors.success }]} onPress={() => onApprove(p)}>
              <UserCheck color="#fff" size={14} />
              <Text style={styles.kycBtnTxt}>Promouvoir Manager</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.kycBtn, { backgroundColor: Colors.danger }]} onPress={() => onReject(p)}>
              <XCircle color="#fff" size={14} />
              <Text style={styles.kycBtnTxt}>Refuser</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ))}
      {done.length > 0 && (
        <>
          <Text style={[styles.listCount, { marginTop: 16, marginBottom: 8 }]}>Traitées ({done.length})</Text>
          {done.slice(0, 5).map(p => (
            <Card key={p.id} style={{ marginBottom: 6, opacity: 0.65, gap: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[styles.avatarCircle, { backgroundColor: Colors.successLight }]}>
                  <CheckCircle color={Colors.success} size={16} />
                </View>
                <View>
                  <Text style={styles.userName}>{p.full_name}</Text>
                  <Text style={styles.userMeta}>Traitée</Text>
                </View>
              </View>
            </Card>
          ))}
        </>
      )}
    </View>
  );
}

/* ── Shared helpers ────────────────────────────────────────────── */
function HeroStat({ label, val }: { label: string; val: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 2 }}>{val}</Text>
    </View>
  );
}

function KpiCard({ label, val, color, icon }: { label: string; val: string; color: string; icon: string }) {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: color }]}>
      <Text style={{ fontSize: 20, marginBottom: 4 }}>{icon}</Text>
      <Text style={[styles.kpiVal, { color }]}>{val}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function SectionHdr({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.sectionHdr}>
      {icon}
      <Text style={styles.sectionHdrText}>{label}</Text>
    </View>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder: string }) {
  return (
    <View style={styles.searchWrap}>
      <Search color={Colors.textMuted} size={16} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSubtle}
      />
    </View>
  );
}

function roleLabel(r: string) {
  switch (r) {
    case "super_admin": case "admin": return "Super Admin";
    case "tontine_manager": return "Manager";
    case "suspended": return "Suspendu";
    default: return "Membre";
  }
}

function roleColor(r: string) {
  switch (r) {
    case "super_admin": case "admin": return Colors.danger;
    case "tontine_manager": return Colors.secondary;
    case "suspended": return Colors.textMuted;
    default: return Colors.primary;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, minHeight: 200 },
  denied: { fontSize: 22, fontWeight: "900", color: Colors.danger, marginTop: 16 },
  deniedSub: { fontSize: 14, color: Colors.textMuted, marginTop: 8, textAlign: "center" },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 12 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  adminBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(245,200,66,0.15)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start", marginBottom: 4, borderWidth: 1, borderColor: "rgba(245,200,66,0.35)" },
  adminBadgeText: { color: Colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: -0.3 },

  tabBar: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 8 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 6 },
  tabBtnActive: { backgroundColor: Colors.primary + "18" },
  tabText: { fontSize: 13, fontWeight: "700", color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },
  tabBadge: { backgroundColor: Colors.textMuted, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, minWidth: 20, alignItems: "center" },
  tabBadgeActive: { backgroundColor: Colors.primary },
  tabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  hero: { margin: Spacing.xl, borderRadius: Radius.xxl, padding: 24, ...Shadow.cardDark },
  heroLbl: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  heroVal: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -1, marginTop: 6, marginBottom: 16 },
  heroStats: { flexDirection: "row", justifyContent: "space-around", paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: Spacing.xl, gap: 10, marginBottom: 4 },
  kpiCard: { flex: 1, minWidth: "45%", backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: 14, borderLeftWidth: 3, ...Shadow.card },
  kpiVal: { fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  kpiLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 },

  sectionHdr: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: Spacing.xl, marginTop: Spacing.xl, marginBottom: 10 },
  sectionHdrText: { fontSize: 14, fontWeight: "900", color: Colors.text },

  listCount: { fontSize: 12, color: Colors.textMuted, fontWeight: "700" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.surface, margin: Spacing.xl, marginBottom: 10, padding: 12, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text, outlineStyle: "none" } as any,

  userRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: 18, fontWeight: "900" },
  userName: { fontSize: 14, fontWeight: "800", color: Colors.text },
  userMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start", marginTop: 4 },
  rolePillTxt: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.secondaryLight },
  actionBtnTxt: { fontSize: 11, fontWeight: "700", color: Colors.secondary },

  tontineIcon: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tontineName: { fontSize: 15, fontWeight: "800", color: Colors.text },
  tontineMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start", marginTop: 6 },
  statusPillTxt: { fontSize: 10, fontWeight: "800" },
  tontineActions: { flexDirection: "row", gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  tontineBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 8 },
  tonBtnTxt: { fontSize: 11, fontWeight: "700" },

  kycBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  kycBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "800" },

  surfaceAlt: Colors.surfaceAlt,
  successLight: Colors.successLight,
});
