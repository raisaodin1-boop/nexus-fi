import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft, Coins, Sparkles } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { Button, Card } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import {
  computeRoundUpSpare,
  ROUNDUP_INCREMENTS,
  type RoundUpIncrement,
} from "@/src/momo-roundup";
import type { MomoRoundUpEvent, MomoRoundUpSettings } from "@/src/db/momo-roundup";

interface GoalOption {
  id: string;
  name: string;
}

export default function SavingsRoundUpScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<MomoRoundUpSettings | null>(null);
  const [goals, setGoals] = useState<GoalOption[]>([]);
  const [events, setEvents] = useState<MomoRoundUpEvent[]>([]);

  const load = useCallback(async () => {
    try {
      const [s, g, ev] = await Promise.all([
        api.get<MomoRoundUpSettings>("/savings/roundup"),
        api.get<GoalOption[]>("/savings/goals"),
        api.get<MomoRoundUpEvent[]>("/savings/roundup/events").catch(() => []),
      ]);
      setSettings(s);
      setGoals(g.map((x: any) => ({ id: x.id, name: x.name })));
      setEvents(ev);
    } catch {
      Alert.alert("Erreur", "Impossible de charger les paramètres d'arrondi.");
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const save = async (patch: Partial<MomoRoundUpSettings>) => {
    if (!settings) return;
    setSaving(true);
    try {
      const next = await api.patch<MomoRoundUpSettings>("/savings/roundup", {
        enabled: patch.enabled ?? settings.enabled,
        increment: patch.increment ?? settings.increment,
        goal_id: patch.goal_id !== undefined ? patch.goal_id : settings.goal_id,
      });
      setSettings(next);
    } catch (e: any) {
      Alert.alert("Erreur", e?.detail ?? "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (value: boolean) => {
    if (value && !settings?.goal_id && goals.length > 0) {
      await save({ enabled: true, goal_id: goals[0].id });
      return;
    }
    if (value && goals.length === 0) {
      Alert.alert(
        "Objectif requis",
        "Créez d'abord un objectif d'épargne pour activer l'arrondi MoMo.",
        [{ text: "Créer", onPress: () => router.push("/savings/create") }, { text: "OK" }],
      );
      return;
    }
    await save({ enabled: value });
  };

  if (loading || !settings) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const exampleAmount = 4875;
  const sparePreview = computeRoundUpSpare(exampleAmount, settings.increment);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ChevronLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>Arrondi MoMo</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Card style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Coins size={28} color={Colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Épargnez vos centimes MoMo</Text>
          <Text style={styles.heroSub}>
            Après chaque recharge wallet, la différence jusqu'au prochain palier est transférée automatiquement vers votre objectif — sans frais HODIX.
          </Text>
        </Card>

        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Activer l'arrondi</Text>
              <Text style={styles.rowSub}>Sur chaque recharge Mobile Money confirmée</Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={toggleEnabled}
              disabled={saving}
              trackColor={{ true: Colors.primary, false: Colors.border }}
            />
          </View>
        </Card>

        <Text style={styles.sectionLabel}>Palier d'arrondi</Text>
        <View style={styles.chipRow}>
          {ROUNDUP_INCREMENTS.map((inc) => (
            <TouchableOpacity
              key={inc}
              style={[styles.chip, settings.increment === inc && styles.chipActive]}
              onPress={() => save({ increment: inc as RoundUpIncrement })}
              disabled={saving}
            >
              <Text style={[styles.chipText, settings.increment === inc && styles.chipTextActive]}>
                {formatXAF(inc)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Objectif destinataire</Text>
        <View style={{ gap: 8 }}>
          {goals.length === 0 ? (
            <Card>
              <Text style={styles.emptyGoals}>Aucun objectif — créez-en un pour commencer.</Text>
              <Button label="Créer un objectif" onPress={() => router.push("/savings/create")} />
            </Card>
          ) : (
            goals.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[styles.goalPick, settings.goal_id === g.id && styles.goalPickActive]}
                onPress={() => save({ goal_id: g.id, enabled: settings.enabled || true })}
                disabled={saving}
              >
                <Text style={[styles.goalPickText, settings.goal_id === g.id && styles.goalPickTextActive]}>
                  {g.name}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <Card style={[styles.card, styles.previewCard]}>
          <View style={styles.previewHeader}>
            <Sparkles size={16} color={Colors.primary} />
            <Text style={styles.previewTitle}>Exemple</Text>
          </View>
          <Text style={styles.previewLine}>
            Recharge {formatXAF(exampleAmount)} → arrondi palier {formatXAF(settings.increment)}
          </Text>
          <Text style={styles.previewHighlight}>
            +{formatXAF(sparePreview)} épargnés automatiquement
          </Text>
        </Card>

        {events.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Historique récent</Text>
            {events.slice(0, 5).map((ev) => (
              <View key={ev.id} style={styles.eventRow}>
                <Text style={styles.eventAmt}>+{formatXAF(ev.roundup_amount)}</Text>
                <Text style={styles.eventMeta}>
                  sur recharge {formatXAF(ev.topup_amount)} · {new Date(ev.created_at).toLocaleDateString("fr-FR")}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    gap: 8,
  },
  back: { padding: 4 },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text },
  body: { padding: Spacing.xl, gap: 16, paddingBottom: 40 },
  heroCard: { alignItems: "center", gap: 10, paddingVertical: 24 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 17, fontWeight: "800", color: Colors.text, textAlign: "center" },
  heroSub: { fontSize: 13, color: Colors.textMuted, textAlign: "center", lineHeight: 20 },
  card: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },
  rowSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: Colors.textMuted, marginTop: 4 },
  chipRow: { flexDirection: "row", gap: 10 },
  chip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    backgroundColor: Colors.surface,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  chipText: { fontSize: 13, fontWeight: "700", color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  goalPick: {
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  goalPickActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  goalPickText: { fontSize: 14, fontWeight: "600", color: Colors.text },
  goalPickTextActive: { color: Colors.primary },
  emptyGoals: { fontSize: 13, color: Colors.textMuted, marginBottom: 12 },
  previewCard: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary + "33" },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  previewTitle: { fontSize: 13, fontWeight: "800", color: Colors.primary },
  previewLine: { fontSize: 13, color: Colors.text },
  previewHighlight: { fontSize: 15, fontWeight: "800", color: Colors.primary },
  eventRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  eventAmt: { fontSize: 14, fontWeight: "800", color: Colors.primary },
  eventMeta: { fontSize: 11, color: Colors.textMuted, flex: 1, textAlign: "right" },
});
