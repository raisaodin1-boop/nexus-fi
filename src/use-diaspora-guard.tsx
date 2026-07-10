import { useCallback, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { api } from "@/src/api";
import type { DiasporaAccess } from "@/src/diaspora-enrollment-config";

/** Redirects unverified users away from protected diaspora routes. */
export function useDiasporaGuard(opts?: { redirectTo?: string }) {
  const router = useRouter();
  const redirect = opts?.redirectTo ?? "/diaspora";
  const [access, setAccess] = useState<DiasporaAccess | null>(null);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const a = await api.get<DiasporaAccess>("/diaspora/access");
      setAccess(a);
      if (!a.has_access) {
        router.replace(redirect as any);
      }
    } catch {
      router.replace(redirect as any);
    } finally {
      setChecking(false);
    }
  }, [redirect, router]);

  useFocusEffect(useCallback(() => { check(); }, [check]));

  return { access, checking };
}

export function DiasporaGuardSpinner({ checking }: { checking: boolean }) {
  if (!checking) return null;
  return <ActivityIndicator style={{ marginTop: 80 }} size="large" />;
}
