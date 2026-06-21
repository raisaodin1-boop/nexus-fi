import { Platform } from "react-native";
import { publicEnv } from "@/src/public-env";

const CANONICAL_ORIGIN =
  (publicEnv("EXPO_PUBLIC_SITE_URL") || "https://www.hodix.app").replace(/\/$/, "");

/** Canonical web origin — www required so PKCE verifier and callback share localStorage. */
export function getWebOrigin(): string {
  if (typeof window === "undefined") return CANONICAL_ORIGIN;

  const { hostname, protocol, port } = window.location;

  if (hostname === "hodix.app" || hostname === "www.hodix.app") {
    return CANONICAL_ORIGIN;
  }

  if (hostname === "localhost" || hostname.endsWith(".vercel.app")) {
    return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
  }

  return window.location.origin;
}

/** Redirect apex hodix.app → www before OAuth (PKCE code verifier is origin-bound). */
export function redirectToCanonicalOriginIfNeeded(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hostname !== "hodix.app") return false;

  const target = `${CANONICAL_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
  return true;
}

/** OAuth redirect URL — must match Supabase Auth → URL Configuration → Redirect URLs. */
export function getOAuthRedirectUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${getWebOrigin()}/auth/callback`;
  }
  return "hodix://auth/callback";
}
