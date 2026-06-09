import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ShieldOff, ShieldCheck } from "lucide-react-native";

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
  const color = "#EF4444";
  const Icon = ShieldOff;
  const small = size === "sm";

  return (
    <View style={[styles.badge, { backgroundColor: color + "18", borderColor: color + "44", padding: small ? 4 : 8 }]}>
      <Icon size={small ? 11 : 14} color={color} />
      <Text style={[styles.label, { color, fontSize: small ? 10 : 12 }]}>{label}</Text>
    </View>
  );
}

export function VerifiedBadge({ size = "md" }: { size?: "sm" | "md" }) {
  const small = size === "sm";
  return (
    <View style={[styles.badge, { backgroundColor: "#10B98118", borderColor: "#10B98144", padding: small ? 4 : 6 }]}>
      <ShieldCheck size={small ? 11 : 14} color="#10B981" />
      <Text style={[styles.label, { color: "#10B981", fontSize: small ? 10 : 12 }]}>Vérifié</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  label: { fontWeight: "700" },
});
