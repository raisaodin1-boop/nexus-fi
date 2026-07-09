import { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert, Image, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { CheckCircle, XCircle, AlertTriangle, MessageSquare, UserCheck, Receipt } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import type { DiasporaRequest } from "@/src/db/diaspora";
import { Card } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { DiasporaStatusBadge } from "@/src/diaspora-ui";

type AdminItem = DiasporaRequest & {
  user?: { full_name?: string; email?: string; country?: string; kyc_status?: string };
};

const FILTERS = [
  { key: "all", label: "Toutes" },
  { key: "under_review", label: "En attente" },
  { key: "proof_submitted", label: "Preuves reçues" },
  { key: "validated", label: "Validées" },
  { key: "rejected", label: "Rejetées" },
  { key: "suspicious", label: "Suspectes" },
];

const REJECT_REASONS = [
  "Montant différent du montant attendu",
  "Référence absente ou incorrecte",
  "Preuve illisible",
  "Transaction introuvable",
  "Paiement déjà utilisé",
  "Mauvais numéro ou compte",
  "Informations supplémentaires nécessaires",
];

const ENROLL_REJECT = [
  "Document illisible ou incomplet",
  "Preuve de résidence à l'étranger insuffisante",
  "Pays de résidence incompatible (Cameroun)",
  "Identité non concordante",
  "Document suspect ou falsifié",
  "Informations complémentaires requises",
];

export function AdminDiasporaPanel({ embedded }: { embedded?: boolean }) {
  const { show } = useToast();
  const [section, setSection] = useState<"enrollments" | "contributions">("enrollments");

  return (
    <View style={{ flex: embedded ? undefined : 1 }}>
      <View style={styles.sectionTabs}>
        <TouchableOpacity style={[styles.sectionTab, section === "enrollments" && styles.sectionTabActive]} onPress={() => setSection("enrollments")}>
          <UserCheck size={14} color={section === "enrollments" ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.sectionTabText, section === "enrollments" && styles.sectionTabTextActive]}>Inscriptions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.sectionTab, section === "contributions" && styles.sectionTabActive]} onPress={() => setSection("contributions")}>
          <Receipt size={14} color={section === "contributions" ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.sectionTabText, section === "contributions" && styles.sectionTabTextActive]}>Cotisations</Text>
        </TouchableOpacity>
      </View>
      {section === "enrollments" ? <AdminDiasporaEnrollments /> : <AdminDiasporaContributions embedded={embedded} />}
    </View>
  );
}

function AdminDiasporaEnrollments() {
  const { show } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState("pending_review");
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, st] = await Promise.all([
        api.get<any[]>(`/admin/diaspora/enrollments?status=${filter === "all" ? "" : filter}`),
        api.get<{ pending: number; approved: number; rejected: number }>("/admin/diaspora/enrollments/stats"),
      ]);
      setItems(list);
      setStats(st);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openDetail = async (id: string) => {
    try {
      setSelected(await api.get<any>(`/admin/diaspora/enrollments/${id}`));
    } catch { show("Erreur chargement dossier", "error"); }
  };

  const approve = () => {
    if (!selected) return;
    Alert.alert("Approuver l'inscription Diaspora", "Activer le mode Diaspora pour ce membre ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Approuver", onPress: async () => {
        try {
          await api.post("/admin/diaspora/enrollment-approve", { enrollment_id: selected.id });
          show("Inscription approuvée", "success");
          setSelected(null);
          load();
        } catch (e) { show(e instanceof ApiError ? e.detail : "Erreur", "error"); }
      }},
    ]);
  };

  const reject = () => {
    if (!selected) return;
    Alert.alert("Rejeter l'inscription", "Choisissez un motif", [
      ...ENROLL_REJECT.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await api.post("/admin/diaspora/enrollment-reject", { enrollment_id: selected.id, reason });
            show("Inscription rejetée", "success");
            setSelected(null);
            load();
          } catch (e) { show(e instanceof ApiError ? e.detail : "Erreur", "error"); }
        },
      })),
      { text: "Annuler", style: "cancel" },
    ]);
  };

  if (selected) {
    return (
      <ScrollView contentContainerStyle={styles.detailScroll}>
        <TouchableOpacity onPress={() => setSelected(null)}><Text style={styles.back}>← Retour</Text></TouchableOpacity>
        <Text style={styles.detailTitle}>Inscription Diaspora</Text>
        <Card>
          <Text style={styles.member}>{selected.full_name}</Text>
          <Text style={styles.meta}>{selected.user?.email} · KYC: {selected.user?.kyc_status ?? "—"}</Text>
          <Text style={styles.meta}>{selected.address_line1}, {selected.postal_code} {selected.city}</Text>
          <Text style={styles.meta}>{selected.country_of_residence} · {selected.preferred_currency}</Text>
          <Text style={styles.meta}>Tél. {selected.phone} · Doc: {selected.id_document_type}</Text>
          {selected.id_front_url ? <Image source={{ uri: selected.id_front_url }} style={styles.proofImg} resizeMode="contain" /> : null}
          {selected.selfie_url ? <Image source={{ uri: selected.selfie_url }} style={styles.proofImg} resizeMode="contain" /> : null}
          {selected.proof_abroad_url ? <Image source={{ uri: selected.proof_abroad_url }} style={styles.proofImg} resizeMode="contain" /> : null}
        </Card>
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.actionBtn, styles.validateBtn]} onPress={approve}>
            <CheckCircle color="#fff" size={18} /><Text style={styles.actionText}>Activer Diaspora</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={reject}>
            <XCircle color="#fff" size={18} /><Text style={styles.actionText}>Rejeter</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <>
      <View style={styles.statsRow}>
        <StatPill label="En attente" value={stats.pending} color={Colors.warning} />
        <StatPill label="Approuvées" value={stats.approved} color={Colors.success} />
        <StatPill label="Rejetées" value={stats.rejected} color={Colors.danger} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {[{ key: "pending_review", label: "En attente" }, { key: "approved", label: "Approuvées" }, { key: "rejected", label: "Rejetées" }, { key: "all", label: "Toutes" }].map((f) => (
          <TouchableOpacity key={f.key} style={[styles.chip, filter === f.key && styles.chipActive]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} /> : (
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: 10, paddingBottom: 80 }}>
          {items.map((item) => (
            <TouchableOpacity key={item.id} onPress={() => openDetail(item.id)}>
              <Card>
                <Text style={styles.itemName}>{item.full_name ?? item.user?.full_name}</Text>
                <Text style={styles.itemTontine}>{item.country_of_residence} · {item.preferred_currency}</Text>
                <Text style={styles.itemAmount}>{item.status}</Text>
              </Card>
            </TouchableOpacity>
          ))}
          {!items.length ? <Text style={styles.empty}>Aucune inscription.</Text> : null}
        </ScrollView>
      )}
    </>
  );
}

