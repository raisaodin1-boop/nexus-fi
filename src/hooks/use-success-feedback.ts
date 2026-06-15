import { Platform } from "react-native";

/**
 * Fires a "success" haptic pattern on native. No-op on web.
 * Use this after first deposit, goal achieved, trust level up, etc.
 */
export async function successFeedback() {
  if (Platform.OS === "web") return;
  try {
    const Haptics = await import("expo-haptics");
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}

/**
 * Fires a light impact haptic. No-op on web.
 */
export async function tapFeedback() {
  if (Platform.OS === "web") return;
  try {
    const Haptics = await import("expo-haptics");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
}

/**
 * Fires a warning haptic. No-op on web.
 */
export async function warningFeedback() {
  if (Platform.OS === "web") return;
  try {
    const Haptics = await import("expo-haptics");
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {}
}
