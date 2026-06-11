import { Platform } from "react-native";

/** OAuth redirect URL — must match Supabase Auth → URL Configuration → Redirect URLs. */
export function getOAuthRedirectUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback`;
  }
  return "hodix://auth/callback";
}