function AdminDiasporaContributions({ embedded }: { embedded?: boolean }) {
  const { show } = useToast();
  const [items, setItems] = useState<AdminItem[]>([]);
  const [filter, setFilter] = useState("under_review");
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ pending: 0, received_today: 0, validated_total: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, st] = await Promise.all([
        api.get<AdminItem[]>(`/admin/diaspora/requests?status=${filter === "all" ? "" : filter}`),
        api.get<{ pending: number; received_today: number; validated_total: number }>("/admin/diaspora/stats"),
      ]);
      setItems(list);
      setStats(st);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openDetail = async (id: string) => {
    try {
      const d = await api.get<any>(`/admin/diaspora/requests/${id}`);
      setSelected(d);
    } catch {
      show("Impossible de charger le détail", "error");
    }
  };

  const validate = async () => {
    if (!selected) return;
    Alert.alert("Valider la cotisation", "Confirmer la validation manuelle ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Valider",
        onPress: async () => {
          try {
            await api.post("/admin/diaspora/validate", { request_id: selected.id });
            show("Cotisation validée", "success");
            setSelected(null);
            load();
          } catch (e) {
            show(e instanceof ApiError ? e.detail : "Erreur", "error");
          }
        },
      },
    ]);
  };

  const reject = () => {
    if (!selected) return;
    Alert.alert("Motif du rejet", "Choisissez un motif", [
      ...REJECT_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await api.post("/admin/diaspora/reject", { request_id: selected.id, reason });
            show("Cotisation rejetée", "success");
            setSelected(null);
            load();
          } catch (e) {
            show(e instanceof ApiError ? e.detail : "Erreur", "error");
          }
        },
      })),
      { text: "Annuler", style: "cancel" },
    ]);
  };

  if (selected) {
    return (
      <ScrollView contentContainerStyle={styles.detailScroll}>
        <TouchableOpacity onPress={() => setSelected(null)}>
          <Text style={styles.back}>← Retour à la liste</Text>
        </TouchableOpacity>
        <Text style={styles.detailTitle}>Validation Diaspora</Text>
        <Card>
          <Text style={styles.member}>{selected.user?.full_name} · {selected.user?.email}</Text>
          <Text style={styles.meta}>KYC : {selected.user?.kyc_status ?? "—"} · Pays : {selected.user?.country ?? "—"}</Text>
          <Text style={styles.tontine}>{selected.tontine_name}</Text>
          <Text style={styles.amount}>{formatXAF(selected.amount_expected)}</Text>
          <Text style={styles.ref}>Réf. {selected.reference_code}</Text>
          <DiasporaStatusBadge status={selected.status} />
          <View style={styles.compare}>
            <Text style={styles.compareLine}>Attendu : {formatXAF(selected.amount_expected)}</Text>
            <Text style={styles.compareLine}>Déclaré : {selected.declared_amount ? formatXAF(selected.declared_amount) : "—"}</Text>
            <Text style={styles.compareLine}>Méthode : {selected.payment_method ?? "—"}</Text>
            <Text style={styles.compareLine}>Payeur : {selected.payer_name ?? "—"}</Text>
          </View>
          {selected.comment ? <Text style={styles.comment}>« {selected.comment} »</Text> : null}
          {selected.proof_url ? (
            <Image source={{ uri: selected.proof_url }} style={styles.proofImg} resizeMode="contain" />
          ) : (
            <Text style={styles.noProof}>Aucune preuve jointe</Text>
          )}
        </Card>
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.actionBtn, styles.validateBtn]} onPress={validate}>
            <CheckCircle color="#fff" size={18} />
            <Text style={styles.actionText}>Valider</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={reject}>
            <XCircle color="#fff" size={18} />
            <Text style={styles.actionText}>Rejeter</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.warnBtn]} onPress={async () => {
            try {
              await api.post("/admin/diaspora/suspicious", { request_id: selected.id });
              show("Marqué suspect", "success");
              load();
            } catch (e) { show(e instanceof ApiError ? e.detail : "Erreur", "error"); }
          }}>
            <AlertTriangle color="#fff" size={18} />
            <Text style={styles.actionText}>Suspect</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.infoBtn]} onPress={() => {
            Alert.prompt?.("Demander des informations", "Message au membre", async (msg) => {
              if (!msg?.trim()) return;
              try {
                await api.post("/admin/diaspora/needs-info", { request_id: selected.id, message: msg });
                show("Demande envoyée", "success");
                setSelected(null);
                load();
              } catch (e) { show(e instanceof ApiError ? e.detail : "Erreur", "error"); }
            });
          }}>
            <MessageSquare color="#fff" size={18} />
            <Text style={styles.actionText}>Infos</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <>
      <View style={styles.statsRow}>
        <StatPill label="En attente" value={stats.pending} color={Colors.warning} />
        <StatPill label="Aujourd'hui" value={stats.received_today} color={Colors.info} />
        <StatPill label="Validées" value={stats.validated_total} color={Colors.success} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.key} style={[styles.chip, filter === f.key && styles.chipActive]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} /> : (
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: 10, paddingBottom: 80 }}>
          {items.map((item) => (
            <TouchableOpacity key={item.id} onPress={() => openDetail(item.id)}>
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.user?.full_name ?? "Membre"}</Text>
                    <Text style={styles.itemTontine}>{item.tontine_name}</Text>
                    <Text style={styles.itemAmount}>{formatXAF(item.amount_expected)} · {item.reference_code}</Text>
                  </View>
                  <DiasporaStatusBadge status={item.status} />
                </View>
              </Card>
            </TouchableOpacity>
          ))}
          {!items.length ? <Text style={styles.empty}>Aucune demande pour ce filtre.</Text> : null}
        </ScrollView>
      )}
    </>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: color + "44" }]}>
      <Text style={[styles.pillValue, { color }]}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTabs: { flexDirection: "row", gap: 8, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  sectionTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: Radius.lg, backgroundColor: Colors.surfaceAlt },
  sectionTabActive: { backgroundColor: Colors.primaryLight },
  sectionTabText: { fontSize: 12, fontWeight: "800", color: Colors.textMuted },
  sectionTabTextActive: { color: Colors.primary },
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  pill: { flex: 1, padding: 10, borderRadius: Radius.lg, borderWidth: 1, backgroundColor: Colors.surface, alignItems: "center" },
  pillValue: { fontSize: 18, fontWeight: "900" },
  pillLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  filters: { paddingHorizontal: Spacing.lg, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.surfaceAlt },
  chipActive: { backgroundColor: Colors.primaryLight },
  chipText: { fontSize: 12, fontWeight: "700", color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  empty: { textAlign: "center", color: Colors.textMuted, marginTop: 24 },
  row: { flexDirection: "row", gap: 12 },
  itemName: { fontSize: 14, fontWeight: "800", color: Colors.text },
  itemTontine: { fontSize: 12, color: Colors.textMuted },
  itemAmount: { fontSize: 11, color: Colors.secondary, marginTop: 4, fontWeight: "700" },
  detailScroll: { padding: Spacing.lg, paddingBottom: 80 },
  back: { color: Colors.secondary, fontWeight: "700", marginBottom: 8 },
  detailTitle: { fontSize: 20, fontWeight: "900", color: Colors.text, marginBottom: 12 },
  member: { fontSize: 15, fontWeight: "800", color: Colors.text },
  meta: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  tontine: { fontSize: 14, fontWeight: "700", color: Colors.text, marginTop: 12 },
  amount: { fontSize: 24, fontWeight: "900", color: Colors.primary },
  ref: { fontSize: 12, color: Colors.secondary, fontWeight: "700", marginVertical: 8 },
  compare: { marginTop: 12, gap: 4 },
  compareLine: { fontSize: 13, color: Colors.text },
  comment: { fontSize: 12, fontStyle: "italic", color: Colors.textMuted, marginTop: 10 },
  proofImg: { width: "100%", height: 220, marginTop: 12, borderRadius: Radius.lg, backgroundColor: Colors.surfaceAlt },
  noProof: { color: Colors.danger, marginTop: 12, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.lg },
  validateBtn: { backgroundColor: Colors.success },
  rejectBtn: { backgroundColor: Colors.danger },
  warnBtn: { backgroundColor: Colors.warning },
  infoBtn: { backgroundColor: Colors.secondary },
  actionText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
