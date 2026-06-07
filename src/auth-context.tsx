// AuthContext — Supabase Auth
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

function supabaseUserToUser(sbUser: any, metadata?: any): User {
  return {
    id: sbUser.id,
    email: sbUser.email ?? "",
    full_name: sbUser.user_metadata?.full_name ?? metadata?.full_name ?? "",
    role: sbUser.user_metadata?.role ?? "member",
    is_email_verified: !!sbUser.email_confirmed_at,
    phone: sbUser.phone ?? null,
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setState({ user: supabaseUserToUser(session.user), loading: false, isAuthed: true });
      } else {
        setState({ user: null, loading: false, isAuthed: false });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setState({ user: supabaseUserToUser(session.user), loading: false, isAuthed: true });
      } else {
        setState({ user: null, loading: false, isAuthed: false });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw { detail: error.message };
    if (data.user) {
      setState({ user: supabaseUserToUser(data.user), loading: false, isAuthed: true });
    }
  }, []);

  const register = useCallback(async (email: string, password: string, full_name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });
    if (error) throw { detail: error.message };
    if (data.user) {
      setState({ user: supabaseUserToUser(data.user, { full_name }), loading: false, isAuthed: true });
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ user: null, loading: false, isAuthed: false });
  }, []);

  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setState({ user: supabaseUserToUser(session.user), loading: false, isAuthed: true });
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
