// OAuth callback — PKCE must complete on the same origin that started the flow (www.hodix.app).
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/src/supabase";
import { redirectToCanonicalOriginIfNeeded } from "@/src/oauth-redirect";
import { Colors } from "@/src/theme";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web" && redirectToCanonicalOriginIfNeeded()) return;

    let cancelled = false;

    (async () => {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          // detectSessionInUrl exchanges the ?code= on init — getSession refreshes state.
          const { error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
        }
        if (!cancelled) router.replace("/");
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Connexion impossible");
          setTimeout(() => router.replace("/(auth)/login" as any), 3000);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg, padding: 24 }}>
      <ActivityIndicator size="large" color={Colors.primary} />
      {error ? (
        <Text style={{ color: Colors.danger, marginTop: 16, textAlign: "center", fontSize: 13 }}>{error}</Text>
      ) : null}
    </View>
  );
}
