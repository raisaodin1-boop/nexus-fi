// HODIX root layout — wraps app in AuthProvider + SafeArea + Stack.
import { Platform } from "react-native";
if (Platform.OS !== "web") {
  const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";
  if (SENTRY_DSN) {
    import("@sentry/react-native").then((Sentry) => {
      Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1 });
    });
  }
}

import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Constants from "expo-constants";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { ErrorBoundary } from "@/src/error-boundary";
import { AuthProvider, useAuth } from "@/src/auth-context";
import { ThemeProvider } from "@/src/theme-context";
import { I18nProvider } from "@/src/i18n";
import { ToastProvider } from "@/src/toast";
import { api } from "@/src/api";
import { OfflineBanner } from "@/src/offline";
import { useFirstLaunch } from "@/src/use-first-launch";
import { useDeviceFingerprint } from "@/src/device-fingerprint";

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

function PushSetup() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user || Platform.OS === "web") return;

    (async () => {
      try {
        const Device = await import("expo-device");
        if (!Device.isDevice) return;
        const Notifications = await import("expo-notifications");
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        const { status: existing } = await Notifications.getPermissionsAsync();
        let final = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          final = status;
        }
        if (final !== "granted") return;
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? "hodix";
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        if (token) await api.post("/notifications/push-token", { token });

        const sub1 = Notifications.addNotificationReceivedListener(() => {});
        const sub2 = Notifications.addNotificationResponseReceivedListener(() => {
          try { router.push("/notifications"); } catch {}
        });
        return () => {
          Notifications.removeNotificationSubscription(sub1);
          Notifications.removeNotificationSubscription(sub2);
        };
      } catch {}
    })();
  }, [user, router]);

  return null;
}

function FirstLaunchGuard() {
  const { isFirstLaunch } = useFirstLaunch();
  const router = useRouter();

  useEffect(() => {
    if (isFirstLaunch === true) {
      router.replace("/welcome");
    }
  }, [isFirstLaunch]);

  return null;
}

function RootLayoutInner() {
  const [loaded, error] = useIconFonts();
  useDeviceFingerprint();

  useEffect(() => {
    if (Platform.OS !== "web" && (loaded || error)) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded, error]);

  // On web, always render — no splash screen blocking
  if (Platform.OS !== "web" && !loaded && !error) return null;

  return (
    <>
      <PushSetup />
      <FirstLaunchGuard />
      <StatusBar style="light" />
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <ToastProvider>
                <RootLayoutInner />
              </ToastProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
