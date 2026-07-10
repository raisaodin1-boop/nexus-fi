import { getSupabase } from "@/src/supabase";

export { secureRandomAlphanumeric, inviteCode } from "./secure-random";

export async function uid(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session?.user) throw { status: 401, detail: "Non authentifié" };
  return data.session.user.id;
}

const _cache = new Map<string, { v: any; ts: number }>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.v as T;
  const v = await fn();
  _cache.set(key, { v, ts: Date.now() });
  return v;
}

export function invalidateCache(prefix?: string) {
  if (!prefix) { _cache.clear(); return; }
  for (const k of _cache.keys()) if (k.startsWith(prefix)) _cache.delete(k);
}

/** Clear identity / trust / credit caches after membership or group changes. */
export function invalidateUserStatsCaches(userId: string) {
  invalidateCache(`identity-${userId}`);
  invalidateCache(`trust-score-${userId}`);
  invalidateCache(`credit-score-${userId}`);
  invalidateCache(`diaspora-home-${userId}`);
  invalidateCache(`diaspora-${userId}`);
}

// inviteCode exported from secure-random (expo-crypto)

/** Lowercase + trim — use for auth emails and profile lookup. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function throwSb(error: any) {
  if (!error) return;
  throw { status: 400, detail: error.message ?? "Erreur Supabase" };
}

export function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "23505" || /duplicate key|unique constraint/i.test(error.message ?? "");
}

const ADMIN_ROLES = ["admin", "super_admin"] as const;

export async function requireAdmin() {
  const me = await uid();
  const { data } = await getSupabase().from("profiles").select("role").eq("id", me).single();
  if (!data || !ADMIN_ROLES.includes(data.role as (typeof ADMIN_ROLES)[number])) {
    throw { status: 403, detail: "Accès réservé aux administrateurs" };
  }
}
