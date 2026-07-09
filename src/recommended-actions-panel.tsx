import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";

import type { DashboardAction } from "@/src/db/dashboard-story";
import { Card, SectionTitle } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";

type Props = {
  actions: DashboardAction[];
  title?: string;
};

export function RecommendedActionsPanel({ actions, title = "Actions recommandées" }: Props) {
  const router = useRouter();
  if (!actions.length) return null;

  return (
    <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.md }}>
      <SectionTitle>{title}</SectionTitle>
      <View style={{ gap: 8 }}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.id}
            activeOpacity={0.88}
            onPress={() => router.push(action.route as any)}
            testID={`recommended-action-${action.id}`}
          >
            <Card style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{action.title}</Text>
                {action.subtitle ? <Text style={styles.sub}>{action.subtitle}</Text> : null}
              </View>
              <ChevronRight color={Colors.secondary} size={18} />
            </Card>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 },
  title: { fontSize: 14, fontWeight: "800", color: Colors.text },
  sub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
