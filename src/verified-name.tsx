import React from "react";
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { BadgeCheck } from "lucide-react-native";

interface VerifiedNameProps {
  name: string;
  kycVerified?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  containerStyle?: StyleProp<ViewStyle>;
  badgeSize?: number;
}

/** Affiche un badge bleu devant le nom si l'identité KYC est validée. */
export function VerifiedName({
  name,
  kycVerified,
  style,
  numberOfLines,
  containerStyle,
  badgeSize = 16,
}: VerifiedNameProps) {
  return (
    <View style={[styles.row, containerStyle]}>
      {kycVerified ? (
        <View
          style={[styles.badge, { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 }]}
          accessibilityLabel="Identité vérifiée"
        >
          <BadgeCheck size={Math.round(badgeSize * 0.72)} color="#fff" strokeWidth={2.5} />
        </View>
      ) : null}
      <Text style={[styles.name, style]} numberOfLines={numberOfLines}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
    minWidth: 0,
  },
  badge: {
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  name: {
    flexShrink: 1,
    minWidth: 0,
  },
});
