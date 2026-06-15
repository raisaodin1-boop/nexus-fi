// Premium theme — Nexus Fi / HODIX
import { Platform, ViewStyle } from "react-native";

export const Colors = {
  // Brand
  primary: "#00C896",        // Emerald premium
  primaryDark: "#00A87E",
  primaryLight: "#E6FBF5",
  secondary: "#6366F1",      // Indigo accent
  secondaryLight: "#EEF2FF",
  accent: "#F5C842",         // Gold subtle
  accentDark: "#D4A820",

  // Backgrounds
  bg: "#F7F8FC",
  bgDark: "#0A0A0F",
  surface: "#FFFFFF",
  surfaceAlt: "#F0F2F8",
  surfaceDark: "#14141F",

  // Text
  text: "#0D0F1A",
  textMuted: "#6B7280",
  textSubtle: "#9CA3AF",

  // UI
  border: "#E5E7EB",
  borderLight: "#F3F4F6",

  // Status
  danger: "#EF4444",
  dangerLight: "#FEF2F2",
  warning: "#F59E0B",
  warningLight: "#FFFBEB",
  success: "#10B981",
  successLight: "#ECFDF5",
  info: "#3B82F6",
  infoLight: "#EFF6FF",

  // Gradient stops
  gradStart: "#00C896",
  gradMid: "#6366F1",
  gradEnd: "#8B5CF6",

  // Gold / VIP
  gold: "#F5C842",
  goldLight: "#FEF9C3",
  goldDark: "#D4A820",

  // Legacy compatibility
  gradGold1: "#D4A820",
  gradGold2: "#F5C842",
  gradGold3: "#FDE68A",
  premium: "#1A0A3D",
  premiumGrad1: "#2D1B69",
  premiumGrad2: "#6D28D9",
};

export const DarkColors = {
  ...Colors,
  bg: "#0A0A0F",
  surface: "#14141F",
  surfaceAlt: "#1C1C2A",
  text: "#F0F0FF",
  textMuted: "#9CA3AF",
  textSubtle: "#6B7280",
  border: "#2A2A3A",
  borderLight: "#1F1F2E",
};

export const Spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const Radius = {
  sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, full: 999,
};

const _webShadow = (y: number, blur: number, alpha: number) => ({
  boxShadow: `0px ${y}px ${blur}px rgba(0, 200, 150, ${alpha})`,
});

const _nativeShadow = (y: number, blur: number, alpha: number, elevation: number) => ({
  shadowColor: "#00C896",
  shadowOffset: { width: 0, height: y },
  shadowOpacity: alpha,
  shadowRadius: blur,
  elevation,
});

const _shadow = (y: number, blur: number, alpha: number, elev: number): ViewStyle =>
  (Platform.OS === "web" ? _webShadow(y, blur, alpha) : _nativeShadow(y, blur, alpha, elev)) as ViewStyle;

export const Shadow = {
  card: _shadow(2, 8, 0.06, 2),
  cardMd: _shadow(4, 16, 0.1, 4),
  cardDark: _shadow(8, 24, 0.2, 8),
};
