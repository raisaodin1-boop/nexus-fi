// HODIX design system — trust-first fintech palette (navy + teal + refined gold)
import { Platform, ViewStyle } from "react-native";

export const Colors = {
  // Brand — navy authority + teal reliability
  primary: "#0F766E",
  primaryDark: "#0D5C56",
  primaryLight: "#E6F4F2",
  brandNavy: "#0F2847",
  brandNavyLight: "#1A3A5C",
  secondary: "#1E56A0",
  secondaryLight: "#E8F0FA",
  accent: "#C9A227",
  accentDark: "#A6851F",

  // Backgrounds
  bg: "#F5F8FC",
  bgDark: "#0A1628",
  surface: "#FFFFFF",
  surfaceAlt: "#EEF2F8",
  surfaceDark: "#132238",

  // Text
  text: "#0C1A2E",
  textMuted: "#5B6B7F",
  textSubtle: "#8B9AAF",

  // UI
  border: "#D8E0EA",
  borderLight: "#EEF2F7",

  // Status
  danger: "#DC2626",
  dangerLight: "#FEF2F2",
  warning: "#D97706",
  warningLight: "#FFFBEB",
  success: "#059669",
  successLight: "#ECFDF5",
  info: "#2563EB",
  infoLight: "#EFF6FF",

  // Gradients
  gradStart: "#0F2847",
  gradMid: "#0F766E",
  gradEnd: "#1E56A0",

  // Gold / VIP
  gold: "#C9A227",
  goldLight: "#FEF9E7",
  goldDark: "#A6851F",

  // Legacy compatibility
  gradGold1: "#A6851F",
  gradGold2: "#C9A227",
  gradGold3: "#FDE68A",
  premium: "#0F2847",
  premiumGrad1: "#132238",
  premiumGrad2: "#1E56A0",
};

export const DarkColors = {
  ...Colors,
  bg: "#0A1628",
  surface: "#132238",
  surfaceAlt: "#1A2D45",
  text: "#F0F4FA",
  textMuted: "#94A3B8",
  textSubtle: "#64748B",
  border: "#243B55",
  borderLight: "#1A2D45",
};

export const Spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const Radius = {
  sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, full: 999,
};

const _webShadow = (y: number, blur: number, alpha: number) => ({
  boxShadow: `0px ${y}px ${blur}px rgba(15, 40, 71, ${alpha})`,
});

const _nativeShadow = (y: number, blur: number, alpha: number, elevation: number) => ({
  shadowColor: "#0F2847",
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

/** Time-based greeting for home screens */
export function timeGreeting(name?: string): string {
  const h = new Date().getHours();
  const base = h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${base}, ${first}` : base;
}
