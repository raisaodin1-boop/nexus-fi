import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Building2, ChevronRight, Landmark, Ticket, Users } from "lucide-react-native";

import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

type Props = {
  onDiscover: () => void;
  onCreatePress?: () => void;
};

const INTENTIONS = [
  {
    key: "save",
    title: "Épargner en groupe",
    wedge: "Tontine · Njangi",
    description: "Cotisez et recevez à tour de rôle en toute transparence.",
    icon: Users,
    color: Colors.primary,
    route: "/tontines/create",
  },
  {
    key: "manage",
    title: "Gérer mon association",
    wedge: "Gestion",
    description: "Suivez les membres, les cotisations et les projets.",
    icon: Building2,
    color: Colors.secondary,
    route: "/associations/create",
  },
  {
    key: "fund",
    title: "Lancer un fonds commun",
    wedge: "Projet",
    description: "Épargnez ensemble pour un terrain, un mariage ou une urgence.",
    icon: Landmark,
    color: Colors.accentDark,
    route: "/funds/create",
  },
] as const;

export function CommunityIntentionHub({ onDiscover, onCreatePress }: Props) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>Que souhaitez-vous faire ?</Text>
      <Text style={styles.sectionHint}>
        Commencez votre parcours financier — tontine, association ou fonds commun.
      </Text>

      <View style={{ gap: 12, marginTop: 14 }}>
        {INTENTIONS.map((card) => {
          const Icon = card.icon;
          return (
            <TouchableOpacity
              key={card.key}
              testID={`intention-${card.key}`}
              activeOpacity={0.9}
              onPress={() => {
                onCreatePress?.();
                router.push(card.route as any);
              }}
              style={[styles.card, Shadow.cardMd]}
            >
              <View style={[styles.accent, { backgroundColor: card.color }]} />
              <View style={[styles.iconBox, { backgroundColor: card.color + "18" }]}>
                <Icon color={card.color} size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.wedge}>{card.wedge}</Text>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardDesc}>{card.description}</Text>
              </View>
              <ChevronRight color={Colors.textSubtle} size={18} />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.quickRow}>
        <TouchableOpacity
          testID="intention-join-code"
          style={styles.outlineBtn}
          onPress={() => router.push("/tontines/join" as any)}
        >
          <Ticket color={Colors.secondary} size={16} />
          <Text style={styles.outlineText}>Rejoindre avec un code</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="intention-discover"
          style={[styles.outlineBtn, styles.outlineDiscover]}
          onPress={onDiscover}
        >
          <Users color={Colors.info} size={16} />
          <Text style={[styles.outlineText, { color: Colors.info }]}>Découvrir des communautés</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing.xl, paddingTop: 8 },
  sectionLabel: { fontSize: 17, fontWeight: "800", color: Colors.text },
  sectionHint: { fontSize: 13, color: Colors.textMuted, marginTop: 4, lineHeight: 18 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  iconBox: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  wedge: {
    fontSize: 10, fontWeight: "800", letterSpacing: 0.6,
    color: Colors.textSubtle, textTransform: "uppercase",
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: Colors.text, marginTop: 2 },
  cardDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 4, lineHeight: 17 },
  quickRow: { gap: 10, marginTop: 18 },
  outlineBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1.5, borderColor: Colors.secondary, borderRadius: Radius.lg,
    paddingVertical: 13, paddingHorizontal: 14, backgroundColor: Colors.surface,
  },
  outlineDiscover: { borderColor: Colors.info },
  outlineText: { fontSize: 13, fontWeight: "700", color: Colors.secondary },
});
