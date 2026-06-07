// AuthContext for HODIX
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  User,
  clearTokens,
  fetchMe,
  getAccessToken,
  getStoredUser,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  refreshTokens,
} from "@/src/api";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isAuthed: false,
  });

  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          setState({ user: null, loading: false, isAuthed: false });
          return;
        }
        const cached = await getStoredUser();
        if (cached) {
          setState({ user: cached, loading: false, isAuthed: true });
        }
        try {
          const fresh = await fetchMe();
          setState({ user: fresh, loading: false, isAuthed: true });
        } catch {
          // Access token expired — try refresh before giving up
          const refreshed = await refreshTokens();
          if (refreshed) {
            setState({ user: refreshed, loading: false, isAuthed: true });
          } else {
            await clearTokens();
            setState({ user: null, loading: false, isAuthed: false });
          }
        }
      } catch {
        setState({ user: null, loading: false, isAuthed: false });
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await apiLogin(email, password);
    setState({ user: u, loading: false, isAuthed: true });
    return u;
  }, []);

  const register = useCallback(async (email: string, password: string, full_name: string) => {
    const u = await apiRegister(email, password, full_name);
    setState({ user: u, loading: false, isAuthed: true });
  }, []);

  const logout = useCallback(async () => {
    try { await apiLogout(); } catch {}
    setState({ user: null, loading: false, isAuthed: false });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const u = await fetchMe();
      setState((p) => ({ ...p, user: u, isAuthed: true, loading: false }));
    } catch {}
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
