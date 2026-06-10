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
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
import { isBiometricEnabled, authenticateBiometric } from "@/src/biometrics";
import { Colors } from "@/src/theme";

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

/**
 * App-lock: when the user enabled biometrics, require Face ID / fingerprint
 * once at cold start before showing any financial data. Logging in with
 * email/password counts as authentication, so the gate only arms when a
 * session is already present at launch.
 */
function BiometricGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [locked, setLocked] = useState<boolean | null>(Platform.OS === "web" ? false : null);
  const decidedRef = useRef(false);

  const tryUnlock = async () => {
    const ok = await authenticateBiometric("Déverrouiller Hodix");
    if (ok) setLocked(false);
  };

  useEffect(() => {
    if (Platform.OS === "web" || decidedRef.current || loading) return;
    decidedRef.current = true;
    (async () => {
      if (!user || !(await isBiometricEnabled())) {
        setLocked(false);
        return;
      }
      setLocked(true);
      tryUnlock();
    })();
  }, [loading, user]);

  if (locked === null) return null;
  if (!locked) return <>{children}</>;
  return (
    <View style={gateStyles.container}>
      <Text style={gateStyles.emoji}>🔒</Text>
      <Text style={gateStyles.title}>Hodix est verrouillé</Text>
      <Text style={gateStyles.sub}>Authentifiez-vous pour accéder à votre compte.</Text>
      <TouchableOpacity style={gateStyles.btn} onPress={tryUnlock}>
        <Text style={gateStyles.btnText}>Déverrouiller</Text>
      </TouchableOpacity>
    </View>
  );
}

const gateStyles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bgDark, padding: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", marginBottom: 8 },
  sub: { color: "#9CA3AF", fontSize: 15, textAlign: "center", marginBottom: 28 },
  btn: { backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  btnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});

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
    <BiometricGate>
      <PushSetup />
      <FirstLaunchGuard />
      <StatusBar style="light" />
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </BiometricGate>
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
