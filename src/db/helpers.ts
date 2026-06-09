import { getSupabase } from "@/src/supabase";

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

export function inviteCode(len = 6): string {
  return Math.random().toString(36).toUpperCase().slice(2, 2 + len);
}

export function throwSb(error: any) {
  if (!error) return;
  throw { status: 400, detail: error.message ?? "Erreur Supabase" };
}
