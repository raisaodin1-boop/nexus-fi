// HTTP client and Auth helpers for HODIX.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

const ACCESS_KEY = "hodix_access_token";
const REFRESH_KEY = "hodix_refresh_token";
const USER_KEY = "hodix_user";

export type Role =
  | "member"
  | "tontine_manager"
  | "super_admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_email_verified: boolean;
  phone?: string | null;
  gender?: string | null;
  country?: string | null;
  city?: string | null;
  occupation?: string | null;
  photo_base64?: string | null;
  created_at: string;
}

export async function getAccessToken(): Promise<string | null> {
  return storage.secureGet(ACCESS_KEY, "" as string);
}

export async function setTokens(access: string, refresh: string, user: User) {
  await storage.secureSet(ACCESS_KEY, access);
  await storage.secureSet(REFRESH_KEY, refresh);
  await storage.setItem(USER_KEY, JSON.stringify(user));
}

export async function clearTokens() {
  await storage.secureRemove(ACCESS_KEY);
  await storage.secureRemove(REFRESH_KEY);
  await storage.removeItem(USER_KEY);
}

export async function getStoredUser(): Promise<User | null> {
  const raw = await storage.getItem(USER_KEY, "" as string);
  if (!raw) return null;
  try {
    return JSON.parse(raw as string) as User;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  withAuth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (withAuth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const url = `${BASE}/api${path}`;
  let resp: Response;
  try {
    resp = await fetch(url, { ...options, headers });
  } catch (e) {
    throw new ApiError(0, "Connexion impossible. Vérifiez votre Internet.");
  }
  if (!resp.ok) {
    let detail = `Erreur ${resp.status}`;
    try {
      const json = await resp.json();
      detail = typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail);
    } catch {}
    throw new ApiError(resp.status, detail);
  }
  if (resp.status === 204) return {} as T;
  return (await resp.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: any, withAuth = true) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, withAuth),
  patch: <T>(path: string, body?: any) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  rawUrl: (path: string) => `${BASE}/api${path}`,
};

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

export async function login(email: string, password: string): Promise<User> {
  const data = await api.post<TokenResponse>("/auth/login", { email, password }, false);
  await setTokens(data.access_token, data.refresh_token, data.user);
  return data.user;
}

export async function register(email: string, password: string, full_name: string): Promise<User> {
  const data = await api.post<TokenResponse>(
    "/auth/register",
    { email, password, full_name },
    false,
  );
  await setTokens(data.access_token, data.refresh_token, data.user);
  return data.user;
}

export async function refreshTokens(): Promise<User | null> {
  const refresh = await storage.secureGet(REFRESH_KEY, "" as string);
  if (!refresh) return null;
  try {
    const data = await api.post<TokenResponse>("/auth/refresh", { refresh_token: refresh }, false);
    await setTokens(data.access_token, data.refresh_token, data.user);
    return data.user;
  } catch {
    return null;
  }
}

export async function logout() {
  try {
    await api.post("/auth/logout");
  } catch {}
  await clearTokens();
}

export async function forgotPassword(email: string): Promise<{ detail: string; dev_token?: string }> {
  return api.post("/auth/forgot-password", { email }, false);
}

export async function resetPassword(token: string, new_password: string): Promise<{ detail: string }> {
  return api.post("/auth/reset-password", { token, new_password }, false);
}

export async function fetchMe(): Promise<User> {
  return api.get<User>("/users/me");
}

export function formatXAF(amount: number, currency = "XAF"): string {
  return `${Math.round(amount).toLocaleString("fr-FR")} ${currency}`;
}
