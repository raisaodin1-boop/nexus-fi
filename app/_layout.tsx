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
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

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
import { APP_MAX_WIDTH, shouldShowWebPhoneFrame } from "@/src/hooks/use-responsive";
import { DynamicSeo } from "@/src/dynamic-seo";
import { DeepLinkHandler } from "@/src/deep-link-handler";
import { PwaSetup } from "@/src/pwa-setup";
import { PushConsentModal } from "@/src/consent-modal";
import { attachPushNotificationListeners, registerExpoPushToken } from "@/src/push-notifications";
import { FloatingBackButton } from "@/src/screen-back";

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

function PushSetup() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user || Platform.OS === "web") return;

    const detach = attachPushNotificationListeners(router);

    (async () => {
      try {
        const me = await api.get<{ push_consent?: boolean | null }>("/users/me");
        if (me.push_consent === true) {
          await registerExpoPushToken();
        }
      } catch {}
      // Exécute les auto-épargnes en retard au démarrage
      try { await runDueAutoSavings(); } catch {}
    })();

    return () => detach();
  }, [user, router]);

  return null;
}

function PushConsentGate() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;

    (async () => {
      try {
        const me = await api.get<{ push_consent?: boolean | null }>("/users/me");
        if (me.push_consent === true || me.push_consent === false) return;
        setVisible(true);
      } catch {}
    })();
  }, [user]);

  if (!visible) return null;

  return (
    <PushConsentModal
      visible={visible}
      onAccept={async () => {
        setVisible(false);
        const { requestPushPermissionAndRegister } = await import("@/src/push-notifications");
        await requestPushPermissionAndRegister();
      }}
      onDecline={() => setVisible(false)}
    />
  );
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
  const { width } = useWindowDimensions();
  const [loaded, error] = useIconFonts();
  useDeviceFingerprint();
  const showWebPhoneFrame = shouldShowWebPhoneFrame(width);

  useEffect(() => {
    if (Platform.OS !== "web" && (loaded || error)) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded, error]);

  // On web, always render — no splash screen blocking
  if (Platform.OS !== "web" && !loaded && !error) return null;

  const stack = (
    <BiometricGate>
      <DynamicSeo />
      <PwaSetup />
      <DeepLinkHandler />
      <PushSetup />
      <PushConsentGate />
      <FirstLaunchGuard />
      <StatusBar style="light" />
      <OfflineBanner />
      <FloatingBackButton />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </BiometricGate>
  );

  if (Platform.OS === "web") {
    if (showWebPhoneFrame) {
      return (
        <View style={webFrameStyles.root}>
          <View style={webFrameStyles.frame}>{stack}</View>
        </View>
      );
    }
    return <View style={webFullStyles.root}>{stack}</View>;
  }

  return stack;
}

const webFrameStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#CBD5E1",
    alignItems: "center",
  },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: APP_MAX_WIDTH,
    backgroundColor: Colors.bg,
    overflow: "hidden",
  },
});

const webFullStyles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    backgroundColor: Colors.bg,
  },
});

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
