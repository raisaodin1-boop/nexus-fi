import React, { useEffect, useState } from "react";
import {
  Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, PieChart } from "lucide-react-native";

import {
  type MonthBudget, type BudgetCategory,
  BUDGET_CATEGORY_META, getOrCreateBudget, updateBudgetLine,
  computeBudgetSpent, getBudgetStatus, currentMonthKey,
} from "@/src/db/budget";
import { getWalletTransactions } from "@/src/wallet-db";
import { Colors, Radius, Spacing } from "@/src/theme";
import { formatXAFAmount } from "@/src/exchange-rates";

export default function BudgetScreen() {
  const router = useRouter();
  const [budget, setBudget] = useState<MonthBudget | null>(null);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ category: BudgetCategory; current: number } | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [b, txs] = await Promise.all([getOrCreateBudget(), getWalletTransactions(200)]);
      const computed = computeBudgetSpent(b, txs.map(t => ({
        type: t.type,
        amount: t.amount,
        note: t.note,
        created_at: t.created_at,
      })));
      setBudget(computed);
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (category: BudgetCategory, current: number) => {
    setEditValue(current > 0 ? String(current) : "");
    setEditModal({ category, current });
  };

  const handleSave = async () => {
    if (!editModal || !budget) return;
    const val = Number(editValue);
    await updateBudgetLine(budget.month, editModal.category, val);
    setEditModal(null);
    await load();
  };

  const totalBudgeted = budget?.lines.reduce((s, l) => s + l.limit_amount, 0) ?? 0;
  const totalSpent = budget?.lines.reduce((s, l) => s + l.spent, 0) ?? 0;
  const overCount = budget?.lines.filter(l => getBudgetStatus(l) === "over").length ?? 0;

  const monthLabel = (() => {
    const [y, m] = currentMonthKey().split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  })();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Mon budget</Text>
            <Text style={s.subtitle}>{monthLabel}</Text>
          </View>
          <PieChart size={22} color={Colors.primary} style={{ marginRight: 4 }} />
        </View>

        {/* Summary */}
        <View style={s.summary}>
          <View style={s.sumItem}>
            <Text style={s.sumVal}>{formatXAFAmount(totalSpent)}</Text>
            <Text style={s.sumLbl}>Dépensé</Text>
          </View>
          <View style={s.sumDivider} />
          <View style={s.sumItem}>
            <Text style={[s.sumVal, { color: totalBudgeted > 0 ? Colors.primary : Colors.muted }]}>
              {totalBudgeted > 0 ? formatXAFAmount(totalBudgeted) : "—"}
            </Text>
            <Text style={s.sumLbl}>Budget total</Text>
          </View>
          <View style={s.sumDivider} />
          <View style={s.sumItem}>
            <Text style={[s.sumVal, { color: overCount > 0 ? "#EF4444" : "#10B981" }]}>
              {overCount > 0 ? `${overCount} dépassé${overCount > 1 ? "s" : ""}` : "OK"}
            </Text>
            <Text style={s.sumLbl}>Alertes</Text>
          </View>
        </View>

        {/* Global progress */}
        {totalBudgeted > 0 && (
          <View style={s.globalBar}>
            <View style={s.globalBarBg}>
              <View style={[s.globalBarFill, {
                width: `${Math.min((totalSpent / totalBudgeted) * 100, 100)}%` as any,
                backgroundColor: totalSpent > totalBudgeted ? "#EF4444" : Colors.primary,
              }]} />
            </View>
            <Text style={s.globalBarLabel}>
              {totalBudgeted > 0 ? `${Math.round((totalSpent / totalBudgeted) * 100)}% utilisé` : ""}
            </Text>
          </View>
        )}

        <Text style={s.sectionTitle}>Catégories</Text>
        <Text style={s.sectionHint}>Appuyez sur une catégorie pour définir votre limite mensuelle</Text>

        {/* Categories */}
        {(budget?.lines ?? []).map(line => {
          const meta = BUDGET_CATEGORY_META[line.category];
          const status = getBudgetStatus(line);
          const barColor = status === "over" ? "#EF4444" : status === "warning" ? "#F59E0B" : Colors.primary;
          const fillPct = line.limit_amount > 0 ? Math.min((line.spent / line.limit_amount) * 100, 100) : 0;

          return (
            <TouchableOpacity key={line.category} style={s.catCard} onPress={() => openEdit(line.category, line.limit_amount)}>
              <View style={s.catTop}>
                <View style={[s.catEmoji, { backgroundColor: meta.color + "18" }]}>
                  <Text style={{ fontSize: 18 }}>{meta.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.catName}>{meta.label}</Text>
                  <Text style={s.catSpent}>
                    Dépensé : {formatXAFAmount(line.spent)}
                    {line.limit_amount > 0 ? ` / ${formatXAFAmount(line.limit_amount)}` : ""}
                  </Text>
                </View>
                {status === "over" && (
                  <View style={s.overBadge}>
                    <Text style={s.overText}>Dépassé</Text>
                  </View>
                )}
                {status === "warning" && (
                  <View style={s.warnBadge}>
                    <Text style={s.warnText}>⚠️ 80%</Text>
                  </View>
                )}
                {line.limit_amount === 0 && (
                  <Text style={s.setLimit}>Définir →</Text>
                )}
              </View>
              {line.limit_amount > 0 && (
                <View style={s.bar}>
                  <View style={[s.barFill, { width: `${fillPct}%` as any, backgroundColor: barColor }]} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={!!editModal} transparent animationType="fade" onRequestClose={() => setEditModal(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            {editModal && (
              <>
                <Text style={s.modalTitle}>
                  {BUDGET_CATEGORY_META[editModal.category].emoji} {BUDGET_CATEGORY_META[editModal.category].label}
                </Text>
                <Text style={s.modalSub}>Limite mensuelle (FCFA)</Text>
                <TextInput
                  style={s.modalInput}
                  value={editValue}
                  onChangeText={setEditValue}
                  keyboardType="numeric"
                  placeholder="Ex: 50 000"
                  placeholderTextColor="#94A3B8"
                  autoFocus
                />
                <View style={s.modalActions}>
                  <TouchableOpacity onPress={() => setEditModal(null)} style={s.modalCancel}>
                    <Text style={{ color: Colors.muted, fontWeight: "600" }}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSave} style={s.modalSave}>
                    <Text style={{ color: "#fff", fontWeight: "700" }}>Enregistrer</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
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
  subtitle: { fontSize: 13, color: Colors.muted, marginTop: 1 },
  summary: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, flexDirection: "row", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  sumItem: { flex: 1, alignItems: "center" },
  sumVal: { fontSize: 16, fontWeight: "700", color: Colors.text },
  sumLbl: { fontSize: 11, color: Colors.muted, marginTop: 3 },
  sumDivider: { width: 1, height: 40, backgroundColor: "#E2E8F0" },
  globalBar: { gap: 4 },
  globalBarBg: { height: 8, backgroundColor: "#E2E8F0", borderRadius: 4, overflow: "hidden" },
  globalBarFill: { height: 8, borderRadius: 4 },
  globalBarLabel: { fontSize: 12, color: Colors.muted, textAlign: "right" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  sectionHint: { fontSize: 12, color: Colors.muted, marginTop: -8 },
  catCard: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 8, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  catTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  catEmoji: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  catName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  catSpent: { fontSize: 12, color: Colors.muted, marginTop: 1 },
  overBadge: { backgroundColor: "#FEE2E2", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  overText: { fontSize: 11, color: "#EF4444", fontWeight: "700" },
  warnBadge: { backgroundColor: "#FEF3C7", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  warnText: { fontSize: 11, color: "#D97706", fontWeight: "700" },
  setLimit: { fontSize: 12, color: Colors.primary, fontWeight: "600" },
  bar: { height: 5, backgroundColor: "#E2E8F0", borderRadius: 3, overflow: "hidden" },
  barFill: { height: 5, borderRadius: 3 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  modalBox: { backgroundColor: "#fff", borderRadius: Radius.xl, padding: 24, width: "85%", gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: Colors.text },
  modalSub: { fontSize: 13, color: Colors.muted },
  modalInput: { borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: Radius.md, padding: 12, fontSize: 16, color: Colors.text },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancel: { flex: 1, padding: 12, alignItems: "center", borderRadius: Radius.md, borderWidth: 1.5, borderColor: "#E2E8F0" },
  modalSave: { flex: 1, padding: 12, alignItems: "center", borderRadius: Radius.md, backgroundColor: Colors.primary },
});
