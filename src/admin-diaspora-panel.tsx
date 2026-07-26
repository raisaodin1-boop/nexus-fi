import { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Linking, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { CheckCircle, XCircle, AlertTriangle, MessageSquare, UserCheck, Receipt, ExternalLink } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import type { DiasporaRequest } from "@/src/db/diaspora";
import { Card } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { DiasporaStatusBadge } from "@/src/diaspora-ui";

/** react-native-web Alert.alert is a no-op — use window.confirm on web. */
function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(
      typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`),
    );
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
      { text: "Confirmer", onPress: () => resolve(true) },
    ]);
  });
}

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
  const [section, setSection] = useState<"enrollments" | "contributions">("enrollments");

  return (
    <View style={[styles.panelRoot, embedded && styles.panelRootEmbedded]}>
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
      <View style={styles.panelBody}>
        {section === "enrollments" ? <AdminDiasporaEnrollments /> : <AdminDiasporaContributions embedded={embedded} />}
      </View>
    </View>
  );
}

function DocPreview({ label, uri }: { label: string; uri?: string | null }) {
  if (!uri) return null;
  return (
    <View style={styles.docBlock}>
      <View style={styles.docHeader}>
        <Text style={styles.docLabel}>{label}</Text>
        <TouchableOpacity
          onPress={() => Linking.openURL(uri).catch(() => {})}
          style={styles.docOpenBtn}
          hitSlop={8}
        >
          <ExternalLink size={14} color={Colors.primary} />
          <Text style={styles.docOpenText}>Ouvrir</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity activeOpacity={0.9} onPress={() => Linking.openURL(uri).catch(() => {})}>
        <Image source={{ uri }} style={styles.proofImg} resizeMode="contain" />
      </TouchableOpacity>
    </View>
  );
}

function AdminDiasporaEnrollments() {
  const { show } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState("pending_review");
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [choicePicker, setChoicePicker] = useState<null | { kind: "reject" | "info"; options: string[] }>(null);
  const [stats, setStats] = useState({ pending: 0, needs_info: 0, approved: 0, rejected: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const statusQs = filter === "all" ? "all" : filter;
      let list: any[] = [];
      try {
        list = await api.get<any[]>(`/admin/diaspora/enrollments?status=${encodeURIComponent(statusQs)}`);
      } catch (e) {
        setLoadError(e instanceof ApiError ? e.detail : "Impossible de charger les inscriptions.");
        list = [];
      }
      setItems(Array.isArray(list) ? list : []);
      try {
        const st = await api.get<{ pending: number; needs_info?: number; approved: number; rejected: number }>(
          "/admin/diaspora/enrollments/stats",
        );
        setStats({
          pending: st.pending ?? 0,
          needs_info: st.needs_info ?? 0,
          approved: st.approved ?? 0,
          rejected: st.rejected ?? 0,
        });
      } catch { /* keep previous stats */ }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openDetail = async (id: string) => {
    try {
      setChoicePicker(null);
      setSelected(await api.get<any>(`/admin/diaspora/enrollments/${id}`));
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur chargement dossier", "error");
    }
  };

  const approve = async () => {
    if (!selected || busy) return;
    const ok = await confirmAction(
      "Approuver l'inscription Diaspora",
      "Activer le mode Diaspora pour ce membre ? Une notification lui sera envoyée.",
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.post("/admin/diaspora/enrollment-approve", { enrollment_id: selected.id });
      show("Inscription approuvée — mode Diaspora activé", "success");
      setSelected(null);
      setChoicePicker(null);
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur validation", "error");
    } finally {
      setBusy(false);
    }
  };

  const reject = () => {
    if (!selected || busy) return;
    setChoicePicker({ kind: "reject", options: ENROLL_REJECT });
  };

  const requestInfo = () => {
    if (!selected || busy) return;
    setChoicePicker({
      kind: "info",
      options: [
        "Merci de renvoyer une photo plus lisible de votre pièce d'identité.",
        "Preuve de résidence à l'étranger manquante ou insuffisante.",
        "Selfie non conforme — visage bien visible, fond neutre.",
        "Coordonnées incomplètes — vérifiez adresse et téléphone.",
      ],
    });
  };

  const runChoice = async (value: string) => {
    if (!selected || busy || !choicePicker) return;
    setBusy(true);
    try {
      if (choicePicker.kind === "reject") {
        await api.post("/admin/diaspora/enrollment-reject", { enrollment_id: selected.id, reason: value });
        show("Inscription rejetée", "success");
      } else {
        await api.post("/admin/diaspora/enrollment-needs-info", {
          enrollment_id: selected.id,
          message: value,
        });
        show("Demande envoyée au membre", "success");
      }
      setSelected(null);
      setChoicePicker(null);
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    } finally {
      setBusy(false);
    }
  };

  if (selected) {
    return (
      <View style={styles.detailRoot}>
        <View style={styles.detailTop}>
          <TouchableOpacity onPress={() => setSelected(null)} hitSlop={8}>
            <Text style={styles.back}>← Retour à la liste</Text>
          </TouchableOpacity>
          <Text style={styles.detailTitle}>Inscription Diaspora</Text>
          <View style={styles.actionsSticky}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.validateBtn, busy && styles.actionDisabled]}
              onPress={approve}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <CheckCircle color="#fff" size={16} />}
              <Text style={styles.actionText}>Activer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Colors.warning }, busy && styles.actionDisabled]}
              onPress={requestInfo}
              disabled={busy}
            >
              <MessageSquare color="#fff" size={16} /><Text style={styles.actionText}>Infos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn, busy && styles.actionDisabled]}
              onPress={reject}
              disabled={busy}
            >
              <XCircle color="#fff" size={16} /><Text style={styles.actionText}>Rejeter</Text>
            </TouchableOpacity>
          </View>
          {choicePicker ? (
            <View style={styles.choiceBox}>
              <Text style={styles.choiceTitle}>
                {choicePicker.kind === "reject" ? "Motif du rejet" : "Message au membre"}
              </Text>
              {choicePicker.options.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={styles.choiceBtn}
                  onPress={() => runChoice(opt)}
                  disabled={busy}
                >
                  <Text style={styles.choiceBtnText}>{opt}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setChoicePicker(null)} disabled={busy}>
                <Text style={styles.choiceCancel}>Annuler</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <ScrollView
          style={styles.detailScrollView}
          contentContainerStyle={styles.detailScroll}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          <Card>
            <Text style={styles.member}>{selected.full_name}</Text>
            <Text style={styles.meta}>{selected.user?.email} · KYC: {selected.user?.kyc_status ?? "—"}</Text>
            <Text style={styles.meta}>{selected.address_line1}, {selected.postal_code} {selected.city}</Text>
            <Text style={styles.meta}>{selected.country_of_residence} · {selected.preferred_currency}</Text>
            <Text style={styles.meta}>Tél. {selected.phone} · Doc: {selected.id_document_type}</Text>
            <Text style={styles.meta}>Statut : {selected.status}</Text>
            {selected.rejection_reason ? (
              <Text style={[styles.meta, { color: Colors.danger }]}>Note : {selected.rejection_reason}</Text>
            ) : null}
          </Card>

          <Text style={styles.docsTitle}>Pièces jointes — faites défiler ou ouvrez en grand</Text>
          <DocPreview label="Pièce d'identité (recto)" uri={selected.id_front_url} />
          <DocPreview label="Pièce d'identité (verso)" uri={selected.id_back_url} />
          <DocPreview label="Selfie" uri={selected.selfie_url} />
          <DocPreview label="Preuve de résidence" uri={selected.proof_abroad_url} />
          {!selected.id_front_url && !selected.selfie_url && !selected.proof_abroad_url ? (
            <Text style={styles.noProof}>Aucune pièce jointe disponible</Text>
          ) : null}

          <View style={[styles.actions, { marginBottom: 24 }]}>
            <TouchableOpacity style={[styles.actionBtn, styles.validateBtn]} onPress={approve}>
              <CheckCircle color="#fff" size={18} /><Text style={styles.actionText}>Activer Diaspora</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.warning }]} onPress={requestInfo}>
              <MessageSquare color="#fff" size={18} /><Text style={styles.actionText}>Demander infos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={reject}>
              <XCircle color="#fff" size={18} /><Text style={styles.actionText}>Rejeter</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.listRoot}>
      <View style={styles.statsRow}>
        <StatPill label="En attente" value={stats.pending} color={Colors.warning} />
        <StatPill label="Infos" value={stats.needs_info} color={Colors.secondary} />
        <StatPill label="Approuvées" value={stats.approved} color={Colors.success} />
        <StatPill label="Rejetées" value={stats.rejected} color={Colors.danger} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {[
          { key: "pending_review", label: "En attente" },
          { key: "needs_info", label: "Infos demandées" },
          { key: "approved", label: "Approuvées" },
          { key: "rejected", label: "Rejetées" },
          { key: "all", label: "Toutes" },
        ].map((f) => (
          <TouchableOpacity key={f.key} style={[styles.chip, filter === f.key && styles.chipActive]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity onPress={load} style={{ paddingHorizontal: Spacing.lg, paddingBottom: 4 }}>
        <Text style={{ color: Colors.primary, fontWeight: "800", fontSize: 12 }}>Actualiser</Text>
      </TouchableOpacity>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} /> : (
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={{ padding: Spacing.lg, gap: 10, paddingBottom: 100 }}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {loadError ? <Text style={[styles.empty, { color: Colors.danger }]}>{loadError}</Text> : null}
          {items.map((item) => (
            <TouchableOpacity key={item.id} onPress={() => openDetail(item.id)}>
              <Card>
                <Text style={styles.itemName}>{item.full_name ?? item.user?.full_name}</Text>
                <Text style={styles.itemTontine}>{item.country_of_residence} · {item.preferred_currency}</Text>
                <Text style={styles.itemAmount}>{item.status === "pending_review" ? "En attente de validation" : item.status}</Text>
                {item.submitted_at ? (
                  <Text style={styles.itemTontine}>
                    Soumis le {new Date(item.submitted_at).toLocaleString("fr-FR")}
                  </Text>
                ) : null}
              </Card>
            </TouchableOpacity>
          ))}
          {!items.length && !loadError ? (
            <Text style={styles.empty}>
              Aucune inscription {filter === "pending_review" ? "en attente" : ""}.
              {"\n"}Onglet Inscriptions · filtre « En attente ».
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function AdminDiasporaContributions({ embedded }: { embedded?: boolean }) {
  const { show } = useToast();
  const [items, setItems] = useState<AdminItem[]>([]);
  const [filter, setFilter] = useState("under_review");
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [choicePicker, setChoicePicker] = useState<null | { kind: "reject"; options: string[] }>(null);
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
      setChoicePicker(null);
      const d = await api.get<any>(`/admin/diaspora/requests/${id}`);
      setSelected(d);
    } catch {
      show("Impossible de charger le détail", "error");
    }
  };

  const validate = async () => {
    if (!selected || busy) return;
    const ok = await confirmAction("Valider la cotisation", "Confirmer la validation manuelle ?");
    if (!ok) return;
    setBusy(true);
    try {
      await api.post("/admin/diaspora/validate", { request_id: selected.id });
      show("Cotisation validée", "success");
      setSelected(null);
      setChoicePicker(null);
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    } finally {
      setBusy(false);
    }
  };

  const reject = () => {
    if (!selected || busy) return;
    setChoicePicker({ kind: "reject", options: REJECT_REASONS });
  };

  const runChoice = async (reason: string) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api.post("/admin/diaspora/reject", { request_id: selected.id, reason });
      show("Cotisation rejetée", "success");
      setSelected(null);
      setChoicePicker(null);
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    } finally {
      setBusy(false);
    }
  };

  if (selected) {
    return (
      <View style={styles.detailRoot}>
        <View style={styles.detailTop}>
          <TouchableOpacity onPress={() => setSelected(null)} hitSlop={8}>
            <Text style={styles.back}>← Retour à la liste</Text>
          </TouchableOpacity>
          <Text style={styles.detailTitle}>Validation Diaspora</Text>
          <View style={styles.actionsSticky}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.validateBtn, busy && styles.actionDisabled]}
              onPress={validate}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <CheckCircle color="#fff" size={16} />}
              <Text style={styles.actionText}>Valider</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn, busy && styles.actionDisabled]}
              onPress={reject}
              disabled={busy}
            >
              <XCircle color="#fff" size={16} /><Text style={styles.actionText}>Rejeter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.warnBtn, busy && styles.actionDisabled]} onPress={async () => {
              if (busy) return;
              setBusy(true);
              try {
                await api.post("/admin/diaspora/suspicious", { request_id: selected.id });
                show("Marqué suspect", "success");
                await load();
              } catch (e) { show(e instanceof ApiError ? e.detail : "Erreur", "error"); }
              finally { setBusy(false); }
            }} disabled={busy}>
              <AlertTriangle color="#fff" size={16} /><Text style={styles.actionText}>Suspect</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.infoBtn, busy && styles.actionDisabled]} onPress={async () => {
              if (busy) return;
              const msg = Platform.OS === "web"
                ? (typeof window !== "undefined" ? window.prompt("Message au membre") : null)
                : await new Promise<string | null>((resolve) => {
                    Alert.prompt?.(
                      "Demander des informations",
                      "Message au membre",
                      (value) => resolve(value ?? null),
                    ) ?? resolve(null);
                  });
              if (!msg?.trim()) return;
              setBusy(true);
              try {
                await api.post("/admin/diaspora/needs-info", { request_id: selected.id, message: msg });
                show("Demande envoyée", "success");
                setSelected(null);
                await load();
              } catch (e) { show(e instanceof ApiError ? e.detail : "Erreur", "error"); }
              finally { setBusy(false); }
            }} disabled={busy}>
              <MessageSquare color="#fff" size={16} /><Text style={styles.actionText}>Infos</Text>
            </TouchableOpacity>
          </View>
          {choicePicker ? (
            <View style={styles.choiceBox}>
              <Text style={styles.choiceTitle}>Motif du rejet</Text>
              {choicePicker.options.map((opt) => (
                <TouchableOpacity key={opt} style={styles.choiceBtn} onPress={() => runChoice(opt)} disabled={busy}>
                  <Text style={styles.choiceBtnText}>{opt}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setChoicePicker(null)} disabled={busy}>
                <Text style={styles.choiceCancel}>Annuler</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <ScrollView
          style={styles.detailScrollView}
          contentContainerStyle={styles.detailScroll}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
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
          </Card>
          <Text style={styles.docsTitle}>Preuve de paiement</Text>
          <DocPreview label="Justificatif" uri={selected.proof_url} />
          {!selected.proof_url ? <Text style={styles.noProof}>Aucune preuve jointe</Text> : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.listRoot}>
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
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={{ padding: Spacing.lg, gap: 10, paddingBottom: 100 }}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
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
    </View>
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
  panelRoot: { flex: 1, minHeight: 0 },
  panelRootEmbedded: { flex: 1, minHeight: 0 },
  panelBody: { flex: 1, minHeight: 0 },
  listRoot: { flex: 1, minHeight: 0 },
  listScroll: { flex: 1, minHeight: 0 },
  detailRoot: { flex: 1, minHeight: 0 },
  detailTop: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 8,
  },
  detailScrollView: { flex: 1, minHeight: 0 },
  actionsSticky: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionDisabled: { opacity: 0.55 },
  choiceBox: {
    marginTop: 4,
    padding: 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
    gap: 6,
  },
  choiceTitle: { fontSize: 12, fontWeight: "800", color: Colors.text, marginBottom: 2 },
  choiceBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  choiceBtnText: { fontSize: 12, fontWeight: "600", color: Colors.text },
  choiceCancel: { fontSize: 12, fontWeight: "700", color: Colors.textMuted, textAlign: "center", paddingVertical: 6 },
  sectionTabs: { flexDirection: "row", gap: 8, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, flexShrink: 0 },
  sectionTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: Radius.lg, backgroundColor: Colors.surfaceAlt },
  sectionTabActive: { backgroundColor: Colors.primaryLight },
  sectionTabText: { fontSize: 12, fontWeight: "800", color: Colors.textMuted },
  sectionTabTextActive: { color: Colors.primary },
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, flexShrink: 0 },
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
  detailScroll: { padding: Spacing.lg, paddingBottom: 120, gap: 12 },
  back: { color: Colors.secondary, fontWeight: "700" },
  detailTitle: { fontSize: 18, fontWeight: "900", color: Colors.text },
  docsTitle: { fontSize: 13, fontWeight: "800", color: Colors.textMuted, marginTop: 4 },
  docBlock: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 10, gap: 8 },
  docHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  docLabel: { fontSize: 12, fontWeight: "800", color: Colors.text },
  docOpenBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  docOpenText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  member: { fontSize: 15, fontWeight: "800", color: Colors.text },
  meta: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  tontine: { fontSize: 14, fontWeight: "700", color: Colors.text, marginTop: 12 },
  amount: { fontSize: 24, fontWeight: "900", color: Colors.primary },
  ref: { fontSize: 12, color: Colors.secondary, fontWeight: "700", marginVertical: 8 },
  compare: { marginTop: 12, gap: 4 },
  compareLine: { fontSize: 13, color: Colors.text },
  comment: { fontSize: 12, fontStyle: "italic", color: Colors.textMuted, marginTop: 10 },
  proofImg: { width: "100%", height: 180, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt },
  noProof: { color: Colors.danger, marginTop: 12, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.lg },
  validateBtn: { backgroundColor: Colors.success },
  rejectBtn: { backgroundColor: Colors.danger },
  warnBtn: { backgroundColor: Colors.warning },
  infoBtn: { backgroundColor: Colors.secondary },
  actionText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
