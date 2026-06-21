// HODIX root layout — wraps app in AuthProvider + SafeArea + Stack.
import { Platform } from "react-native";
import { initObservability } from "@/src/observability";
if (Platform.OS !== "web") {
  initObservability();
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
import { attachPushNotificationListeners, requestPushPermissionAndRegister, syncNotificationBadge } from "@/src/push-notifications";
import { runDueAutoSavings } from "@/src/db/auto-savings";
import { FloatingBackButton } from "@/src/screen-back";
import { WebShellChrome } from "@/src/web-shell";

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

function PushSetup() {
  const { user } = useAuth();
  const router = useRouter();
  const [consentVisible, setConsentVisible] = useState(false);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;

    const detach = attachPushNotificationListeners(router);
    let cancelled = false;

    (async () => {
      try {
        const me = await api.get<{ push_consent?: boolean | null }>("/users/me");
        if (cancelled) return;
        if (me.push_consent === true) {
          await requestPushPermissionAndRegister();
        } else if (me.push_consent === null || me.push_consent === undefined) {
          setConsentVisible(true);
        } else {
          await syncNotificationBadge();
        }
      } catch {}
      setTimeout(() => { runDueAutoSavings().catch(() => {}); }, 4000);
    })();

    return () => { cancelled = true; detach(); };
  }, [user, router]);

  if (!consentVisible) return null;

  return (
    <PushConsentModal
      visible={consentVisible}
      onAccept={async () => {
        setConsentVisible(false);
        const { requestPushPermissionAndRegister } = await import("@/src/push-notifications");
        await requestPushPermissionAndRegister();
      }}
      onDecline={() => setConsentVisible(false)}
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
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(Platform.OS !== "web");
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
        setChecking(false);
        return;
      }
      setLocked(true);
      setChecking(false);
      tryUnlock();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]); // tryUnlock is intentionally excluded: it doesn't change and re-running would re-lock

  if (checking) return <>{children}</>;
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
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.brandNavy, padding: 32 },
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
      <FirstLaunchGuard />
      <StatusBar style="dark" />
      <OfflineBanner />
      <WebShellChrome />
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
    backgroundColor: "#E8ECF4",
    alignItems: "center",
  },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: APP_MAX_WIDTH,
    backgroundColor: Colors.bg,
    overflow: "hidden",
    borderRadius: 20,
    marginVertical: 12,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0 8px 32px rgba(15,23,42,0.12)",
        }
      : {}),
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
