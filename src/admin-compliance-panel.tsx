/**
 * Admin compliance dashboard — audit trail + fraud alerts queue.
 */
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Shield,
  XCircle,
} from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import { supabase } from "@/src/supabase";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { SkeletonCard } from "@/src/ui";

type SubTab = "alerts" | "audit";

export interface ComplianceAuditEntry {
  id: string;
  created_at: string;
  user_id: string | null;
  actor_id: string | null;
  event_category: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  amount_xaf: number | null;
  metadata: Record<string, unknown>;
}

export interface FraudAlertEntry {
  id: string;
  created_at: string;
  user_id: string;
  severity: string;
  alert_type: string;
  amount_xaf: number | null;
  flags: string[];
  status: string;
  metadata: Record<string, unknown>;
}

interface ComplianceStats {
  open_fraud_alerts: number;
  critical_fraud_alerts: number;
  audit_24h: number;
}

const AUDIT_CATEGORIES = [
  { key: "", label: "Tous" },
  { key: "fraud", label: "Fraude" },
  { key: "kyc", label: "KYC" },
  { key: "financial", label: "Financier" },
  { key: "security", label: "Sécurité" },
  { key: "admin", label: "Admin" },
  { key: "auth", label: "Auth" },
] as const;

const ALERT_STATUS_FILTERS = [
  { key: "open", label: "Ouverts" },
  { key: "reviewed", label: "Revus" },
  { key: "confirmed", label: "Confirmés" },
  { key: "dismissed", label: "Classés" },
] as const;

const SEVERITY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  critical: { bg: "#FEE2E2", color: "#991B1B", label: "Critique" },
  high: { bg: "#FFEDD5", color: "#9A3412", label: "Élevé" },
  medium: { bg: "#FEF3C7", color: "#92400E", label: "Moyen" },
  low: { bg: "#E0E7FF", color: "#3730A3", label: "Faible" },
};

