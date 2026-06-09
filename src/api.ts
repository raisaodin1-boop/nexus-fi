/**
 * HODIX API — Supabase-powered data layer.
 * Routes all api.get/post/patch/del calls to src/db.ts (Supabase).
 * No more FastAPI/Railway/MongoDB.
 */
import * as db from "@/src/db";
import { getSupabase } from "@/src/supabase";

/* ── Types ─────────────────────────────────────────────────── */

export type Role = "member" | "tontine_manager" | "super_admin";

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

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

/* ── Path router — maps api.get/post/patch paths to db calls ─ */

type Seg = string[];

function seg(path: string): Seg {
  return path.split("/").filter(Boolean);
}

async function route<T>(method: string, path: string, body?: any): Promise<T> {
  const s = seg(path);

  try {
    // ── Users
    if (method === "GET"   && s[0] === "users" && s[1] === "me" && !s[2])              return (await db.getMe()) as T;
    if (method === "PATCH" && s[0] === "users" && s[1] === "me")                        return (await db.updateMe(body)) as T;
    if (method === "GET"   && s[0] === "users" && s[1] === "me" && s[2] === "kyc")      return (await db.getKycStatus()) as T;

    // ── Tontines
    if (method === "GET"  && s[0] === "tontines" && !s[1])                              return (await db.listTontines()) as T;
    if (method === "POST" && s[0] === "tontines" && !s[1])                              return (await db.createTontine(body)) as T;
    if (method === "POST" && s[0] === "tontines" && s[1] === "join")                   return (await db.joinTontine(body?.invite_code)) as T;
    if (method === "GET"  && s[0] === "tontines" && s[1] && !s[2])                     return (await db.getTontine(s[1])) as T;
    if (method === "POST" && s[0] === "tontines" && s[1] && s[2] === "contribute")     return (await db.contributeTontine(s[1], Number(body?.amount))) as T;

    // ── Associations
    if (method === "GET"  && s[0] === "associations" && !s[1])                         return (await db.listAssociations()) as T;
    if (method === "POST" && s[0] === "associations" && !s[1])                         return (await db.createAssociation(body)) as T;
    if (method === "POST" && s[0] === "associations" && s[1] === "join")               return (await db.joinAssociation(body?.invite_code)) as T;
    if (method === "GET"  && s[0] === "associations" && s[1] && !s[2])                 return (await db.getAssociation(s[1])) as T;
    if (method === "POST" && s[0] === "associations" && s[1] && s[2] === "contribute") return (await db.contributeAssociation(s[1], Number(body?.amount))) as T;

    // ── Cooperatives
    if (method === "GET"  && s[0] === "cooperatives" && !s[1])                         return (await db.listCooperatives()) as T;
    if (method === "POST" && s[0] === "cooperatives" && !s[1])                         return (await db.createCooperative(body)) as T;
    if (method === "POST" && s[0] === "cooperatives" && s[1] === "join")               return (await db.joinCooperative(body?.invite_code)) as T;
    if (method === "GET"  && s[0] === "cooperatives" && s[1] && !s[2])                 return (await db.getCooperative(s[1])) as T;
    if (method === "POST" && s[0] === "cooperatives" && s[1] && s[2] === "contribute") return (await db.contributeCooperative(s[1], Number(body?.amount))) as T;

    // ── Funds
    if (method === "GET"  && s[0] === "funds" && !s[1])                                return (await db.listFunds()) as T;
    if (method === "POST" && s[0] === "funds" && !s[1])                                return (await db.createFund(body)) as T;
    if (method === "GET"  && s[0] === "funds" && s[1] && !s[2])                        return (await db.getFund(s[1])) as T;
    if (method === "POST" && s[0] === "funds" && s[1] && s[2] === "contribute")        return (await db.contributeFund(s[1], Number(body?.amount))) as T;

    // ── Savings
    if (method === "GET"  && s[0] === "savings" && !s[1])                              return (await db.listSavings()) as T;
    if (method === "GET"  && s[0] === "savings" && s[1] === "summary")                 return (await db.getSavingsSummary()) as T;
    if (method === "POST" && s[0] === "savings" && !s[1])                              return (await db.createSaving(body)) as T;
    if (method === "GET"  && s[0] === "savings" && s[1] && !s[2])                      return (await db.getSaving(s[1])) as T;
    if (method === "POST" && s[0] === "savings" && s[1] && s[2] === "deposit")         return (await db.depositSaving(s[1], Number(body?.amount), body?.note)) as T;

    // ── Trust score / Insights / Analytics
    if (method === "GET" && s[0] === "trust-score")                                    return (await db.getTrustScore()) as T;
    if (method === "GET" && s[0] === "insights")                                       return (await db.getInsights()) as T;
    if (method === "GET" && s[0] === "analytics")                                      return (await db.getSavingsSeries(Number(new URLSearchParams(s[2]?.split("?")[1]).get("days")) || 14)) as T;

    // ── Identity
    if (method === "GET" && s[0] === "identity" && !s[1])                              return (await db.getIdentity()) as T;
    if (method === "GET" && s[0] === "identity-profile" && s[1] === "me")              return (await db.getIdentityProfile()) as T;

    // ── Notifications
    if (method === "GET"  && s[0] === "notifications")                                 return (await db.listNotifications()) as T;
    if (method === "POST" && s[0] === "notifications" && s[1] === "push-token")        return (await db.savePushToken(body?.token)) as T;

    // ── Credit score
    if (method === "GET"  && s[0] === "credit-score" && !s[1])                         return (await db.getCreditScore()) as T;
    if (method === "GET"  && s[0] === "credit-score" && s[1] === "history")            return (await db.getCreditScoreHistory()) as T;

    // ── KYC
    if (method === "POST" && s[0] === "kyc" && s[1] === "submit")                      return (await db.submitKyc()) as T;

    // ── Payments
    if (method === "GET" && s[0] === "payments" && s[1] === "history")                 return (await db.listPayments()) as T;

    // ── Analytics (simplified chart series from existing data)
    if (method === "GET" && s[0] === "analytics" && s[1] === "savings-series")  return (await db.getSavingsSeries(14)) as T;
    if (method === "GET" && s[0] === "analytics" && s[1] === "users-series")    return (await db.getUsersSeries(14)) as T;

    // ── Admin
    if (method === "GET" && s[0] === "admin" && s[1] === "stats")                      return (await db.getAdminStats()) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "analytics")                         return (await db.getAdminAnalytics()) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "users")                             return (await db.adminListUsers(body?.search)) as T;
    if (method === "PATCH" && s[0] === "admin" && s[1] === "users" && s[2] === "role")          return (await db.adminUpdateUserRole(body?.user_id, body?.role)) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "users" && s[2] === "deactivate")    return (await db.adminDeactivateUser(body?.user_id)) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "tontines")                          return (await db.adminListTontines(body?.search)) as T;
    if (method === "PATCH" && s[0] === "admin" && s[1] === "tontines" && s[2])                  return (await db.adminUpdateTontine(s[2], body)) as T;
    if (method === "DELETE"&& s[0] === "admin" && s[1] === "tontines" && s[2])                  return (await db.adminDeleteTontine(s[2])) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "kyc")                               return (await db.adminListKyc()) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "kyc" && s[2] === "approve")         return (await db.adminHandleKyc(body?.user_id, true)) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "kyc" && s[2] === "reject")          return (await db.adminHandleKyc(body?.user_id, false)) as T;
    if (method === "POST" && s[0] === "promotion-requests" && !s[1])                            return (await db.createPromotionRequest(body?.reason)) as T;
    if (method === "GET"  && s[0] === "promotion-requests" && s[1] === "me")                   return (await db.getMyPromotionRequest()) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "promotion-requests")                return (await db.adminListPromotionRequests()) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "promotion" && s[2] === "approve")   return (await db.adminHandlePromotion(body?.user_id, true)) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "promotion" && s[2] === "reject")    return (await db.adminHandlePromotion(body?.user_id, false)) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "broadcast")                         return (await db.adminBroadcast(body?.title, body?.body)) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "messages")                          return (await db.adminListAllMessages()) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "messages")                          return (await db.adminSendMessageToUser(body?.user_id, body?.content)) as T;

    // ── Messages
    if (method === "GET"  && s[0] === "messages" && s[1] === "conversations")                   return (await db.listConversations()) as T;
    if (method === "GET"  && s[0] === "messages" && s[1] === "admin")                           return (await db.listMessages("admin")) as T;
    if (method === "GET"  && s[0] === "messages" && s[1] === "tontine" && s[2])                 return (await db.listMessages("tontine", s[2])) as T;
    if (method === "POST" && s[0] === "messages")                                               return (await db.sendMessage(body)) as T;
    if (method === "PATCH"&& s[0] === "messages" && s[1] && s[2] === "read")                   return (await db.markMessageRead(s[1])) as T;

    // ── Referral
    if (method === "GET"  && s[0] === "users" && s[1] === "me" && s[2] === "referral")         return (await db.getReferralInfo()) as T;

    // ── Forgot / Reset password (delegated to Supabase Auth)
    if (method === "POST" && s[0] === "auth" && s[1] === "forgot-password") {
      const { error } = await getSupabase().auth.resetPasswordForEmail(body?.email);
      if (error) throw { status: 400, detail: error.message };
      return { detail: "Email de réinitialisation envoyé" } as T;
    }
    if (method === "POST" && s[0] === "auth" && s[1] === "reset-password") {
      const { error } = await getSupabase().auth.updateUser({ password: body?.new_password });
      if (error) throw { status: 400, detail: error.message };
      return { detail: "Mot de passe mis à jour" } as T;
    }

    // ── Reports (stub — not yet implemented)
    if (s[0] === "reports") return { detail: "Certificats disponibles dans la version premium" } as T;

    throw { status: 404, detail: `Route introuvable: ${method} /${s.join("/")}` };

  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e?.status ?? 500, e?.detail ?? e?.message ?? "Erreur inattendue");
  }
}

/* ── Public api object (same interface as before) ─────────── */

export const api = {
  get:   <T>(path: string)                    => route<T>("GET", path),
  post:  <T>(path: string, body?: any)        => route<T>("POST", path, body),
  patch: <T>(path: string, body?: any)        => route<T>("PATCH", path, body),
  del:   <T>(path: string)                    => route<T>("DELETE", path),
  rawUrl: (_path: string) => "",
};

/* ── Auth helpers (still used by auth screens via import) ──── */

export async function forgotPassword(email: string) {
  return route<{ detail: string }>("POST", "/auth/forgot-password", { email });
}

export async function resetPassword(token: string, new_password: string) {
  return route<{ detail: string }>("POST", "/auth/reset-password", { token, new_password });
}

export async function fetchMe(): Promise<User> {
  return db.getMe() as Promise<User>;
}

/* ── Currency formatter ────────────────────────────────────── */

export function formatXAF(amount: number, currency = "XAF"): string {
  return `${Math.round(amount).toLocaleString("fr-FR")} ${currency}`;
}
