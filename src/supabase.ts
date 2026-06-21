import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/src/public-env";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = publicEnv("EXPO_PUBLIC_SUPABASE_URL");
    const key = publicEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");
    if (!url || !key) {
      const hint =
        typeof window !== "undefined"
          ? "Rechargez la page ou réinstallez la PWA. Vérifiez hodix-env.js et les variables Vercel EXPO_PUBLIC_SUPABASE_*."
          : "Ajoutez EXPO_PUBLIC_SUPABASE_ANON_KEY dans Expo → Environment variables, puis reconstruisez.";
      throw new Error(`Configuration Supabase manquante. ${hint}`);
    }
    _client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: typeof window !== "undefined",
        flowType: "pkce",
      },
    });
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getSupabase() as any)[prop];
  },
});
