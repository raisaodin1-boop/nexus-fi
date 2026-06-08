import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius } from "@/src/theme";
import { DocumentButton, DocumentsPanel } from "@/src/document-button";
import { SectionTitle } from "@/src/ui";

export default function DocumentsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Mes Documents</Text>
        <Text style={styles.sub}>
          Chaque PDF est signé, horodaté et comporte un QR code de vérification officielle.
        </Text>

        <SectionTitle>Générer un document</SectionTitle>

        <View style={styles.grid}>
          <DocumentButton kind="trust_score" />
          <DocumentButton kind="savings_summary" />
        </View>

        <View style={styles.hint}>
          <Text style={styles.hintText}>
            💡 Les certificats de tontine et reçus de cotisation sont disponibles directement
            depuis la page de chaque tontine.
          </Text>
        </View>

        <SectionTitle>Historique des documents</SectionTitle>
        <DocumentsPanel />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.xl, paddingBottom: 60 },
  heading: { fontSize: 26, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: Colors.textMuted, marginTop: 4, marginBottom: 8, lineHeight: 20 },
  grid: { gap: Spacing.md, marginBottom: Spacing.md },
  hint: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  hintText: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
});
