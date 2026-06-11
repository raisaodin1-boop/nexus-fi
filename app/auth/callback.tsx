// OAuth callback — exchanges PKCE code on web, then redirects home
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/src/supabase";
import { Colors } from "@/src/theme";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const code = params.get("code");
          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          } else {
            // Implicit flow / hash tokens — detectSessionInUrl handles on init
            await supabase.auth.getSession();
          }
        }
        if (!cancelled) router.replace("/");
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Connexion impossible");
          setTimeout(() => router.replace("/(auth)/login" as any), 2500);
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
