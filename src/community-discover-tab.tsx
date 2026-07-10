import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ShieldCheck, Users } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { VerifiedBadge } from "@/src/fraud-badge";
import { Button, Card, EmptyState } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

type PublicTontine = {
  id: string;
  name: string;
  amount_per_cycle: number;
  members_count?: number;
  reliability_score?: number;
  country?: string | null;
  is_hodix_verified?: boolean;
  description?: string | null;
  created_at?: string;
  frequency?: string;
};

const CITIES = ["Douala", "Yaoundé", "Bafoussam", "Diaspora", "CM"] as const;
const CITY_LABELS: Record<string, string> = {
  Douala: "Douala",
  Yaoundé: "Yaoundé",
  Bafoussam: "Bafoussam",
  Diaspora: "Diaspora (Paris, Montréal…)",
  CM: "National",
};

const CATEGORIES = [
  "Entrepreneuriat",
  "Famille",
  "Étudiants",
  "Agriculture",
  "Commerce",
  "Immobilier",
] as const;

const CATEGORY_KEYWORDS: Record<(typeof CATEGORIES)[number], string[]> = {
  Entrepreneuriat: ["entrepreneur", "business", "pme", "indépendant", "jeunes"],
  Famille: ["famille", "solidarité", "perles", "dames"],
  Étudiants: ["étudiant", "campus", "école"],
  Agriculture: ["agriculture", "agro", "ferme", "ouest"],
  Commerce: ["commerce", "marché", "commerçant", "douala", "littoral"],
  Immobilier: ["immobilier", "terrain", "horizon", "projet"],
};

function inferCategory(t: PublicTontine): string {
  const hay = `${t.name} ${t.description ?? ""}`.toLowerCase();
  for (const cat of CATEGORIES) {
    if (CATEGORY_KEYWORDS[cat].some((k) => hay.includes(k))) return cat;
  }
  if (t.country === "Douala" || t.country === "Yaoundé") return "Commerce";
  return "Famille";
}

