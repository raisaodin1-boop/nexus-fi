import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { Colors, Radius, Spacing } from "@/src/theme";

/** Shown when primary dashboard API data failed — zeros are displayed, user can retry. */
export function DegradedDataBanner({
  onRetry,
  testID,
  title = "Statistiques partielles",
  message = "Certaines données n'ont pas pu être chargées. Touchez pour réessayer.",
}: {
  onRetry: () => void;
  testID?: string;
  title?: string;
  message?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={onRetry}
      activeOpacity={0.85}
      testID={testID}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.warning + "18",
    borderWidth: 1,
    borderColor: Colors.warning + "40",
  },
  title: { color: Colors.warning, fontWeight: "800", fontSize: 13, marginBottom: 4 },
  message: { color: Colors.textMuted, fontSize: 12, lineHeight: 17 },
});
