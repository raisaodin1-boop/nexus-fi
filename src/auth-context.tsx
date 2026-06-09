// AuthContext — Supabase Auth, stable, no loop
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { supabase } from "@/src/supabase";
import { sendWelcomeMessage, applyReferralBonus } from "@/src/db";

// Required for OAuth redirect handling on mobile
WebBrowser.maybeCompleteAuthSession();

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

async function fetchProfile(userId: string): Promise<Partial<User>> {
  try {
    const timeout = new Promise<null>((res) => setTimeout(() => res(null), 8000));
    const query = supabase
      .from("profiles")
      .select("full_name,role,phone,gender,country,city,occupation")
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
    created_at: sbUser.created_at ?? new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    // Only initialize once
    if (initialized.current) return;
    initialized.current = true;

    // Listen to auth changes — this also fires immediately with current session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const u = await buildUser(session.user);
        setUser(u);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name, role: "member" } },
    });
    if (error) throw { detail: error.message };

    // Post-signup side effects (non-blocking)
    const newUserId = data.user?.id;
    if (newUserId) {
      setTimeout(async () => {
        try { await sendWelcomeMessage(newUserId, full_name); } catch {}
        if (referralCode?.trim()) {
          try { await applyReferralBonus(newUserId, referralCode.trim().toUpperCase()); } catch {}
        }
      }, 2000); // wait 2s for profile row to be created via trigger
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const redirectTo = AuthSession.makeRedirectUri({ scheme: "hodix", path: "auth/callback" });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw { detail: error.message };
    if (!data.url) throw { detail: "Impossible d'ouvrir Google Sign-In." };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return;

    // Extract tokens from the URL fragment/query
    const url = result.url;
    const params = new URLSearchParams(url.includes("#") ? url.split("#")[1] : url.split("?")[1] ?? "");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken ?? "",
      });
      if (sessionError) throw { detail: sessionError.message };
    }
  }, []);

  const logout = useCallback(async () => {
    // Clear local state immediately — no waiting for network
    setUser(null);
    setLoading(false);
    // Sign out from Supabase in background
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
