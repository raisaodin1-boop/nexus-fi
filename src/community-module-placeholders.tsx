import { StyleSheet, Text, View } from "react-native";
import { FileText, Landmark } from "lucide-react-native";

import { Card } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";

export function CommunityProjectsPlaceholder() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Projets</Text>
      <Card style={styles.card}>
        <View style={styles.iconBox}>
          <Landmark color={Colors.accentDark} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Épargne cible</Text>
          <Text style={styles.sub}>
            Terrain, mariage, urgence… Définissez un objectif commun et suivez la collecte.
          </Text>
        </View>
      </Card>
    </View>
  );
}

export function CommunityDocumentsPlaceholder() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Documents & PV</Text>
      <Card style={styles.card}>
        <View style={[styles.iconBox, { backgroundColor: Colors.brandNavy + "18" }]}>
          <FileText color={Colors.brandNavy} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Transparence</Text>
          <Text style={styles.sub}>
            Procès-verbaux, règlements et preuves — bientôt disponibles pour votre communauté.
          </Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  section: {
    color: Colors.text, fontSize: 14, fontWeight: "800",
    marginTop: 16, marginBottom: 10, letterSpacing: -0.3,
  },
  card: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    padding: 14, borderRadius: Radius.xl,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.accentDark + "18",
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 14, fontWeight: "800", color: Colors.text },
  sub: { fontSize: 12, color: Colors.textMuted, marginTop: 4, lineHeight: 17 },
});
