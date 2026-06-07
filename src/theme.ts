// Hodix theme tokens.
export const Colors = {
  primary: "#0B1F3A",
  primaryDark: "#06122A",
  secondary: "#1D4ED8",
  accent: "#10B981",
  accentDark: "#059669",
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",
  text: "#0F172A",
  textMuted: "#64748B",
  textSubtle: "#94A3B8",
  border: "#E2E8F0",
  danger: "#EF4444",
  warning: "#F59E0B",
  success: "#10B981",
  // gradients
  gradStart: "#0B1F3A",
  gradMid: "#1E3A8A",
  gradEnd: "#1D4ED8",
  // gold / VIP
  gold: "#D4AF37",
  goldLight: "#F5D76E",
  goldDark: "#B8962A",
  premium: "#1A0A3D",
  premiumGrad1: "#2D1B69",
  premiumGrad2: "#6D28D9",
  gradGold1: "#B8962A",
  gradGold2: "#F5D76E",
  gradGold3: "#D4AF37",
};

export const DarkColors = {
  primary: "#0B1F3A",
  primaryDark: "#06122A",
  secondary: "#1D4ED8",
  accent: "#10B981",
  accentDark: "#059669",
  bg: "#0F0F14",
  surface: "#1A1A24",
  surfaceAlt: "#22222F",
  text: "#F0F0FF",
  textMuted: "#A0A0B8",
  textSubtle: "#606078",
  border: "#2A2A3A",
  danger: "#EF4444",
  warning: "#F59E0B",
  success: "#10B981",
  // gradients
  gradStart: "#0B1F3A",
  gradMid: "#1E3A8A",
  gradEnd: "#1D4ED8",
  // gold / VIP
  gold: "#D4AF37",
  goldLight: "#F5D76E",
  goldDark: "#B8962A",
  premium: "#1A0A3D",
  premiumGrad1: "#2D1B69",
  premiumGrad2: "#6D28D9",
  gradGold1: "#B8962A",
  gradGold2: "#F5D76E",
  gradGold3: "#D4AF37",
};

export const Spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const Radius = {
  sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 999,
};

// Shadow tokens — use platform-aware values: web prefers `boxShadow` to silence
// the React Native Web deprecation warning, native keeps `shadow*`.
import { Platform } from "react-native";

const _webShadow = (yOffset: number, blur: number, alpha: number) => ({
  boxShadow: `0px ${yOffset}px ${blur}px rgba(11, 31, 58, ${alpha})`,
});

const _nativeShadow = (yOffset: number, blur: number, alpha: number, elevation: number) => ({
  shadowColor: "#0B1F3A",
  shadowOffset: { width: 0, height: yOffset },
  shadowOpacity: alpha,
  shadowRadius: blur,
  elevation,
});

const _shadow = (y: number, blur: number, alpha: number, elev: number) =>
  Platform.OS === "web" ? _webShadow(y, blur, alpha) : _nativeShadow(y, blur, alpha, elev);

export const Shadow = {
  card: _shadow(4, 12, 0.08, 3),
  cardDark: _shadow(10, 20, 0.25, 8),
};
