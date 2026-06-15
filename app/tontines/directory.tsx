import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Globe, Shield, Star, Users } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { Button, Card, EmptyState } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

interface TontineItem {
  id: string;
  name: string;
  amount_per_cycle: number;
  frequency: string;
  max_members: number;
  language: string | null;
  country: string | null;
  description: string | null;
  members_count: number;
  compliance_rate: number | null;
  reliability_score: number;
  created_at: string;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: "Hebdo",
  biweekly: "Bimensuel",
  monthly: "Mensuel",
};

const COUNTRIES = ["CM", "SN", "CI", "BF", "ML", "TG", "BJ", "GA", "FR", "BE"];
const COUNTRY_FLAGS: Record<string, string> = {
  CM: "🇨🇲", SN: "🇸🇳", CI: "🇨🇮", BF: "🇧🇫", ML: "🇲🇱",
  TG: "🇹🇬", BJ: "🇧🇯", GA: "🇬🇦", FR: "🇫🇷", BE: "🇧🇪",
};

const reliabilityColor = (s: number) =>
  s >= 80 ? "#10B981" : s >= 60 ? "#F59E0B" : "#EF4444";

export default function TontineDirectory() {
  const router = useRouter();
  const [all, setAll] = useState<TontineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [freq, setFreq] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<TontineItem[]>("/tontines/directory");
      setAll(data);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const items = all.filter((t) => {
    if (freq && t.frequency !== freq) return false;
    if (country && t.country !== country) return false;
    return true;
  });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Annuaire des Tontines</Text>
          <Text style={styles.subtitle}>Rejoignez une communauté</Text>
        </View>
      </View>

      {/* Frequency filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {[null, "weekly", "biweekly", "monthly"].map((f) => {
          const active = freq === f;
          const label = f === null ? "Toutes" : FREQ_LABELS[f] ?? f;
          return (
            <TouchableOpacity
              key={f ?? "all"}
              onPress={() => setFreq(f)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={styles.divider} />
        {COUNTRIES.map((c) => {
          const active = country === c;
          return (
            <TouchableOpacity
              key={c}
              onPress={() => setCountry(active ? null : c)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {COUNTRY_FLAGS[c]} {c}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.secondary} style={{ marginTop: 60 }} />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              title="Aucune tontine publique"
              description="Il n'y a pas encore de tontines publiques correspondant à vos critères."
              icon={<Globe color={Colors.textMuted} size={32} />}
            />
          </Card>
        ) : (
          items.map((t) => (
            <Card key={t.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName} numberOfLines={1}>{t.name}</Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.freqBadge}>
                      <Text style={styles.freqText}>{FREQ_LABELS[t.frequency] ?? t.frequency}</Text>
                    </View>
                    {t.country ? (
                      <Text style={styles.flagText}>{COUNTRY_FLAGS[t.country] ?? "🌍"} {t.country}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={[styles.reliabilityBadge, { borderColor: reliabilityColor(t.reliability_score) }]}>
                  <Star size={10} color={reliabilityColor(t.reliability_score)} />
                  <Text style={[styles.reliabilityText, { color: reliabilityColor(t.reliability_score) }]}>
                    {t.reliability_score}
                  </Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Users size={12} color={Colors.textMuted} />
                  <Text style={styles.statText}>{t.members_count}/{t.max_members}</Text>
                </View>
                <Text style={styles.amount}>{formatXAF(t.amount_per_cycle)}/cycle</Text>
              </View>

              {t.compliance_rate !== null ? (
                <View style={styles.complianceWrap}>
                  <View style={styles.complianceBar}>
                    <View
                      style={[
                        styles.complianceFill,
                        {
                          width: `${t.compliance_rate}%` as any,
                          backgroundColor: reliabilityColor(t.compliance_rate),
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.complianceLabel}>
                    <Shield size={10} color={Colors.textMuted} />
                    <Text style={styles.complianceText}>{t.compliance_rate}% conformité</Text>
                  </View>
                </View>
              ) : null}

              <Button
                label="Voir"
                variant="secondary"
                fullWidth={false}
                style={styles.viewBtn}
                onPress={() => router.push(`/tontines/${t.id}/profile` as any)}
              />
            </Card>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: { padding: 6 },
  backText: { fontSize: 22, color: Colors.secondary, fontWeight: "700" },
  h1: { fontSize: 22, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  filterRow: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  chipText: { fontSize: 12, fontWeight: "600", color: Colors.text },
  chipTextActive: { color: "#fff" },
  divider: { width: 1, height: 24, backgroundColor: Colors.border, marginHorizontal: 4 },
  list: { paddingHorizontal: Spacing.xl, gap: 12, paddingBottom: 100 },
  card: { padding: 16, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardName: { fontSize: 16, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  freqBadge: {
    backgroundColor: Colors.secondaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  freqText: { fontSize: 11, fontWeight: "700", color: Colors.secondary },
  flagText: { fontSize: 12, color: Colors.textMuted },
  reliabilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1.5,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reliabilityText: { fontSize: 12, fontWeight: "800" },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 13, color: Colors.textMuted, fontWeight: "600" },
  amount: { fontSize: 14, fontWeight: "700", color: Colors.primary },
  complianceWrap: { gap: 4 },
  complianceBar: {
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    overflow: "hidden",
  },
  complianceFill: { height: "100%", borderRadius: Radius.full },
  complianceLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  complianceText: { fontSize: 11, color: Colors.textMuted },
  viewBtn: { alignSelf: "flex-end", paddingVertical: 10, paddingHorizontal: 20 },
});
