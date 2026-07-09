import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { TRUST_BENEFITS_I18N } from "@/src/welcome-content";
import { Card } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";

type Props = {
  lang?: "fr" | "en";
  compact?: boolean;
  onLearnMore?: () => void;
  onCredit?: () => void;
};

export function TrustBenefitsPanel({ lang = "fr", compact, onLearnMore, onCredit }: Props) {
  const copy = TRUST_BENEFITS_I18N[lang];

  return (
    <Card style={styles.card}>
      <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.sub}>{copy.sub}</Text>

      <View style={styles.grid}>
        {copy.benefits.map((b) => (
          <View key={b.title} style={[styles.benefitRow, compact && styles.benefitRowCompact]}>
            <Text style={styles.emoji}>{b.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.benefitTitle}>{b.title}</Text>
              <Text style={styles.benefitBody}>{b.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.howTitle}>{copy.how_title}</Text>
      {copy.how_steps.map((step, i) => (
        <View key={step} style={styles.stepRow}>
          <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}

      {(onLearnMore || onCredit) ? (
        <View style={styles.actions}>
          {onLearnMore ? (
            <TouchableOpacity style={styles.actionBtn} onPress={onLearnMore}>
              <Text style={styles.actionText}>{copy.cta_identity}</Text>
              <ChevronRight color={Colors.secondary} size={16} />
            </TouchableOpacity>
          ) : null}
          {onCredit ? (
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={onCredit}>
              <Text style={[styles.actionText, { color: Colors.accent }]}>{copy.cta_credit}</Text>
              <ChevronRight color={Colors.accent} size={16} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: Colors.secondary, textTransform: "uppercase" },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text, lineHeight: 24 },
  sub: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  grid: { gap: 10, marginTop: 4 },
  benefitRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  benefitRowCompact: { gap: 10 },
  emoji: { fontSize: 22, marginTop: 2 },
  benefitTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  benefitBody: { fontSize: 12, color: Colors.textMuted, marginTop: 2, lineHeight: 17 },
  howTitle: { fontSize: 13, fontWeight: "800", color: Colors.text, marginTop: 6 },
  stepRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stepNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.secondaryLight, alignItems: "center", justifyContent: "center",
  },
  stepNumText: { fontSize: 11, fontWeight: "800", color: Colors.secondary },
  stepText: { flex: 1, fontSize: 12, color: Colors.textMuted, lineHeight: 17, paddingTop: 2 },
  actions: { gap: 8, marginTop: 6 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: Radius.lg,
    backgroundColor: Colors.secondaryLight,
  },
  actionBtnAlt: { backgroundColor: Colors.secondaryLight },
  actionText: { fontSize: 13, fontWeight: "700", color: Colors.secondary },
});