function ageLabel(createdAt?: string) {
  if (!createdAt) return "Sur HODIX";
  const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
  if (days < 30) return `${days || 1} j sur HODIX`;
  if (days < 365) return `${Math.floor(days / 30)} mois sur HODIX`;
  return `${Math.floor(days / 365)} an(s) sur HODIX`;
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
  tone?: "default" | "verified" | "discover";
}) {
  const activeStyle =
    tone === "verified" ? styles.chipVerified
    : tone === "discover" ? styles.chipDiscover
    : styles.chipActive;
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && activeStyle]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function CommunityDiscoverTab() {
  const router = useRouter();
  const [items, setItems] = useState<PublicTontine[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<PublicTontine[]>("/tontines/directory");
      setItems(data);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    return items.filter((t) => {
      if (verifiedOnly && !t.is_hodix_verified) return false;
      if (city) {
        if (city === "CM") {
          if (t.country !== "CM" && t.country !== "Cameroun") return false;
        } else if (city === "Diaspora") {
          if (!["Paris", "Montréal", "France", "Canada", "Diaspora"].includes(t.country ?? "")) return false;
        } else if (t.country !== city) {
          return false;
        }
      }
      if (category && inferCategory(t) !== category) return false;
      return true;
    });
  }, [items, city, category, verifiedOnly]);

  const requestJoin = async (id: string) => {
    setJoiningId(id);
    setMsg(null);
    try {
      await api.post("/tontines/request-join", { tontine_id: id });
      setMsg("Demande envoyée au manager — il pourra l'accepter dans son tableau de gestion.");
      Alert.alert(
        "Demande envoyée",
        "Le gestionnaire de la tontine a reçu votre demande d'adhésion.",
      );
    } catch (e: any) {
      const detail = e?.detail ?? "Impossible d'envoyer la demande.";
      setMsg(detail);
      Alert.alert("Erreur", detail);
    }
    setJoiningId(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.intro}>
        <Text style={styles.introTitle}>Annuaire de confiance</Text>
        <Text style={styles.introSub}>
          Communautés publiques — Njangi, tontines et cercles vérifiés HODIX
        </Text>
      </View>

      <View style={styles.filterBlock}>
        <Text style={styles.filterLabel}>Ville</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Toutes" active={city == null} onPress={() => setCity(null)} tone="discover" />
          {CITIES.map((c) => (
            <Chip
              key={c}
              label={CITY_LABELS[c]}
              active={city === c}
              tone="discover"
              onPress={() => setCity(city === c ? null : c)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.filterBlock}>
        <Text style={styles.filterLabel}>Catégorie</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Toutes" active={category == null} onPress={() => setCategory(null)} />
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={c}
              active={category === c}
              onPress={() => setCategory(category === c ? null : c)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.filterBlock}>
        <Text style={styles.filterLabel}>Statut</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Toutes" active={!verifiedOnly} onPress={() => setVerifiedOnly(false)} />
          <Chip
            label="Vérifié par HODIX"
            active={verifiedOnly}
            tone="verified"
            onPress={() => setVerifiedOnly(true)}
          />
        </ScrollView>
      </View>

      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      {loading ? (
        <ActivityIndicator color={Colors.info} style={{ marginTop: 28 }} />
      ) : filtered.length === 0 ? (
        <View style={{ paddingHorizontal: Spacing.xl, marginTop: 16 }}>
          <Card>
            <EmptyState
              title="Aucune communauté trouvée"
              description="Élargissez vos filtres ou créez votre propre groupe."
              icon={<Users color={Colors.textMuted} size={28} />}
            />
          </Card>
        </View>
      ) : (
        <View style={{ paddingHorizontal: Spacing.xl, gap: 12, paddingTop: 8, paddingBottom: 24 }}>
          {filtered.map((t) => {
            const cat = inferCategory(t);
            const initial = (t.name.trim()[0] ?? "H").toUpperCase();
            return (
              <View key={t.id} style={[styles.card, Shadow.card]}>
                <View style={styles.cardTop}>
                  <View style={styles.logo}>
                    <Text style={styles.logoText}>{initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>{t.name}</Text>
                      {t.is_hodix_verified ? <VerifiedBadge size="sm" label="Vérifié" /> : null}
                    </View>
                    <View style={styles.metaRow}>
                      <View style={styles.catPill}>
                        <Text style={styles.catText}>{cat}</Text>
                      </View>
                      {t.country ? (
                        <Text style={styles.metaMuted}>{t.country === "CM" ? "National" : t.country}</Text>
                      ) : null}
                    </View>
                  </View>
                </View>

                {t.description ? (
                  <Text style={styles.desc} numberOfLines={2}>{t.description}</Text>
                ) : null}

                <View style={styles.socialRow}>
                  <Text style={styles.social}>{t.members_count ?? 0} membres</Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.social}>{ageLabel(t.created_at)}</Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.amount}>{formatXAF(t.amount_per_cycle)}/cycle</Text>
                </View>

                {t.reliability_score != null ? (
                  <TouchableOpacity
                    onPress={() => router.push(`/tontines/${t.id}/profile` as any)}
                    style={styles.trustRow}
                  >
                    <ShieldCheck size={13} color={Colors.success} />
                    <Text style={styles.trustText}>Trust Score {t.reliability_score}</Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.ctaRow}>
                  <Button
                    label="Voir"
                    variant="secondary"
                    fullWidth={false}
                    style={styles.ctaSecondary}
                    onPress={() => router.push(`/tontines/${t.id}/profile` as any)}
                  />
                  <Button
                    label="Demander à rejoindre"
                    fullWidth={false}
                    style={styles.ctaPrimary}
                    loading={joiningId === t.id}
                    onPress={() => requestJoin(t.id)}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: Spacing.xl, marginBottom: 10 },
  introTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  introSub: { fontSize: 13, color: Colors.textMuted, marginTop: 3, lineHeight: 18 },
  filterBlock: { marginBottom: 10, gap: 6 },
  filterLabel: {
    paddingHorizontal: Spacing.xl,
    fontSize: 11, fontWeight: "800", color: Colors.textMuted, letterSpacing: 0.3,
  },
  chips: { paddingHorizontal: Spacing.xl, gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.brandNavy, borderColor: Colors.brandNavy },
  chipDiscover: { backgroundColor: Colors.info, borderColor: Colors.info },
  chipVerified: { backgroundColor: Colors.success, borderColor: Colors.success },
  chipText: { fontSize: 12, fontWeight: "600", color: Colors.text },
  chipTextActive: { color: "#fff" },
  msg: {
    marginHorizontal: Spacing.xl, marginBottom: 8,
    fontSize: 12, fontWeight: "600", color: Colors.success,
  },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  logo: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.infoLight, alignItems: "center", justifyContent: "center",
  },
  logoText: { fontSize: 18, fontWeight: "900", color: Colors.info },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: "800", color: Colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" },
  catPill: {
    backgroundColor: Colors.secondaryLight,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full,
  },
  catText: { fontSize: 11, fontWeight: "700", color: Colors.secondary },
  metaMuted: { fontSize: 12, color: Colors.textMuted },
  desc: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  socialRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  social: { fontSize: 12, fontWeight: "600", color: Colors.textMuted },
  dot: { color: Colors.textSubtle },
  amount: { fontSize: 12, fontWeight: "800", color: Colors.primary },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  trustText: { fontSize: 12, fontWeight: "700", color: Colors.success },
  ctaRow: { flexDirection: "row", gap: 8, justifyContent: "flex-end", marginTop: 2 },
  ctaSecondary: { paddingVertical: 10, paddingHorizontal: 14 },
  ctaPrimary: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: Colors.info },
});
