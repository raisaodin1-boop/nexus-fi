// AuthContext — Supabase Auth, stable, no loop
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { supabase } from "@/src/supabase";
import { sendWelcomeMessage, applyReferralBonus } from "@/src/db";
import { normalizeEmail } from "@/src/db/helpers";
import { notifyUser } from "@/src/db/notifications";
import { getOAuthRedirectUrl } from "@/src/oauth-redirect";

// Complete auth session on mobile (no-op on web)
if (Platform.OS !== "web") {
  // Dynamic import to avoid expo-crypto web build failure
  import("expo-web-browser").then((m) => m.maybeCompleteAuthSession()).catch(() => {});
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_email_verified: boolean;
  phone?: string | null;
  gender?: string | null;
  country?: string | null;
  city?: string | null;
  occupation?: string | null;
  photo_base64?: string | null;
  date_of_birth?: string | null;
  birth_place?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  push_consent?: boolean | null;
  kyc_status?: string | null;
  trust_score?: number | null;
  push_consent?: boolean | null;
  marketing_consent?: boolean | null;
  created_at: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  isAuthed: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, full_name: string, referralCode?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

function logAuthBestEffort(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[auth] ${label} failed:`, msg);
}

async function fetchProfile(userId: string): Promise<Partial<User>> {
  try {
    const timeout = new Promise<null>((res) => setTimeout(() => res(null), 8000));
    const query = supabase
      .from("profiles")
      .select("full_name,role,phone,gender,country,city,occupation,date_of_birth,birth_place,neighborhood,address,kyc_status,trust_score,email,push_consent,marketing_consent")
      .eq("id", userId)
      .single();
    const result = await Promise.race([query, timeout]);
    if (!result || !("data" in result)) return {};
    return (result as any).data ?? {};
  } catch {
    return {};
  }
}

async function buildUser(sbUser: any): Promise<User> {
  const profile = await fetchProfile(sbUser.id);
  // Keep profiles.email in sync so P2P transfer lookup by email works.
  if (sbUser.email) {
    const normalized = normalizeEmail(sbUser.email);
    if ((profile as any).email !== normalized) {
      supabase.from("profiles").update({ email: normalized }).eq("id", sbUser.id).then(() => {}, () => {});
    }
  }
  const rawRole = profile.role || sbUser.user_metadata?.role || "member";
  const role = (rawRole === "admin" || rawRole === "super_admin") ? "super_admin" : rawRole as string;
  return {
    id: sbUser.id,
    email: sbUser.email ?? "",
    full_name: profile.full_name || sbUser.user_metadata?.full_name || "",
    role,
    is_email_verified: !!sbUser.email_confirmed_at,
    phone: profile.phone ?? sbUser.phone ?? null,
    gender: profile.gender ?? null,
    country: profile.country ?? null,
    city: profile.city ?? null,
    occupation: profile.occupation ?? null,
    date_of_birth: profile.date_of_birth ?? null,
    birth_place: profile.birth_place ?? null,
    neighborhood: profile.neighborhood ?? null,
    address: profile.address ?? null,
    kyc_status: profile.kyc_status ?? null,
    trust_score: profile.trust_score ?? null,
    push_consent: (profile as any).push_consent ?? null,
    marketing_consent: (profile as any).marketing_consent ?? null,
    created_at: sbUser.created_at ?? new Date().toISOString(),
  };
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min d'inactivité

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      supabase.auth.signOut().catch(() => {});
    }, SESSION_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    // Only initialize once
    if (initialized.current) return;
    initialized.current = true;

    // Listen to auth changes — this also fires immediately with current session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const u = await buildUser(session.user);
        setUser(u);
        resetInactivityTimer();
        if (event === "SIGNED_IN") {
          setTimeout(async () => {
            try {
              const { data: profile } = await supabase.from("profiles")
                .select("welcome_email_sent_at, full_name")
                .eq("id", session.user!.id)
                .maybeSingle();
              if (!profile?.welcome_email_sent_at) {
                const name = profile?.full_name ?? session.user!.email?.split("@")[0] ?? "Membre";
                try {
                  await sendWelcomeMessage(session.user!.id, name);
                } catch (welcomeErr) {
                  logAuthBestEffort("welcome message", welcomeErr);
                  // Fallback: in-app notification so user gets a greeting even if email fails
                  await notifyUser({
                    user_id: session.user!.id,
                    title: "Bienvenue sur HODIX 🎉",
                    body: `Bonjour ${name} ! Votre compte est prêt. Commencez par compléter votre profil.`,
                    type: "system",
                  });
                }
              }
            } catch (err) { logAuthBestEffort("welcome message", err); }
          }, 2000);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [resetInactivityTimer]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password });
    if (error) {
      const msg = error.message.includes("Invalid login")
        ? "Email ou mot de passe incorrect."
        : error.message.includes("not confirmed")
        ? "Email non confirmé. Désactivez la confirmation dans Supabase → Auth → Email."
        : error.message.includes("Too many")
        ? "Trop de tentatives. Réessayez dans quelques minutes."
        : error.message;
      throw { detail: msg };
    }
    // onAuthStateChange handles state update
  }, []);

  const register = useCallback(async (email: string, password: string, full_name: string, referralCode?: string) => {
    const normalizedEmail = normalizeEmail(email);
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: { full_name, role: "member" } },
    });
    if (error) throw { detail: error.message };

    // Keep profiles.email lowercase for P2P transfer lookup.
    const newUserId = data.user?.id;
    if (newUserId) {
      supabase.from("profiles").update({ email: normalizedEmail }).eq("id", newUserId).then(() => {}, () => {});
    }

    // Welcome email via onAuthStateChange (SIGNED_IN). Referral bonus only here.
    if (newUserId && referralCode?.trim()) {
      setTimeout(async () => {
        try {
          await applyReferralBonus(newUserId, referralCode.trim().toUpperCase());
        } catch (err) {
          logAuthBestEffort("referral bonus", err);
        }
      }, 2000);
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const redirectTo = getOAuthRedirectUrl();

    if (Platform.OS === "web") {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) {
        const msg = error.message.includes("redirect_uri")
          ? "Connexion Google indisponible : vérifiez la configuration OAuth (Google Cloud + Supabase). Ajoutez cette URL dans Supabase → Auth → Redirect URLs : " + redirectTo
          : error.message;
        throw { detail: msg };
      }
      return;
    }

    // On native: use expo-auth-session + expo-web-browser
    const { makeRedirectUri } = await import("expo-auth-session");
    const WebBrowser = await import("expo-web-browser");
    const nativeRedirect = makeRedirectUri({ scheme: "hodix", path: "auth/callback" });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: nativeRedirect, skipBrowserRedirect: true },
    });
    if (error) throw { detail: error.message };
    if (!data.url) throw { detail: "Impossible d'ouvrir Google Sign-In." };

    const result = await WebBrowser.openAuthSessionAsync(data.url, nativeRedirect);
    if (result.type !== "success") return;

    const url = result.url;
    const params = new URLSearchParams(url.includes("#") ? url.split("#")[1] : url.split("?")[1] ?? "");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const code = params.get("code");

    if (code) {
      const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
      if (sessionError) throw { detail: sessionError.message };
    } else if (accessToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken ?? "",
      });
      if (sessionError) throw { detail: sessionError.message };
    }
  }, []);

  const logout = useCallback(async () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    setUser(null);
    setLoading(false);
    supabase.auth.signOut().catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const u = await buildUser(session.user);
      setUser(u);
    }
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, isAuthed: !!user, login, register, loginWithGoogle, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
