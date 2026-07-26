import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ShieldOff, ShieldCheck } from "lucide-react-native";
import { Colors } from "@/src/theme";

interface Props {
  flags: string[];
  size?: "sm" | "md";
}

export function TrustBadge({ flags, size = "md" }: Props) {
  const isBlacklisted = flags.includes("blacklisted");
  const isFraud = flags.includes("fraud_confirmed");

  if (!isBlacklisted && !isFraud) {
    return null;
  }

  const label = isFraud ? "Fraudeur confirmé" : "Compte suspendu";
  const color = Colors.danger;
  const Icon = ShieldOff;
  const small = size === "sm";

  return (
    <View style={[styles.badge, { backgroundColor: color + "18", borderColor: color + "44", padding: small ? 4 : 8 }]}>
      <Icon size={small ? 11 : 14} color={color} />
      <Text style={[styles.label, { color, fontSize: small ? 10 : 12 }]}>{label}</Text>
    </View>
  );
}

export function VerifiedBadge({
  size = "md",
  label = "Vérifié",
}: {
  size?: "sm" | "md";
  label?: string;
}) {
  const small = size === "sm";
  return (
    <View style={[styles.badge, { backgroundColor: Colors.success + "18", borderColor: Colors.success + "44", padding: small ? 4 : 6 }]}>
      <ShieldCheck size={small ? 11 : 14} color={Colors.success} />
      <Text style={[styles.label, { color: Colors.success, fontSize: small ? 10 : 12 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  label: { fontWeight: "700" },
});
