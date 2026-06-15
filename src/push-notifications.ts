import { Platform } from "react-native";
import Constants from "expo-constants";
import type { Router } from "expo-router";

import { api } from "@/src/api";

export async function registerExpoPushToken(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const Device = await import("expo-device");
    if (!Device.isDevice) return false;
    const Notifications = await import("expo-notifications");
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? "hodix";
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token) await api.post("/notifications/push-token", { token });
    return !!token;
  } catch {
    return false;
  }
}

export async function requestPushPermissionAndRegister(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const Device = await import("expo-device");
    if (!Device.isDevice) return false;
    const Notifications = await import("expo-notifications");
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== "granted") return false;
    return registerExpoPushToken();
  } catch {
    return false;
  }
}

export function attachPushNotificationListeners(router: Router): () => void {
  if (Platform.OS === "web") return () => {};

  let sub1: { remove: () => void } | null = null;
  let sub2: { remove: () => void } | null = null;
  let cancelled = false;

  (async () => {
    try {
      const Notifications = await import("expo-notifications");
      if (cancelled) return;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      sub1 = Notifications.addNotificationReceivedListener(() => {});
      sub2 = Notifications.addNotificationResponseReceivedListener((resp) => {
        const data = resp.notification.request.content.data as Record<string, string> | undefined;
        const target = data?.action_url ?? data?.route;
        try {
          if (target) router.push(target as any);
          else router.push("/notifications");
        } catch {
          try { router.push("/notifications"); } catch { /* noop */ }
        }
      });
    } catch { /* noop */ }
  })();

  return () => {
    cancelled = true;
    sub1?.remove();
    sub2?.remove();
  };
}