function shortId(id: string | null | undefined) {
  if (!id) return "—";
  return id.slice(0, 8) + "…";
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function categoryStyle(cat: string) {
  switch (cat) {
    case "fraud": return { bg: "#FEE2E2", color: "#991B1B" };
    case "kyc": return { bg: "#DBEAFE", color: "#1D4ED8" };
    case "financial": return { bg: "#D1FAE5", color: "#065F46" };
    case "security": return { bg: "#FEF3C7", color: "#92400E" };
    case "admin": return { bg: "#EDE9FE", color: "#5B21B6" };
    default: return { bg: "#F3F4F6", color: "#374151" };
  }
}

export function AdminCompliancePanel({ embedded = false }: { embedded?: boolean }) {
  const { show } = useToast();
  const [subTab, setSubTab] = useState<SubTab>("alerts");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<ComplianceStats | null>(null);
  const [audit, setAudit] = useState<ComplianceAuditEntry[]>([]);
  const [alerts, setAlerts] = useState<FraudAlertEntry[]>([]);
  const [auditCategory, setAuditCategory] = useState("");
  const [alertStatus, setAlertStatus] = useState("open");
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch { return null; }
    };
    const auditQs = auditCategory ? `?limit=80&category=${auditCategory}` : "?limit=80";
    const [st, au, al] = await Promise.all([
      safe(() => api.get<ComplianceStats>("/admin/compliance/stats")),
      safe(() => api.get<ComplianceAuditEntry[]>(`/admin/compliance/audit${auditQs}`)),
      safe(() => api.get<FraudAlertEntry[]>(`/admin/compliance/fraud-alerts?status=${alertStatus}`)),
    ]);
    if (st) setStats(st);
    if (au) setAudit(au);
    if (al) setAlerts(al);
    setLoading(false);
  }, [auditCategory, alertStatus]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
    const ch = supabase
      .channel("rt-admin-compliance")
      .on("postgres_changes", { event: "*", schema: "public", table: "fraud_alerts" }, () => { load(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "compliance_audit_log" }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const reviewAlert = async (alertId: string, status: "reviewed" | "dismissed" | "confirmed") => {
    setReviewingId(alertId);
    try {
      await api.post("/admin/compliance/fraud-review", { alert_id: alertId, status });
      show(
        status === "confirmed" ? "Alerte confirmée" : status === "dismissed" ? "Alerte classée" : "Alerte revue",
        "success",
      );
      load();
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    } finally {
      setReviewingId(null);
    }
  };

  if (loading && !stats) {
    return (
      <View style={{ padding: Spacing.xl, gap: 12 }}>
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Stats strip */}
      <LinearGradient colors={["#0B1F3A", "#134E4A"]} style={styles.statsHero}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{stats?.open_fraud_alerts ?? 0}</Text>
            <Text style={styles.statLbl}>Alertes ouvertes</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: "#FCA5A5" }]}>{stats?.critical_fraud_alerts ?? 0}</Text>
            <Text style={styles.statLbl}>Critiques</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: "#6EE7B7" }]}>{stats?.audit_24h ?? 0}</Text>
            <Text style={styles.statLbl}>Audit 24h</Text>
          </View>
        </View>
        {!embedded && (
          <Text style={styles.heroSub}>COBAC / CEMAC — traçabilité LCB-FT et file fraude temps réel</Text>
        )}
      </LinearGradient>

      {/* Sub-tabs */}
      <View style={styles.subTabRow}>
        <TouchableOpacity
          style={[styles.subTab, subTab === "alerts" && styles.subTabActive]}
          onPress={() => setSubTab("alerts")}
        >
          <AlertTriangle size={14} color={subTab === "alerts" ? "#fff" : Colors.textMuted} />
          <Text style={[styles.subTabText, subTab === "alerts" && styles.subTabTextActive]}>Alertes fraude</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === "audit" && styles.subTabActive]}
          onPress={() => setSubTab("audit")}
        >
          <FileText size={14} color={subTab === "audit" ? "#fff" : Colors.textMuted} />
          <Text style={[styles.subTabText, subTab === "audit" && styles.subTabTextActive]}>Journal audit</Text>
        </TouchableOpacity>
      </View>

      {subTab === "alerts" ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {ALERT_STATUS_FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, alertStatus === f.key && styles.filterChipActive]}
                onPress={() => { setAlertStatus(f.key); setLoading(true); }}
              >
                <Text style={[styles.filterChipText, alertStatus === f.key && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <FlatList
            data={alerts}
            keyExtractor={(a) => a.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 100, gap: 10 }}
            renderItem={({ item: a }) => {
              const sev = SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.medium;
              const isOpen = a.status === "open";
              return (
                <View style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertType}>{a.alert_type.replace(/_/g, " ")}</Text>
                      <Text style={styles.cardMeta}>{formatWhen(a.created_at)} · user {shortId(a.user_id)}</Text>
                    </View>
                    <View style={[styles.sevBadge, { backgroundColor: sev.bg }]}>
                      <Text style={[styles.sevText, { color: sev.color }]}>{sev.label}</Text>
                    </View>
                  </View>
                  {a.amount_xaf != null && a.amount_xaf > 0 ? (
                    <Text style={styles.amount}>{formatXAF(a.amount_xaf)}</Text>
                  ) : null}
                  {a.flags?.length > 0 ? (
                    <View style={styles.flagsRow}>
                      {a.flags.map((f) => (
                        <View key={f} style={styles.flagChip}>
                          <Text style={styles.flagText}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {isOpen ? (
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionConfirm]}
                        onPress={() => reviewAlert(a.id, "confirmed")}
                        disabled={reviewingId === a.id}
                      >
                        {reviewingId === a.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Shield size={13} color="#fff" />
                            <Text style={styles.actionText}>Confirmer</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionReview]}
                        onPress={() => reviewAlert(a.id, "reviewed")}
                        disabled={reviewingId === a.id}
                      >
                        <CheckCircle size={13} color="#065F46" />
                        <Text style={[styles.actionText, { color: "#065F46" }]}>Revu</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionDismiss]}
                        onPress={() => reviewAlert(a.id, "dismissed")}
                        disabled={reviewingId === a.id}
                      >
                        <XCircle size={13} color="#6B7280" />
                        <Text style={[styles.actionText, { color: "#6B7280" }]}>Classer</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.statusClosed}>
                      <Text style={styles.statusClosedText}>Statut : {a.status}</Text>
                    </View>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Shield color={Colors.textMuted} size={32} />
                <Text style={styles.empty}>Aucune alerte {alertStatus === "open" ? "ouverte" : ""}</Text>
              </View>
            }
          />
        </>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {AUDIT_CATEGORIES.map((f) => (
              <TouchableOpacity
                key={f.key || "all"}
                style={[styles.filterChip, auditCategory === f.key && styles.filterChipActive]}
                onPress={() => { setAuditCategory(f.key); setLoading(true); }}
              >
                <Text style={[styles.filterChipText, auditCategory === f.key && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <FlatList
            data={audit}
            keyExtractor={(e) => e.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 100, gap: 8 }}
            renderItem={({ item: e }) => {
              const cat = categoryStyle(e.event_category);
              const expanded = expandedAudit === e.id;
              const metaStr = JSON.stringify(e.metadata ?? {}, null, 2);
              return (
                <TouchableOpacity
                  style={styles.auditCard}
                  onPress={() => setExpandedAudit(expanded ? null : e.id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.auditTop}>
                    <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
                      <Text style={[styles.catText, { color: cat.color }]}>{e.event_category}</Text>
                    </View>
                    <Text style={styles.auditTime}>{formatWhen(e.created_at)}</Text>
                    {expanded ? <ChevronUp size={16} color={Colors.textMuted} /> : <ChevronDown size={16} color={Colors.textMuted} />}
                  </View>
                  <Text style={styles.auditEvent}>{e.event_type}</Text>
                  <Text style={styles.auditMeta}>
                    user {shortId(e.user_id)}
                    {e.amount_xaf ? ` · ${formatXAF(e.amount_xaf)}` : ""}
                    {e.entity_type ? ` · ${e.entity_type}` : ""}
                  </Text>
                  {expanded && (
                    <View style={styles.metaBox}>
                      <Text style={styles.metaLabel}>Métadonnées</Text>
                      <Text style={styles.metaJson} selectable>{metaStr}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <FileText color={Colors.textMuted} size={32} />
                <Text style={styles.empty}>Aucun événement d'audit</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statsHero: {
    marginHorizontal: Spacing.xl,
    marginTop: 12,
    marginBottom: 12,
    borderRadius: Radius.xl,
    padding: 16,
  },
  statsRow: { flexDirection: "row", justifyContent: "space-between" },
  statBox: { alignItems: "center", flex: 1 },
  statVal: { color: "#F8FAFC", fontSize: 22, fontWeight: "900" },
  statLbl: { color: "rgba(226,232,240,0.75)", fontSize: 10, fontWeight: "600", marginTop: 4, textAlign: "center" },
  heroSub: { color: "rgba(226,232,240,0.6)", fontSize: 11, marginTop: 12, textAlign: "center" },
  subTabRow: {
    flexDirection: "row",
    marginHorizontal: Spacing.xl,
    marginBottom: 10,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  subTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  subTabActive: { backgroundColor: Colors.primary },
  subTabText: { fontSize: 12, fontWeight: "700", color: Colors.textMuted },
  subTabTextActive: { color: "#fff" },
  filterRow: { paddingHorizontal: Spacing.xl, gap: 8, paddingBottom: 10 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: "#0B1F3A", borderColor: "#0B1F3A" },
  filterChipText: { fontSize: 12, fontWeight: "600", color: Colors.textMuted },
  filterChipTextActive: { color: "#fff" },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  alertType: { fontSize: 14, fontWeight: "800", color: Colors.text, textTransform: "capitalize" },
  cardMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  sevBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  sevText: { fontSize: 10, fontWeight: "800" },
  amount: { fontSize: 16, fontWeight: "800", color: Colors.primary, marginTop: 10 },
  flagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  flagChip: { backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  flagText: { fontSize: 10, fontWeight: "700", color: "#92400E" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionConfirm: { backgroundColor: "#DC2626" },
  actionReview: { backgroundColor: "#D1FAE5" },
  actionDismiss: { backgroundColor: "#F3F4F6" },
  actionText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  statusClosed: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  statusClosedText: { fontSize: 12, fontWeight: "600", color: Colors.textMuted, textTransform: "capitalize" },
  auditCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  auditTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  catText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  auditTime: { flex: 1, fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  auditEvent: { fontSize: 13, fontWeight: "700", color: Colors.text, marginTop: 8 },
  auditMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  metaBox: { marginTop: 10, backgroundColor: Colors.surfaceAlt, borderRadius: 8, padding: 10 },
  metaLabel: { fontSize: 10, fontWeight: "700", color: Colors.textMuted, marginBottom: 4 },
  metaJson: { fontSize: 10, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", color: Colors.text },
  emptyWrap: { alignItems: "center", paddingVertical: 48, gap: 12 },
  empty: { color: Colors.textMuted, fontSize: 14, fontWeight: "600" },
});
