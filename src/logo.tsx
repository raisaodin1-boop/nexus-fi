// HODIX official logo. Uses the brand PNG (transparent-ready) for icon usage
// and an optional wordmark with tagline.
import React from "react";
import { Image, StyleSheet, Text, View, ViewStyle, Platform } from "react-native";
import { Colors } from "@/src/theme";

const ICON_SRC = require("../assets/brand/hodix-icon-set.png");
const LOGO_SRC = require("../assets/brand/hodix-logo.png");

export function HodixLogo({
  size = 72,
  showText = false,
  variant = "icon",
  style,
}: {
  size?: number;
  showText?: boolean;
  variant?: "icon" | "lockup";
  style?: ViewStyle;
}) {
  // "lockup" = full official logo with H mark + HODIX wordmark + tagline (PNG)
  if (variant === "lockup") {
    const w = size;
    const h = size * 1.4;
    return (
      <View style={[{ alignItems: "center" }, style]}>
        <Image source={LOGO_SRC} resizeMode="contain" style={{ width: w, height: h }} />
      </View>
    );
  }

  // Default: icon variant — use the rounded-square iconography from the official set.
  return (
    <View style={[{ alignItems: "center" }, style]}>
      <View
        style={[
          styles.iconShell,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size / 4.5),
          },
          Platform.OS === "web"
            ? ({ boxShadow: "0px 8px 24px rgba(11, 31, 58, 0.35)" } as unknown as ViewStyle)
            : {
                shadowColor: Colors.primary,
                shadowOpacity: 0.35,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 10,
              },
        ]}
      >
        <Image source={ICON_SRC} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
      </View>
      {showText ? (
        <>
          <Text style={styles.brand}>HODIX</Text>
          <Text style={styles.tagline}>Trust · Community · Growth</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  iconShell: {
    overflow: "hidden",
    backgroundColor: "#0B1F3A",
  },
  brand: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: 6, marginTop: 14 },
  tagline: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600", letterSpacing: 2, marginTop: 4 },
});
