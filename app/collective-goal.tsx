import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Switch, Text,
  TouchableOpacity, View, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Plus, Users, Target, CheckCircle, Heart, Vote } from "lucide-react-native";

import {
  listCollectiveGoals, createCollectiveGoal, contributeToCollectiveGoal,
  getCollectiveGoal, requestFundRelease, voteFundRequest, releaseFundRequest,
  type CollectiveGoal, type FundRequest, type FundEventType,
} from "@/src/db/collective-goal";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";
import { Button, Field } from "@/src/ui";
import { useToast } from "@/src/toast";
import { formatXAFAmount } from "@/src/exchange-rates";

type Tab = "all" | "standard" | "emergency";

const EVENT_TYPES: { key: FundEventType; label: string }[] = [
  { key: "deuil", label: "Deuil" },
  { key: "mariage", label: "Mariage" },
  { key: "urgence", label: "Urgence" },
  { key: "autre", label: "Autre" },
];

export default function CollectiveGoalScreen() {
  const router = useRouter();
  const { show } = useToast();

  const [tab, setTab] = useState<Tab>("all");
  const [goals, setGoals] = useState<CollectiveGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ goal: CollectiveGoal; requests: FundRequest[] } | null>(null);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [creating, setCreating] = useState(false);

  const [contribAmt, setContribAmt] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [contributing, setContributing] = useState(false);

  const [reqAmount, setReqAmount] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [reqEvent, setReqEvent] = useState<FundEventType>("urgence");
  const [requesting, setRequesting] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setGoals(await listCollectiveGoals()); } catch { /* silent */ }
    setLoading(false);
  };

  const openDetail = async (id: string) => {
    setSelectedId(id);
    try {
      const d = await getCollectiveGoal(id);
      setDetail({ goal: d.goal, requests: d.requests });
    } catch (e: any) { show(e?.message ?? "Erreur", "error"); setSelectedId(null); }
  };

  useEffect(() => { load(); }, []);

  const filtered = goals.filter((g) =>
    tab === "all" ? true : tab === "emergency" ? g.goal_type === "emergency" : g.goal_type !== "emergency",
  );

  const handleCreate = async () => {
    if (!name.trim()) { show("Nom requis", "error"); return; }
    const amt = Number(target);
    if (!amt || amt <= 0) { show("Montant invalide", "error"); return; }
    setCreating(true);
    try {
      await createCollectiveGoal({
        name,
        description: desc,
        target_amount: amt,
        deadline: deadline || undefined,
        goal_type: isEmergency ? "emergency" : "standard",
        vote_threshold_pct: isEmergency ? 60 : 60,
      });
      show(isEmergency ? "Caisse secours créée ✓" : "Objectif créé ✓", "success");
      setShowCreate(false);
      setName(""); setDesc(""); setTarget(""); setDeadline(""); setIsEmergency(false);
      await load();
    } catch (e: any) { show(e?.message ?? "Erreur", "error"); }
    setCreating(false);
  };

  const handleContribute = async () => {
    if (!selectedId) return;
    const amt = Number(contribAmt);
    if (!amt) { show("Montant invalide", "error"); return; }
    setContributing(true);
    try {
      await contributeToCollectiveGoal(selectedId, amt, anonymous);
      show(`+${formatXAFAmount(amt)} ajouté ✓`, "success");
      setContribAmt("");
      await openDetail(selectedId);
      await load();
    } catch (e: any) { show(e?.message ?? "Erreur", "error"); }
    setContributing(false);
  };

  const handleRequest = async () => {
    if (!selectedId) return;
    const amt = Number(reqAmount);
    if (!amt || !reqReason.trim()) { show("Montant et motif requis", "error"); return; }
    setRequesting(true);
    try {
      await requestFundRelease({ goalId: selectedId, amount: amt, reason: reqReason, event_type: reqEvent });
      show("Demande soumise au vote ✓", "success");
      setReqAmount(""); setReqReason("");
      await openDetail(selectedId);
    } catch (e: any) { show(e?.message ?? "Erreur", "error"); }
    setRequesting(false);
  };

  const handleVote = async (requestId: string, approve: boolean) => {
    if (!selectedId) return;
    try {
      await voteFundRequest(requestId, approve);
      show(approve ? "Vote pour ✓" : "Vote contre enregistré", "success");
      await openDetail(selectedId);
    } catch (e: any) { show(e?.message ?? "Erreur", "error"); }
  };

  const handleRelease = async (requestId: string) => {
    if (!selectedId) return;
    try {
      await releaseFundRequest(requestId);
      show("Fonds libérés ✓", "success");
      await openDetail(selectedId);
      await load();
    } catch (e: any) { show(e?.message ?? "Erreur", "error"); }
  };

  if (loading) return (
    <SafeAreaView style={s.safe}><ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} /></SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Objectifs & Caisse secours</Text>
            <Text style={s.subtitle}>Épargne collective · votes · déblocage solidaire</Text>
          </View>
          <TouchableOpacity onPress={() => setShowCreate(!showCreate)} style={s.addBtn}>
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={s.tabs}>
          {(["all", "standard", "emergency"] as Tab[]).map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabActive]}>
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === "all" ? "Tous" : t === "emergency" ? "Caisse secours" : "Objectifs"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {goals.length === 0 && !showCreate && (
          <View style={s.empty}>
            <Heart size={44} color={Colors.primary} />
            <Text style={s.emptyTitle}>Créez votre première caisse</Text>
            <Text style={s.emptyText}>Objectif voyage ou caisse secours (mariage, deuil, urgence) avec vote des membres.</Text>
            <Button label="Créer" onPress={() => setShowCreate(true)} style={{ marginTop: 16 }} />
          </View>
        )}

        {filtered.map((g) => (
          <TouchableOpacity key={g.id} style={[s.card, Shadow.card]} onPress={() => openDetail(g.id)} activeOpacity={0.85}>
            <View style={s.cardTop}>
              <View style={[s.iconWrap, g.goal_type === "emergency" && { backgroundColor: "#FEE2E2" }]}>
                {g.goal_type === "emergency"
                  ? <Heart size={20} color="#DC2626" />
                  : g.is_completed ? <CheckCircle size={20} color="#10B981" /> : <Target size={20} color={Colors.primary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.goalName}>{g.name}</Text>
                <View style={s.metaRow}>
                  <Users size={12} color={Colors.textMuted} />
                  <Text style={s.meta}>
                    {g.members_count} membres · {g.goal_type === "emergency" ? "Caisse secours" : "Objectif"}
                  </Text>
                </View>
              </View>
              <View style={s.pctBadge}>
                <Text style={s.pctText}>{g.progress_pct}%</Text>
              </View>
            </View>
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${g.progress_pct}%` }]} />
            </View>
            <Text style={s.amtCurrent}>{formatXAFAmount(g.current_amount)} / {formatXAFAmount(g.target_amount)}</Text>
          </TouchableOpacity>
        ))}

        {showCreate && (
          <View style={[s.form, Shadow.card]}>
            <Text style={s.formTitle}>{isEmergency ? "Nouvelle caisse secours" : "Nouvel objectif collectif"}</Text>
            <View style={s.switchRow}>
              <Text style={s.switchLabel}>Mode caisse secours (vote pour débloquer)</Text>
              <Switch value={isEmergency} onValueChange={setIsEmergency} trackColor={{ true: Colors.primary }} />
            </View>
            <Field label="Nom" value={name} onChangeText={setName} placeholder={isEmergency ? "Caisse de secours famille" : "Voyage 2026"} />
            <Field label="Description" value={desc} onChangeText={setDesc} placeholder="Règles, contexte..." />
            <Field label="Montant cible (FCFA)" value={target} onChangeText={setTarget} keyboardType="numeric" />
            <Field label="Échéance (optionnel)" value={deadline} onChangeText={setDeadline} placeholder="2026-12-31" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="Annuler" variant="ghost" onPress={() => setShowCreate(false)} style={{ flex: 1 }} />
              <Button label={creating ? "..." : "Créer"} onPress={handleCreate} loading={creating} style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={!!selectedId && !!detail} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.modalTitle}>{detail?.goal.name}</Text>
              <Text style={s.modalSub}>
                {formatXAFAmount(detail?.goal.current_amount ?? 0)} disponible · seuil vote {detail?.goal.vote_threshold_pct}%
              </Text>

              <Field label="Contribution (FCFA)" value={contribAmt} onChangeText={setContribAmt} keyboardType="numeric" />
              {detail?.goal.goal_type === "emergency" && (
                <View style={s.switchRow}>
                  <Text style={s.switchLabel}>Cotisation anonyme</Text>
                  <Switch value={anonymous} onValueChange={setAnonymous} />
                </View>
              )}
              <Button label={contributing ? "..." : "Contribuer"} onPress={handleContribute} loading={contributing} />

              {detail?.goal.goal_type === "emergency" && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Demander un déblocage</Text>
                  <Field label="Montant" value={reqAmount} onChangeText={setReqAmount} keyboardType="numeric" />
                  <Field label="Motif" value={reqReason} onChangeText={setReqReason} placeholder="Ex: frais hospitalisation..." />
                  <View style={s.chipRow}>
                    {EVENT_TYPES.map((e) => (
                      <TouchableOpacity key={e.key} onPress={() => setReqEvent(e.key)} style={[s.chip, reqEvent === e.key && s.chipActive]}>
                        <Text style={[s.chipText, reqEvent === e.key && s.chipTextActive]}>{e.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Button label={requesting ? "..." : "Soumettre au vote"} onPress={handleRequest} loading={requesting} variant="secondary" />
                </View>
              )}

              {(detail?.requests.length ?? 0) > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Votes en cours</Text>
                  {detail!.requests.map((r) => (
                    <View key={r.id} style={s.requestCard}>
                      <Text style={s.requestAmt}>{formatXAFAmount(r.amount)} · {r.event_type}</Text>
                      <Text style={s.requestReason}>{r.reason}</Text>
                      <Text style={s.requestMeta}>
                        {r.requester_name} · {r.votes_yes}/{r.threshold} votes ({r.approval_pct}%)
                      </Text>
                      <Text style={[s.requestStatus, r.status === "approved" && { color: "#10B981" }]}>
                        {r.status === "pending" ? "En vote" : r.status === "approved" ? "Approuvé" : r.status === "released" ? "Libéré" : "Rejeté"}
                      </Text>
                      {r.status === "pending" && (
                        <View style={s.voteRow}>
                          <TouchableOpacity style={s.voteYes} onPress={() => handleVote(r.id, true)}>
                            <Vote size={14} color="#fff" />
                            <Text style={s.voteBtnText}>Pour</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.voteNo} onPress={() => handleVote(r.id, false)}>
                            <Text style={s.voteBtnText}>Contre</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {r.status === "approved" && (
                        <Button label="Libérer les fonds" onPress={() => handleRelease(r.id)} style={{ marginTop: 8 }} />
                      )}
                    </View>
                  ))}
                </View>
              )}

              <Button label="Fermer" variant="ghost" onPress={() => { setSelectedId(null); setDetail(null); }} style={{ marginTop: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 80 },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  back: { padding: 8 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  addBtn: { backgroundColor: Colors.primary, borderRadius: 20, padding: 8 },
  tabs: { flexDirection: "row", gap: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#E2E8F0" },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 12, fontWeight: "700", color: Colors.textMuted },
  tabTextActive: { color: "#fff" },
  empty: { alignItems: "center", gap: 10, paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 24 },
  card: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  goalName: { fontSize: 16, fontWeight: "700", color: Colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  meta: { fontSize: 12, color: Colors.textMuted },
  pctBadge: { backgroundColor: Colors.primary + "18", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  pctText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  progressBg: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: Colors.primary, borderRadius: 4 },
  amtCurrent: { fontSize: 14, fontWeight: "700", color: Colors.primary },
  form: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 10 },
  formTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  switchLabel: { flex: 1, fontSize: 13, color: Colors.text, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "88%" },
  modalTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  modalSub: { fontSize: 13, color: Colors.textMuted, marginBottom: 12 },
  section: { marginTop: 20, gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#F1F5F9" },
  chipActive: { backgroundColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: Colors.textMuted },
  chipTextActive: { color: "#fff" },
  requestCard: { backgroundColor: "#F8FAFC", borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: "#E2E8F0" },
  requestAmt: { fontSize: 15, fontWeight: "800", color: Colors.text },
  requestReason: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  requestMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 6 },
  requestStatus: { fontSize: 12, fontWeight: "700", color: Colors.primary, marginTop: 4 },
  voteRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  voteYes: { flex: 1, flexDirection: "row", gap: 6, backgroundColor: "#10B981", padding: 10, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  voteNo: { flex: 1, backgroundColor: "#94A3B8", padding: 10, borderRadius: 10, alignItems: "center" },
  voteBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
