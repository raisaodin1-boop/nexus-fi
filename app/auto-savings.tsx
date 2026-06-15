import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Switch,
  Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Plus, Repeat, Trash2, Zap } from "lucide-react-native";

import {
  type AutoSavingsRule, type AutoSavingsFrequency,
  createAutoSavingsRule, listAutoSavingsRules,
  toggleAutoSavingsRule, deleteAutoSavingsRule, updateAutoSavingsRule,
  FREQUENCY_LABELS,
} from "@/src/db/auto-savings";
import { listSavings } from "@/src/db";
import { Colors, Radius, Spacing } from "@/src/theme";
import { Button, Field } from "@/src/ui";
import { useToast } from "@/src/toast";
import { formatXAFAmount } from "@/src/exchange-rates";

const FREQUENCIES: { key: AutoSavingsFrequency; label: string }[] = [
  { key: "daily",   label: "Quotidien" },
  { key: "weekly",  label: "Hebdomadaire" },
  { key: "monthly", label: "Mensuel" },
];

export default function AutoSavingsScreen() {
  const router = useRouter();
  const { show } = useToast();

  const [rules, setRules] = useState<AutoSavingsRule[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<AutoSavingsFrequency>("weekly");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r, g] = await Promise.all([listAutoSavingsRules(), listSavings()]);
      setRules(r);
      setGoals(g);
      if (g.length > 0 && !selectedGoalId) setSelectedGoalId(g[0].id);
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const amt = Number(amount);
    if (!selectedGoalId) { show("Sélectionnez un objectif", "error"); return; }
    if (!amt || amt <= 0) { show("Montant invalide", "error"); return; }
    setSaving(true);
    try {
      const goal = goals.find(g => g.id === selectedGoalId);
      await createAutoSavingsRule({ goal_id: selectedGoalId, goal_name: goal?.name ?? "Objectif", amount: amt, frequency });
      show("Auto-épargne activée ✓", "success");
      setShowForm(false);
      setAmount("");
      await load();
    } catch (e: any) {
      show(e?.message ?? "Erreur", "error");
    }
    setSaving(false);
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await toggleAutoSavingsRule(id, active);
      await load();
    } catch { show("Erreur", "error"); }
  };

  const handleDelete = (rule: AutoSavingsRule) => {
    Alert.alert("Supprimer", `Supprimer l'auto-épargne pour « ${rule.goal_name} » ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
        await deleteAutoSavingsRule(rule.id);
        await load();
      }},
    ]);
  };

  const nextRunLabel = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  if (loading) return (
    <SafeAreaView style={s.safe}>
      <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Auto-épargne</Text>
            <Text style={s.subtitle}>Dépôts automatiques planifiés</Text>
          </View>
          <TouchableOpacity onPress={() => setShowForm(!showForm)} style={s.addBtn}>
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Règles actives */}
        {rules.length === 0 && !showForm ? (
          <View style={s.empty}>
            <Zap size={40} color={Colors.primary} />
            <Text style={s.emptyTitle}>Aucune règle active</Text>
            <Text style={s.emptyText}>Automatisez vos dépôts pour atteindre vos objectifs sans effort.</Text>
            <Button label="Créer une règle" onPress={() => setShowForm(true)} style={{ marginTop: 16 }} />
          </View>
        ) : (
          rules.map(rule => (
            <View key={rule.id} style={s.card}>
              <View style={s.cardTop}>
                <View style={s.ruleIcon}>
                  <Repeat size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.ruleName}>{rule.goal_name}</Text>
                  <Text style={s.ruleDetail}>
                    {formatXAFAmount(rule.amount)} · {FREQUENCY_LABELS[rule.frequency]}
                  </Text>
                </View>
                <Switch
                  value={rule.is_active}
                  onValueChange={v => handleToggle(rule.id, v)}
                  trackColor={{ true: Colors.primary }}
                />
              </View>

              {rule.is_active && (
                <View style={s.nextRun}>
                  <Text style={s.nextRunLabel}>Prochain dépôt : {nextRunLabel(rule.next_run_at)}</Text>
                </View>
              )}

              <View style={s.cardStats}>
                <View style={s.stat}>
                  <Text style={s.statVal}>{rule.runs_count}</Text>
                  <Text style={s.statLbl}>Exécutions</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statVal}>{formatXAFAmount(rule.total_deposited)}</Text>
                  <Text style={s.statLbl}>Total déposé</Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(rule)} style={s.deleteBtn}>
                  <Trash2 size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Formulaire */}
        {showForm && (
          <View style={s.form}>
            <Text style={s.formTitle}>Nouvelle règle</Text>

            <Text style={s.label}>Objectif d'épargne</Text>
            {goals.length === 0 ? (
              <TouchableOpacity style={s.goalBtn} onPress={() => router.push("/savings/create" as any)}>
                <Text style={{ color: Colors.primary }}>Créer un objectif d'abord →</Text>
              </TouchableOpacity>
            ) : (
              goals.map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[s.goalRow, selectedGoalId === g.id && s.goalRowSelected]}
                  onPress={() => setSelectedGoalId(g.id)}
                >
                  <Text style={[s.goalRowText, selectedGoalId === g.id && { color: Colors.primary }]}>
                    {g.name}
                  </Text>
                </TouchableOpacity>
              ))
            )}

            <Field label="Montant par dépôt (FCFA)" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="5 000" />

            <Text style={s.label}>Fréquence</Text>
            <View style={s.freqRow}>
              {FREQUENCIES.map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={[s.freqBtn, frequency === f.key && s.freqBtnActive]}
                  onPress={() => setFrequency(f.key)}
                >
                  <Text style={[s.freqLabel, frequency === f.key && s.freqLabelActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.formActions}>
              <Button label="Annuler" variant="outline" onPress={() => setShowForm(false)} style={{ flex: 1 }} />
              <Button label={saving ? "..." : "Activer"} onPress={handleCreate} loading={saving} style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 80 },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 4 },
  back: { padding: 8 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.muted, marginTop: 1 },
  addBtn: { backgroundColor: Colors.primary, borderRadius: 20, padding: 8 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.muted, textAlign: "center", paddingHorizontal: 20 },
  card: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  ruleIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  ruleName: { fontSize: 15, fontWeight: "700", color: Colors.text },
  ruleDetail: { fontSize: 13, color: Colors.muted, marginTop: 2 },
  nextRun: { backgroundColor: Colors.primary + "10", borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 5 },
  nextRunLabel: { fontSize: 12, color: Colors.primary, fontWeight: "600" },
  cardStats: { flexDirection: "row", alignItems: "center", gap: 16 },
  stat: { flex: 1 },
  statVal: { fontSize: 15, fontWeight: "700", color: Colors.text },
  statLbl: { fontSize: 11, color: Colors.muted },
  deleteBtn: { padding: 8 },
  form: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  formTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text, marginTop: 4 },
  goalRow: { borderRadius: Radius.sm, borderWidth: 1.5, borderColor: "#E2E8F0", padding: 12, marginTop: 4 },
  goalRowSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + "08" },
  goalRowText: { fontSize: 14, color: Colors.text, fontWeight: "500" },
  goalBtn: { padding: 12 },
  freqRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  freqBtn: { flex: 1, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: "#E2E8F0", padding: 10, alignItems: "center" },
  freqBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "10" },
  freqLabel: { fontSize: 12, fontWeight: "600", color: Colors.muted },
  freqLabelActive: { color: Colors.primary },
  formActions: { flexDirection: "row", gap: 10, marginTop: 4 },
});
