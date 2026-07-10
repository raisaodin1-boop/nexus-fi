import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Web deep link /join?code=…&type=…
 * Native hodix://join is handled in deep-link.ts; this covers https://hodix.app/join.
 */
export default function JoinRedirect() {
  const { code, type } = useLocalSearchParams<{ code?: string; type?: string }>();
  const kind = String(type ?? "tontines").toLowerCase();
  const base =
    kind === "associations" || kind === "association" ? "/associations/join"
    : kind === "cooperatives" || kind === "cooperative" ? "/cooperatives/join"
    : "/tontines/join";
  const qs = code ? `?code=${encodeURIComponent(String(code))}` : "";
  return <Redirect href={`${base}${qs}` as any} />;
}
