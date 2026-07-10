import React, { useCallback, useMemo, useState } from "react";
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
import { VerifiedBadge } from "@/src/fraud-badge";
import { Button, Card, EmptyState } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";

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
  is_public?: boolean;
  is_hodix_verified?: boolean;
  compliance_rate: number | null;
  reliability_score: number;
  created_at: string;
}

type MemberBucket = "lt50" | "50to100" | "gt100";
type Visibility = "public" | "private";

const FREQ_LABELS: Record<string, string> = {
  daily: "Quotidienne",
  weekly: "Hebdomadaire",
  biweekly: "Bimensuelle",
  monthly: "Mensuelle",
};

const AMOUNT_OPTIONS = [500, 1000, 2000, 2500, 5000, 10000];

const CITY_OPTIONS: { key: string; label: string }[] = [
  { key: "Douala", label: "Douala" },
  { key: "Yaoundé", label: "Yaoundé" },
  { key: "Bafoussam", label: "Bafoussam" },
  { key: "CM", label: "National" },
];

const MEMBER_OPTIONS: { key: MemberBucket; label: string }[] = [
  { key: "lt50", label: "< 50" },
  { key: "50to100", label: "50 – 100" },
  { key: "gt100", label: "100+" },
];

const reliabilityColor = (s: number) =>
  s >= 80 ? "#10B981" : s >= 60 ? "#F59E0B" : "#EF4444";

const placeLabel = (country: string | null) => {
  if (!country) return null;
  if (country === "CM") return "National";
  return country;
};

function matchesCity(tCountry: string | null, city: string) {
  if (!tCountry) return false;
  if (city === "CM") return tCountry === "CM" || tCountry === "Cameroun";
  return tCountry === city;
}

function matchesMembers(count: number, bucket: MemberBucket) {
  if (bucket === "lt50") return count < 50;
  if (bucket === "50to100") return count >= 50 && count <= 100;
  return count > 100;
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.filterBlock}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChips}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  tone = "default",
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tone?: "default" | "verified";
}) {
  const activeStyle =
    tone === "verified" ? styles.chipVerified : styles.chipActive;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && activeStyle]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TontineCard({
  t,
  onPress,
}: {
  t: TontineItem;
  onPress: () => void;
}) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            {t.is_hodix_verified ? <View style={styles.liveDot} /> : null}
            <Text style={styles.cardName} numberOfLines={1}>{t.name}</Text>
          </View>
          <View style={styles.badgeRow}>
            {t.is_hodix_verified ? (
              <VerifiedBadge size="sm" label="HODIX vérifiée" />
            ) : null}
            <View style={styles.freqBadge}>
              <Text style={styles.freqText}>{FREQ_LABELS[t.frequency] ?? t.frequency}</Text>
            </View>
            {t.country ? (
              <Text style={styles.flagText}>{placeLabel(t.country)}</Text>
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

      {t.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>{t.description}</Text>
      ) : null}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Users size={12} color={Colors.textMuted} />
          <Text style={styles.statText}>{t.members_count} membres</Text>
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
        onPress={onPress}
      />
    </Card>
  );
}

