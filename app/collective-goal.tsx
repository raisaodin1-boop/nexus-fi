import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, TextInput, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Plus, Users, Target, TrendingUp, CheckCircle } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
  listCollectiveGoals, createCollectiveGoal, contributeToCollectiveGoal,
  type CollectiveGoal,
} from "@/src/db/collective-goal";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";
import { Button, Field } from "@/src/ui";
import { useToast } from "@/src/toast";
import { formatXAFAmount } from "@/src/exchange-rates";

export default function CollectiveGoalScreen() {
  const router = useRouter();
  const { show } = useToast();

  const [goals, setGoals] = useState<CollectiveGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<CollectiveGoal | null>(null);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [creating, setCreating] = useState(false);

  const [contribAmt, setContribAmt] = useState("");
  const [contributing, setContributing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setGoals(await listCollectiveGoals());
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) { show("Nom requis", "error"); return; }
    const amt = Number(target);
    if (!amt || amt <= 0) { show("Montant invalide", "error"); return; }
    setCreating(true);
    try {
      await createCollectiveGoal({ name, description: desc, target_amount: amt, deadline: deadline || undefined });
      show("Objectif créé ✓", "success");
      setShowCreate(false);
      setName(""); setDesc(""); setTarget(""); setDeadline("");
      await load();
    } catch (e: any) { show(e?.message ?? "Erreur", "error"); }
    setCreating(false);
  };

  const handleContribute = async () => {
    const amt = Number(contribAmt);
    if (!selectedGoal || !amt) { show("Montant invalide", "error"); return; }
    setContributing(true);
    try {
      await contributeToCollectiveGoal(selectedGoal.id, amt);
      show(`+${formatXAFAmount(amt)} ajouté ✓`, "success");
      setSelectedGoal(null);
      setContribAmt("");
      await load();
    } catch (e: any) { show(e?.message ?? "Erreur", "error"); }
    setContributing(false);
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
            <Text style={s.title}>Objectifs Collectifs</Text>
            <Text style={s.subtitle}>Épargnez ensemble vers un but commun</Text>
          </View>
          <TouchableOpacity onPress={() => setShowCreate(!showCreate)} style={s.addBtn}>
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {goals.length === 0 && !showCreate && (
          <View style={s.empty}>
            <Target size={44} color={Colors.primary} />
            <Text style={s.emptyTitle}>Aucun objectif collectif</Text>
            <Text style={s.emptyText}>Créez un objectif partagé : voyage de groupe, achat commun, fonds d'urgence...</Text>
            <Button label="Créer un objectif" onPress={() => setShowCreate(true)} style={{ marginTop: 16 }} />
          </View>
        )}

        {goals.map((g) => (
          <TouchableOpacity key={g.id} style={[s.card, Shadow.card]} onPress={() => setSelectedGoal(g)} activeOpacity={0.85}>
            <View style={s.cardTop}>
              <View style={[s.iconWrap, g.is_completed && { backgroundColor: "#10B981" + "20" }]}>
                {g.is_completed
                  ? <CheckCircle size={20} color="#10B981" />
                  : <Target size={20} color={Colors.primary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.goalName}>{g.name}</Text>
                <View style={s.metaRow}>
                  <Users size={12} color={Colors.textMuted} />
                  <Text style={s.meta}>{g.members_count} membres · par {g.creator_name}</Text>
                </View>
              </View>
              <View style={s.pctBadge}>
                <Text style={s.pctText}>{g.progress_pct}%</Text>
              </View>
            </View>

            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${g.progress_pct}%`, backgroundColor: g.is_completed ? "#10B981" : Colors.primary }]} />
            </View>

            <View style={s.amtRow}>
              <Text style={s.amtCurrent}>{formatXAFAmount(g.current_amount)}</Text>
              <Text style={s.amtSep}>/</Text>
              <Text style={s.amtTarget}>{formatXAFAmount(g.target_amount)}</Text>
              {g.deadline && <Text style={s.deadline}>· {new Date(g.deadline).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</Text>}
            </View>
          </TouchableOpacity>
        ))}

        {showCreate && (
          <View style={[s.form, Shadow.card]}>
            <Text style={s.formTitle}>Nouvel objectif collectif</Text>
            <Field label="Nom de l'objectif" value={name} onChangeText={setName} placeholder="Voyage au Sénégal 2026" />
            <Field label="Description (optionnel)" value={desc} onChangeText={setDesc} placeholder="Contexte, règles..." />
            <Field label="Montant cible (FCFA)" value={target} onChangeText={setTarget} keyboardType="numeric" placeholder="500 000" />
            <Field label="Échéance (optionnel)" value={deadline} onChangeText={setDeadline} placeholder="2026-12-31" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="Annuler" variant="ghost" onPress={() => setShowCreate(false)} style={{ flex: 1 }} />
              <Button label={creating ? "..." : "Créer"} onPress={handleCreate} loading={creating} style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Contribute modal */}
      <Modal visible={!!selectedGoal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>{selectedGoal?.name}</Text>
            <Text style={s.modalSub}>
              {formatXAFAmount(selectedGoal?.current_amount ?? 0)} / {formatXAFAmount(selectedGoal?.target_amount ?? 0)}
            </Text>
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${selectedGoal?.progress_pct ?? 0}%` }]} />
            </View>
            <Field label="Votre contribution (FCFA)" value={contribAmt} onChangeText={setContribAmt} keyboardType="numeric" placeholder="10 000" />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Button label="Fermer" variant="ghost" onPress={() => { setSelectedGoal(null); setContribAmt(""); }} style={{ flex: 1 }} />
              <Button label={contributing ? "..." : "Contribuer"} onPress={handleContribute} loading={contributing} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 80 },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 4 },
  back: { padding: 8 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 1 },
  addBtn: { backgroundColor: Colors.primary, borderRadius: 20, padding: 8 },
  empty: { alignItems: "center", gap: 10, paddingVertical: 48 },
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
  amtRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  amtCurrent: { fontSize: 15, fontWeight: "700", color: Colors.primary },
  amtSep: { fontSize: 13, color: Colors.textMuted },
  amtTarget: { fontSize: 14, color: Colors.textMuted },
  deadline: { fontSize: 12, color: Colors.textMuted, marginLeft: 4 },
  form: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 10 },
  formTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  modalSub: { fontSize: 14, color: Colors.textMuted },
});
