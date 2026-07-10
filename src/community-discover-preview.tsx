import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, Globe, Sparkles, Users } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { Card } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

type PublicTontine = {
  id: string;
  name: string;
  amount_per_cycle: number;
  members_count?: number;
  max_members?: number;
  reliability_score?: number;
  country?: string | null;
  is_hodix_verified?: boolean;
  description?: string | null;
};

export function CommunityDiscoverPreview() {
  const router = useRouter();
  const [items, setItems] = useState<PublicTontine[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<PublicTontine[]>("/tontines/directory");
      const sorted = [...data].sort((a, b) => {
        const av = Number(a.is_hodix_verified) - Number(b.is_hodix_verified);
        if (av !== 0) return -av;
        return (b.members_count ?? 0) - (a.members_count ?? 0);
      });
      setItems(sorted.slice(0, 4));
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ paddingHorizontal: Spacing.xl, marginBottom: 12, gap: 10 }}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>TONTINES PUBLIQUES VÉRIFIÉES</Text>
          <Text style={styles.title}>Communautés actives</Text>
          <Text style={styles.sub}>Rejoignez un groupe HODIX déjà en marche</Text>
        </View>
        <TouchableOpacity
          testID="discover-all-tontines"
          onPress={() => router.push("/tontines/directory" as any)}
          style={styles.seeAll}
        >
          <Globe color={Colors.secondary} size={16} />
          <Text style={styles.seeAllText}>Tout voir</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.secondary} style={{ marginVertical: 16 }} />
      ) : items.length === 0 ? (
        <Card>
          <Text style={styles.emptyTitle}>Découvrez des groupes près de vous</Text>
          <Text style={styles.emptySub}>Parcourez l'annuaire public et rejoignez une communauté d'épargne.</Text>
          <TouchableOpacity style={styles.cta} onPress={() => router.push("/tontines/directory" as any)}>
            <Text style={styles.ctaText}>Explorer l'annuaire</Text>
            <ChevronRight color="#fff" size={16} />
          </TouchableOpacity>
        </Card>
      ) : (
        items.map((t) => (
          <TouchableOpacity
            key={t.id}
            activeOpacity={0.88}
            onPress={() => router.push(`/tontines/${t.id}/profile` as any)}
            style={[styles.row, Shadow.card]}
          >
            <View style={styles.iconBox}>
              <Users color="#fff" size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <View style={styles.liveDot} />
                <Text style={styles.rowTitle} numberOfLines={1}>{t.name}</Text>
              </View>
              <Text style={styles.rowMeta}>
                {formatXAF(t.amount_per_cycle)} / cycle · {t.members_count ?? 0} membres
                {t.country ? ` · ${t.country === "CM" ? "Cameroun" : t.country}` : ""}
              </Text>
            </View>
            {t.is_hodix_verified ? (
              <View style={styles.verifiedPill}>
                <Sparkles color="#10B981" size={12} />
                <Text style={styles.verifiedText}>OK</Text>
              </View>
            ) : t.reliability_score != null ? (
              <View style={styles.scorePill}>
                <Sparkles color={Colors.warning} size={12} />
                <Text style={styles.scoreText}>{t.reliability_score}</Text>
              </View>
            ) : null}
            <ChevronRight color={Colors.textMuted} size={16} />
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, color: Colors.secondary },
  title: { fontSize: 17, fontWeight: "800", color: Colors.text, marginTop: 2 },
  sub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 4 },
  seeAllText: { fontSize: 12, fontWeight: "700", color: Colors.secondary },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.secondary, alignItems: "center", justifyContent: "center",
  },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: Colors.text },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#10B981" },
  rowMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  scorePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.warningLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  scoreText: { fontSize: 11, fontWeight: "800", color: Colors.warning },
  verifiedPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#10B98118", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  verifiedText: { fontSize: 11, fontWeight: "800", color: "#10B981" },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  emptySub: { fontSize: 12, color: Colors.textMuted, marginTop: 4, lineHeight: 18 },
  cta: {
    marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: Colors.secondary, borderRadius: Radius.lg, paddingVertical: 12,
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
