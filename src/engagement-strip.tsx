import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Flame, Target, TrendingUp } from "lucide-react-native";

import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

interface Props {
  streakWeeks?: number;
  savingsProgressPct?: number;
  trustScore?: number;
}

/** Compact engagement row — streak, savings progress, trust score */
export function EngagementStrip({ streakWeeks = 0, savingsProgressPct = 0, trustScore }: Props) {
  const router = useRouter();

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.chip, Shadow.card]}
        onPress={() => router.push("/streaks" as any)}
        activeOpacity={0.85}
        testID="home-streak-chip"
      >
        <Flame color={streakWeeks > 0 ? Colors.warning : Colors.textSubtle} size={16} />
        <Text style={styles.chipVal}>{streakWeeks}</Text>
        <Text style={styles.chipLbl}>semaines</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.chip, Shadow.card]}
        onPress={() => router.push("/(tabs)/savings")}
        activeOpacity={0.85}
        testID="home-progress-chip"
      >
        <Target color={Colors.primary} size={16} />
        <Text style={styles.chipVal}>{savingsProgressPct}%</Text>
        <Text style={styles.chipLbl}>objectif</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.chip, Shadow.card]}
        onPress={() => router.push("/(tabs)/identity")}
        activeOpacity={0.85}
        testID="home-trust-chip"
      >
        <TrendingUp color={Colors.secondary} size={16} />
        <Text style={styles.chipVal}>{trustScore ?? "—"}</Text>
        <Text style={styles.chipLbl}>score</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  chip: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 2,
  },
  chipVal: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  chipLbl: { color: Colors.textMuted, fontSize: 10, fontWeight: "600" },
});
