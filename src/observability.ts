/**
 * HODIX observability — Sentry init, breadcrumbs, exception capture.
 * Works on native (Expo). Web uses console fallback unless DSN is set via web bundle.
 */

type SentryLike = {
  init: (opts: Record<string, unknown>) => void;
  captureException: (e: unknown, ctx?: Record<string, unknown>) => void;
  captureMessage: (msg: string, level?: string) => void;
  addBreadcrumb: (b: Record<string, unknown>) => void;
  setUser: (u: { id?: string; email?: string } | null) => void;
  setTag: (k: string, v: string) => void;
};

let sentry: SentryLike | null = null;
let initialized = false;

export async function initObservability(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;

  try {
    const { Platform } = await import("react-native");
    if (Platform.OS === "web") {
      // Lightweight web logging — full Sentry web SDK optional later
      return;
    }
    const Sentry = await import("@sentry/react-native");
    Sentry.init({
      dsn,
      tracesSampleRate: 0.15,
      enableAutoSessionTracking: true,
      environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? "production",
    });
    sentry = Sentry as unknown as SentryLike;
  } catch {
    // SDK unavailable in test / web-only builds
  }
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (__DEV__) console.error("[observability]", error, context);
  try {
    sentry?.captureException(error, context ? { extra: context } : undefined);
  } catch { /* ignore */ }
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
  if (__DEV__) console.log(`[observability:${level}]`, message);
  try {
    sentry?.captureMessage(message, level);
  } catch { /* ignore */ }
}

export function addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
  try {
    sentry?.addBreadcrumb({ category, message, data, level: "info" });
  } catch { /* ignore */ }
}

export function setObservabilityUser(user: { id: string; email?: string } | null): void {
  try {
    sentry?.setUser(user);
  } catch { /* ignore */ }
}

export function setObservabilityTag(key: string, value: string): void {
  try {
    sentry?.setTag(key, value);
  } catch { /* ignore */ }
}
