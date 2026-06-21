import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import type { Router } from "expo-router";

import { api } from "@/src/api";

const ANDROID_CHANNELS = [
  {
    id: "default",
    name: "Général",
    importance: 4 as const,
    description: "Notifications Hodix",
  },
  {
    id: "messages",
    name: "Messages",
    importance: 4 as const,
    description: "Nouveaux messages et conversations",
  },
  {
    id: "payments",
    name: "Paiements",
    importance: 4 as const,
    description: "Confirmations de paiement et épargne",
  },
  {
    id: "promotions",
    name: "Annonces",
    importance: 3 as const,
    description: "Annonces et offres Hodix",
  },
  {
    id: "alerts",
    name: "Alertes",
    importance: 5 as const,
    description: "Rappels tontine, sécurité et urgences",
    vibrationPattern: [0, 250, 120, 250],
  },
];

async function getNotificationsModule() {
  return import("expo-notifications");
}

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const Notifications = await getNotificationsModule();
    const { AndroidImportance } = Notifications;
    const importanceMap = {
      3: AndroidImportance.DEFAULT,
      4: AndroidImportance.HIGH,
      5: AndroidImportance.MAX,
    } as const;

    for (const ch of ANDROID_CHANNELS) {
      await Notifications.setNotificationChannelAsync(ch.id, {
        name: ch.name,
        description: ch.description,
        importance: importanceMap[ch.importance],
        vibrationPattern: ch.vibrationPattern,
        enableVibrate: true,
        showBadge: true,
      });
    }
  } catch {
    /* noop */
  }
}

export async function syncNotificationBadge(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await getNotificationsModule();
    const { unread_count } = await api.get<{ unread_count: number }>("/notifications");
    const count = unread_count ?? 0;
    await Notifications.setBadgeCountAsync(count);
  } catch {
    /* noop */
  }
}

export async function registerExpoPushToken(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const Device = await import("expo-device");
    if (!Device.isDevice) return false;

    const Notifications = await getNotificationsModule();
    await setupNotificationChannels();

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) return false;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token) {
      await api.post("/notifications/push-token", {
        token,
        platform: Platform.OS,
      });
    }
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

    const Notifications = await getNotificationsModule();
    await setupNotificationChannels();

    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      final = status;
    }
    if (final !== "granted") return false;

    const ok = await registerExpoPushToken();
    if (ok) await syncNotificationBadge();
    return ok;
  } catch {
    return false;
  }
}

export function attachPushNotificationListeners(router: Router): () => void {
  if (Platform.OS === "web") return () => {};

  let sub1: { remove: () => void } | null = null;
  let sub2: { remove: () => void } | null = null;
  let sub3: { remove: () => void } | null = null;
  let sub4: { remove: () => void } | EventSubscription | null = null;
  let cancelled = false;

  type EventSubscription = { remove: () => void };

  (async () => {
    try {
      const Notifications = await getNotificationsModule();
      if (cancelled) return;

      await setupNotificationChannels();

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      sub1 = Notifications.addNotificationReceivedListener(() => {
        syncNotificationBadge().catch(() => {});
      });

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

      sub3 = Notifications.addPushTokenListener(() => {
        registerExpoPushToken().catch(() => {});
      });

      const lastNotificationResponse = await Notifications.getLastNotificationResponseAsync();
      if (lastNotificationResponse && !cancelled) {
        const data = lastNotificationResponse.notification.request.content.data as Record<string, string> | undefined;
        const target = data?.action_url ?? data?.route;
        if (target) {
          setTimeout(() => {
            try { router.push(target as any); } catch { /* noop */ }
          }, 400);
        }
      }
    } catch { /* noop */ }
  })();

  sub4 = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      registerExpoPushToken().catch(() => {});
      syncNotificationBadge().catch(() => {});
    }
  });

  return () => {
    cancelled = true;
    sub1?.remove();
    sub2?.remove();
    sub3?.remove();
    sub4?.remove();
  };
}
