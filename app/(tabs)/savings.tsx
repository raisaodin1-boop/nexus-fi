// SAVINGS - List goals + summary
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, Target, Lock, Repeat, TrendingUp, Coins } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { Card, EmptyState, Button } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import type { GoalPrediction } from "@/src/savings-ai";

interface Goal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  savings_type: "flexible" | "locked" | "recurring";
  currency: string;
  deadline?: string | null;
}

const typeMeta: Record<string, { label: string; icon: any; color: string }> = {
  flexible: { label: "Flexible", icon: Target, color: Colors.accent },
  locked: { label: "Verrouillé", icon: Lock, color: Colors.secondary },
  recurring: { label: "Récurrent", icon: Repeat, color: Colors.primary },
};

export default function SavingsList() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [predictions, setPredictions] = useState<Record<string, GoalPrediction>>({});
  const [loading, setLoading] = useState(true);

  // Load predictions in background after goals render
  useEffect(() => {
    if (!goals.length) return;
    api.get<{ goal: any; prediction: GoalPrediction }[]>("/savings/analytics")
      .then(items => {
        const map: Record<string, GoalPrediction> = {};
        for (const item of items) map[item.goal.id] = item.prediction;
        setPredictions(map);
      })
      .catch(() => {});
  }, [goals]);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Goal[]>("/savings/goals");
      setGoals(data);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = goals.reduce((s, g) => s + g.current_amount, 0);
  const target = goals.reduce((s, g) => s + g.target_amount, 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.h1}>Épargne</Text>
          <Text style={styles.subtitle}>Vos objectifs personnels</Text>
        </View>
        <TouchableOpacity
          testID="savings-create-btn"
          onPress={() => router.push("/savings/create")}
          style={styles.fab}
        >
          <Plus color="#fff" size={22} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {/* Total card */}
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <Card dark style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total épargné</Text>
            <Text style={styles.totalValue}>{formatXAF(total)}</Text>
            {target > 0 ? (
              <View style={{ marginTop: 12 }}>
                <View style={styles.progress}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, (total / target) * 100)}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {Math.round((total / target) * 100)}% de {formatXAF(target)}
                </Text>
              </View>
            ) : null}
          </Card>
        </View>

        <View style={{ paddingHorizontal: Spacing.xl, marginTop: 4 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/savings/roundup")}
            style={styles.roundupBanner}
          >
            <View style={styles.roundupIcon}>
              <Coins size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.roundupTitle}>Arrondi MoMo</Text>
              <Text style={styles.roundupSub}>Épargnez automatiquement après chaque recharge</Text>
            </View>
            <Text style={styles.roundupCta}>Configurer →</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.secondary} style={{ marginTop: 40 }} />
        ) : goals.length === 0 ? (
          <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.xxl }}>
            <Card>
              <EmptyState
                title="Aucun objectif pour l'instant"
                description="Créez votre premier objectif d'épargne pour démarrer votre histoire financière."
                cta={
                  <Button label="Créer un objectif" onPress={() => router.push("/savings/create")} />
                }
              />
            </Card>
          </View>
        ) : (
          <View style={{ paddingHorizontal: Spacing.xl, gap: 12, marginTop: 12 }}>
            {goals.map((g) => {
              const meta = typeMeta[g.savings_type] ?? typeMeta.flexible;
              const Icon = meta.icon;
              const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
              return (
                <TouchableOpacity
                  testID={`savings-item-${g.id}`}
                  key={g.id}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/savings/${g.id}`)}
                >
                  <Card style={{ padding: 18 }}>
                    <View style={styles.goalHeader}>
                      <View style={[styles.iconBox, { backgroundColor: meta.color + "20" }]}>
                        <Icon color={meta.color} size={20} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.goalName}>{g.name}</Text>
                        <Text style={styles.goalType}>{meta.label} · {g.currency}</Text>
                      </View>
                      <Text style={styles.goalPct}>{Math.round(pct)}%</Text>
                    </View>
                    <View style={styles.progress}>
                      <View style={[styles.progressFill, { width: `${Math.min(100, pct)}%`, backgroundColor: meta.color }]} />
                    </View>
                    <View style={styles.goalFooter}>
                      <Text style={styles.goalAmount}>{formatXAF(g.current_amount, g.currency)}</Text>
                      <Text style={styles.goalTarget}>/ {formatXAF(g.target_amount, g.currency)}</Text>
                    </View>
                    <Text style={styles.releveHint}>Voir le relevé →</Text>
                    {/* ── AI prediction chip ── */}
                    {predictions[g.id] && (() => {
                      const pred = predictions[g.id];
                      const chipColor = pred.on_track === null ? Colors.secondary
                        : pred.on_track ? "#10B981" : "#F59E0B";
                      const chipLabel = pred.on_track === true ? `✅ Dans les temps`
                        : pred.on_track === false
                          ? `⚠️ +${pred.delay_months}m de retard`
                          : pred.predicted_months_remaining
                            ? `~${pred.predicted_months_remaining} mois`
                            : null;
                      return chipLabel ? (
                        <TouchableOpacity
                          onPress={() => router.push(`/savings/analytics?id=${g.id}` as any)}
                          style={[styles.predChip, { backgroundColor: chipColor + "18", borderColor: chipColor + "55" }]}
                        >
                          <TrendingUp size={11} color={chipColor} />
                          <Text style={[styles.predChipText, { color: chipColor }]}>{chipLabel}</Text>
                        </TouchableOpacity>
                      ) : null;
                    })()}
                    {g.target_amount > 0 && (() => {
                      const goalPct = Math.min((g.current_amount / g.target_amount) * 100, 100);
                      const barColor = goalPct >= 100 ? Colors.accent : goalPct >= 80 ? Colors.gold : Colors.secondary;
                      return (
                        <View style={{ marginTop: 10 }}>
                          <View style={styles.goalProgress}>
                            <View style={[styles.goalProgressFill, { width: `${goalPct}%` as any, backgroundColor: barColor }]} />
                          </View>
                          <Text style={styles.goalProgressText}>
                            {"Objectif: "}{g.target_amount.toLocaleString()}{" FCFA · "}{goalPct.toFixed(0)}{"% atteint"}
                          </Text>
                        </View>
                      );
                    })()}
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
  },
  h1: { color: Colors.primary, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  fab: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.secondary,
    alignItems: "center", justifyContent: "center", ...Shadow.card,
  },
  totalCard: { padding: 24, overflow: "hidden" },
  totalLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  totalValue: { color: "#fff", fontSize: 36, fontWeight: "900", letterSpacing: -1, marginTop: 6 },
  progress: { height: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 4, overflow: "hidden", marginTop: 6 },
  progressFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 4 },
  progressText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600", marginTop: 6 },
  goalHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  goalName: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  goalType: { color: Colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: "600" },
  goalPct: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  goalFooter: { flexDirection: "row", alignItems: "baseline", marginTop: 8 },
  goalAmount: { color: Colors.text, fontSize: 18, fontWeight: "800" },
  goalTarget: { color: Colors.textMuted, fontSize: 13, fontWeight: "600", marginLeft: 4 },
  releveHint: { color: Colors.primary, fontSize: 12, fontWeight: "700", marginTop: 10 },
  goalProgress: { height: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 4, overflow: "hidden", marginTop: 4 },
  goalProgressFill: { height: "100%", borderRadius: 4 },
  goalProgressText: { color: Colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 4 },
  predChip: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  predChipText: { fontSize: 11, fontWeight: "700" },
  roundupBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary + "33",
    marginBottom: 8,
  },
  roundupIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  roundupTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  roundupSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  roundupCta: { fontSize: 11, fontWeight: "700", color: Colors.primary },
});