export default function TontineDirectory() {
  const router = useRouter();
  const [all, setAll] = useState<TontineItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState<number | null>(null);
  const [freq, setFreq] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberBucket | null>(null);
  const [visibility, setVisibility] = useState<Visibility | null>("public");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<TontineItem[]>("/tontines/directory");
      setAll(data);
    } catch {
      setAll([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const activeFilterCount = [
    amount != null,
    freq != null,
    city != null,
    members != null,
    visibility === "private",
    verifiedOnly,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setAmount(null);
    setFreq(null);
    setCity(null);
    setMembers(null);
    setVisibility("public");
    setVerifiedOnly(false);
  };

  const items = useMemo(() => {
    if (visibility === "private") return [];
    return all.filter((t) => {
      if (verifiedOnly && !t.is_hodix_verified) return false;
      if (amount != null && Number(t.amount_per_cycle) !== amount) return false;
      if (freq && t.frequency !== freq) return false;
      if (city && !matchesCity(t.country, city)) return false;
      if (members && !matchesMembers(t.members_count, members)) return false;
      return true;
    });
  }, [all, amount, freq, city, members, visibility, verifiedOnly]);

  const verified = items.filter((t) => t.is_hodix_verified);
  const others = items.filter((t) => !t.is_hodix_verified);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Annuaire des Tontines</Text>
          <Text style={styles.subtitle}>
            {loading
              ? "Chargement…"
              : `${items.length} tontine${items.length > 1 ? "s" : ""} · filtrez selon votre budget`}
          </Text>
        </View>
        {activeFilterCount > 0 ? (
          <TouchableOpacity onPress={resetFilters} style={styles.resetBtn}>
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filtersPanel}>
        <FilterRow label="Cotisation">
          <Chip label="Toutes" active={amount == null} onPress={() => setAmount(null)} />
          {AMOUNT_OPTIONS.map((a) => (
            <Chip
              key={a}
              label={formatXAF(a)}
              active={amount === a}
              onPress={() => setAmount(amount === a ? null : a)}
            />
          ))}
        </FilterRow>

        <FilterRow label="Fréquence">
          <Chip label="Toutes" active={freq == null} onPress={() => setFreq(null)} />
          {(["daily", "weekly", "biweekly", "monthly"] as const).map((f) => (
            <Chip
              key={f}
              label={FREQ_LABELS[f]}
              active={freq === f}
              onPress={() => setFreq(freq === f ? null : f)}
            />
          ))}
        </FilterRow>

        <FilterRow label="Ville">
          <Chip label="Toutes" active={city == null} onPress={() => setCity(null)} />
          {CITY_OPTIONS.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              active={city === c.key}
              onPress={() => setCity(city === c.key ? null : c.key)}
            />
          ))}
        </FilterRow>

        <FilterRow label="Membres">
          <Chip label="Tous" active={members == null} onPress={() => setMembers(null)} />
          {MEMBER_OPTIONS.map((m) => (
            <Chip
              key={m.key}
              label={m.label}
              active={members === m.key}
              onPress={() => setMembers(members === m.key ? null : m.key)}
            />
          ))}
        </FilterRow>

        <FilterRow label="Visibilité">
          <Chip
            label="Publiques"
            active={visibility === "public"}
            onPress={() => setVisibility("public")}
          />
          <Chip
            label="Privées"
            active={visibility === "private"}
            onPress={() => setVisibility("private")}
          />
        </FilterRow>

        <FilterRow label="Vérification">
          <Chip label="Toutes" active={!verifiedOnly} onPress={() => setVerifiedOnly(false)} />
          <Chip
            label="Vérifiées HODIX"
            active={verifiedOnly}
            tone="verified"
            onPress={() => setVerifiedOnly(true)}
          />
        </FilterRow>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.secondary} style={{ marginTop: 40 }} />
        ) : visibility === "private" ? (
          <Card>
            <EmptyState
              title="Tontines privées"
              description="Les tontines privées ne sont pas listées ici. Demandez le code d'invitation à l'admin, puis rejoignez-la depuis l'onglet Groupes."
              icon={<Globe color={Colors.textMuted} size={32} />}
            />
            <Button
              label="Aller aux Groupes"
              variant="secondary"
              onPress={() => router.push("/(tabs)/groups" as any)}
              style={{ marginTop: 12 }}
            />
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              title="Aucune tontine trouvée"
              description="Élargissez vos filtres (cotisation, ville ou fréquence) pour voir plus de groupes adaptés à votre budget."
              icon={<Globe color={Colors.textMuted} size={32} />}
            />
            {activeFilterCount > 0 ? (
              <Button label="Réinitialiser les filtres" variant="secondary" onPress={resetFilters} style={{ marginTop: 12 }} />
            ) : null}
          </Card>
        ) : (
          <>
            {verified.length > 0 ? (
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Tontines publiques vérifiées</Text>
                <Text style={styles.sectionSub}>
                  Validées par HODIX — trouvez vite un groupe à votre budget
                </Text>
              </View>
            ) : null}
            {verified.map((t) => (
              <TontineCard
                key={t.id}
                t={t}
                onPress={() => router.push(`/tontines/${t.id}/profile` as any)}
              />
            ))}
            {others.length > 0 ? (
              <View style={[styles.sectionHead, { marginTop: 8 }]}>
                <Text style={styles.sectionTitle}>Autres tontines publiques</Text>
              </View>
            ) : null}
            {others.map((t) => (
              <TontineCard
                key={t.id}
                t={t}
                onPress={() => router.push(`/tontines/${t.id}/profile` as any)}
              />
            ))}
          </>
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
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  backBtn: { padding: 6 },
  backText: { fontSize: 22, color: Colors.secondary, fontWeight: "700" },
  h1: { fontSize: 22, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  resetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  resetText: { fontSize: 12, fontWeight: "700", color: Colors.secondary },
  filtersPanel: {
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  filterBlock: { gap: 6 },
  filterLabel: {
    paddingHorizontal: Spacing.xl,
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textMuted,
    letterSpacing: 0.3,
  },
  filterChips: {
    paddingHorizontal: Spacing.xl,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  chipVerified: { backgroundColor: "#10B981", borderColor: "#10B981" },
  chipText: { fontSize: 12, fontWeight: "600", color: Colors.text },
  chipTextActive: { color: "#fff" },
  list: { paddingHorizontal: Spacing.xl, gap: 12, paddingTop: 14, paddingBottom: 100 },
  sectionHead: { gap: 4, marginBottom: 4, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  sectionSub: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  card: { padding: 16, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" },
  cardName: { flex: 1, fontSize: 16, fontWeight: "700", color: Colors.text },
  cardDesc: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
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
