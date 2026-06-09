import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { AlertTriangle, TrendingDown, Target, Flame, Bell } from "lucide-react-native";
import { api } from "@/src/api";
import { Card, EmptyState } from "@/src/ui";
import { Colors, Spacing } from "@/src/theme";

interface SmartAlert {
  id: string;
  type: "savings_drop" | "goal_behind" | "streak_risk" | "missed_contribution" | string;
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
  action_label?: string;
  action_route?: string;
}

const severityConfig = {
  critical: { borderColor: "#EF4444", bg: "#FEF2F2" },
  warning: { borderColor: "#F59E0B", bg: "#FFFBEB" },
  info: { borderColor: Colors.secondary, bg: Colors.secondaryLight },
};

function alertIcon(type: string) {
  switch (type) {
    case "savings_drop": return TrendingDown;
    case "goal_behind": return Target;
    case "streak_risk": return Flame;
    case "missed_contribution": return AlertTriangle;
    default: return Bell;
  }
}

function alertIconColor(type: string): string {
  switch (type) {
    case "savings_drop": return "#EF4444";
    case "goal_behind": return Colors.secondary;
    case "streak_risk": return "#F59E0B";
    case "missed_contribution": return "#EF4444";
    default: return Colors.textMuted;
  }
}

function AlertCard({ alert }: { alert: SmartAlert }) {
  const router = useRouter();
  const cfg = severityConfig[alert.severity] ?? severityConfig.info;
  const Icon = alertIcon(alert.type);
  const iconColor = alertIconColor(alert.type);

  return (
    <View style={[styles.alertCard, { backgroundColor: cfg.bg, borderLeftColor: cfg.borderColor }]}>
      <View style={styles.alertRow}>
        <View style={[styles.iconWrap, { backgroundColor: cfg.borderColor + "20" }]}>
          <Icon color={iconColor} size={18} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.alertTitle}>{alert.title}</Text>
          <Text style={styles.alertBody}>{alert.body}</Text>
          {alert.action_label && alert.action_route ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: cfg.borderColor }]}
              onPress={() => router.push(alert.action_route as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.actionBtnText}>{alert.action_label}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const data = await api.get<SmartAlert[]>("/alerts");
      setAlerts(Array.isArray(data) ? data : []);
    } catch {
      setAlerts([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
  }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.h1}>Alertes intelligentes</Text>
            {alerts.length > 0 ? (
              <View style={styles.countBadge}>
                <Bell color="#fff" size={12} />
                <Text style={styles.countText}>{alerts.length}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.subtitle}>Basées sur vos patterns d'épargne</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.secondary} size="large" />
        </View>
      ) : alerts.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            title="Tout va bien !"
            description="Aucune alerte pour l'instant. Continuez à épargner régulièrement."
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: Spacing.xl, gap: 10 }}>
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 8,
  },
  backBtn: { paddingRight: 8, paddingVertical: 4 },
  backText: { color: Colors.primary, fontSize: 28, fontWeight: "300", lineHeight: 32 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  h1: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  subtitle: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  countBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.secondary,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  countText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  alertCard: {
    borderRadius: 14,
    borderLeftWidth: 4,
    padding: 14,
  },
  alertRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  alertTitle: { color: Colors.text, fontWeight: "800", fontSize: 14, marginBottom: 3 },
  alertBody: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  actionBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
