// AuthContext — Supabase Auth + profile from DB
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/src/supabase";

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

interface AuthState {
  user: User | null;
  loading: boolean;
  isAuthed: boolean;
}

interface AuthCtx extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, full_name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

/** Fetch the full profile from `profiles` table to get the real role */
async function fetchProfile(userId: string): Promise<Partial<User>> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, role, phone, gender, country, city, occupation")
      .eq("id", userId)
      .single();
    return data ?? {};
  } catch {
    return {};
  }
}

async function buildUser(sbUser: any): Promise<User> {
  const profile = await fetchProfile(sbUser.id);
  return {
    id: sbUser.id,
    email: sbUser.email ?? "",
    full_name: profile.full_name || sbUser.user_metadata?.full_name || "",
    role: profile.role || sbUser.user_metadata?.role || "member",
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
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isAuthed: false,
  });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const user = await buildUser(session.user);
        setState({ user, loading: false, isAuthed: true });
      } else {
        setState({ user: null, loading: false, isAuthed: false });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const user = await buildUser(session.user);
        setState({ user, loading: false, isAuthed: true });
      } else {
        setState({ user: null, loading: false, isAuthed: false });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Translate common Supabase errors to French
      const msg = error.message.includes("Invalid login")
        ? "Email ou mot de passe incorrect."
        : error.message.includes("Email not confirmed")
        ? "Confirmez votre email avant de vous connecter. Ou désactivez la confirmation dans Supabase → Auth → Email."
        : error.message.includes("Too many")
        ? "Trop de tentatives. Réessayez dans quelques minutes."
        : error.message;
      throw { detail: msg };
    }
    if (data.user) {
      const user = await buildUser(data.user);
      setState({ user, loading: false, isAuthed: true });
    }
  }, []);

  const register = useCallback(async (email: string, password: string, full_name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name, role: "member" } },
    });
    if (error) throw { detail: error.message };
    if (data.user) {
      const user = await buildUser(data.user);
      setState({ user, loading: false, isAuthed: true });
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ user: null, loading: false, isAuthed: false });
  }, []);

  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const user = await buildUser(session.user);
      setState({ user, loading: false, isAuthed: true });
    }
  }, []);

  return (
    <Ctx.Provider value={{ ...state, login, register, logout, refresh }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
