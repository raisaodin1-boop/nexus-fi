/**
 * HODIX API — Supabase-powered data layer.
 * Routes all api.get/post/patch/del calls to src/db.ts (Supabase).
 * No more FastAPI/Railway/MongoDB.
 */
import * as db from "@/src/db";
import { normalizeEmail } from "@/src/db/helpers";
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
  push_consent?: boolean | null;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  detail: string;
  redirect_to?: string;
  payment_required?: boolean;
  constructor(status: number, detail: string, extra?: { redirect_to?: string; payment_required?: boolean }) {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.redirect_to = extra?.redirect_to;
    this.payment_required = extra?.payment_required;
  }
}

/* ── Path router — maps api.get/post/patch paths to db calls ─ */

type Seg = string[];

function seg(path: string): Seg {
  return path.split("?")[0].split("/").filter(Boolean);
}

function q(path: string): URLSearchParams {
  const qs = path.split("?")[1];
  return new URLSearchParams(qs ?? "");
}

async function route<T>(method: string, path: string, body?: any): Promise<T> {
  const s = seg(path);
  const query = q(path);

  try {
    // ── Public platform stats (no auth)
    if (method === "GET" && s[0] === "platform" && s[1] === "stats")                  return (await db.getPublicPlatformStats()) as T;
    if (method === "GET" && s[0] === "dashboard" && s[1] === "story")                   return (await db.getDashboardStory()) as T;

    // ── Users
    if (method === "GET"   && s[0] === "users" && s[1] === "me" && !s[2])              return (await db.getMe()) as T;
    if (method === "PATCH" && s[0] === "users" && s[1] === "me")                        return (await db.updateMe(body)) as T;
    if (method === "POST" && s[0] === "users" && s[1] === "me" && s[2] === "data-export") return (await db.requestDataExport()) as T;
    if (method === "POST" && s[0] === "users" && s[1] === "me" && s[2] === "delete-request") return (await db.requestAccountDeletion()) as T;
    if (method === "GET"   && s[0] === "users" && s[1] === "me" && s[2] === "kyc")      return (await db.getKycStatus()) as T;

    // ── Tontines
    if (method === "GET"  && s[0] === "tontines" && !s[1])                                    return (await db.listTontines()) as T;
    if (method === "POST" && s[0] === "tontines" && !s[1])                                    return (await db.createTontineSecure(body)) as T;
    if (method === "POST" && s[0] === "tontines" && s[1] === "join")                          return (await db.joinTontineSecure(body?.invite_code)) as T;
    if (method === "GET"  && s[0] === "tontines" && s[1] === "directory")                     return (await db.listPublicTontines()) as T;
    if (method === "GET"  && s[0] === "tontines" && s[1] && s[2] === "profile")               return (await db.getPublicTontineProfile(s[1])) as T;
    if (method === "POST" && s[0] === "tontines" && s[1] === "request-join")                  return (await db.requestJoinTontine(body?.tontine_id)) as T;
    if (method === "GET"  && s[0] === "tontines" && s[1] && !s[2])                            return (await db.getTontine(s[1])) as T;
    if (method === "POST" && s[0] === "tontines" && s[1] && s[2] === "contribute")
      return db.rejectDirectPaymentRedirect("tontine_contribution", { tontine_id: s[1] }) as T;
    if (method === "GET"  && s[0] === "tontines" && s[1] && s[2] === "leaderboard")           return (await db.getTontineLeaderboard(s[1])) as T;
    if (method === "GET"  && s[0] === "tontines" && s[1] && s[2] === "escrow")                return (await db.getEscrowStatus(s[1])) as T;
    if (method === "POST" && s[0] === "tontines" && s[1] && s[2] === "escrow-dispute")        return (await db.reportEscrowDispute(s[1], body?.reason ?? "")) as T;
    if (method === "GET"  && s[0] === "tontines" && s[1] && s[2] === "reserve")               return (await db.getTontineReserveFund(s[1])) as T;
    if (method === "GET"  && s[0] === "tontines" && s[1] && s[2] === "overdue")               return (await db.getOverdueMembers(s[1])) as T;
    if (method === "POST" && s[0] === "tontines" && s[1] && s[2] === "advance")             return (await db.advanceTontineCycle(s[1])) as T;
    if (method === "PATCH" && s[0] === "tontines" && s[1] && s[2] === "rotation")           return (await db.updateTontineRotation(s[1], body)) as T;
    if (method === "GET"  && s[0] === "tontines" && s[1] && s[2] === "disbursements")        return (await db.listTontineDisbursements(s[1])) as T;
    if (method === "POST" && s[0] === "tontines" && s[1] && s[2] === "disbursements")       return (await db.recordTontineDisbursement(s[1], body)) as T;
    if (method === "POST" && s[0] === "tontines" && s[1] && s[2] === "vote-exclusion")        return (await db.voteExclusion(s[1], body?.user_id, body?.reason ?? "")) as T;
    if (method === "GET"  && s[0] === "tontines" && s[1] && s[2] === "exclusion-votes")       return (await db.getExclusionVotes(s[1])) as T;
    if (method === "GET"  && s[0] === "tontines" && s[1] && s[2] === "guarantors")           return (await db.listTontineGuarantors(s[1])) as T;
    if (method === "GET"  && s[0] === "tontines" && s[1] && s[2] === "my-guarantors")        return (await db.getMyGuarantorAssignments(s[1])) as T;
    if (method === "POST" && s[0] === "tontines" && s[1] && s[2] === "guarantors" && s[3] === "claim")
      return (await db.claimGuarantorLiability(s[1], body?.user_id, body?.reason)) as T;
    if (method === "POST" && s[0] === "tontines" && s[1] && s[2] === "guarantors")
      return (await db.assignTontineGuarantors(s[1], body?.guarantors ?? body?.guarantor_refs ?? [])) as T;
    if (method === "POST" && s[0] === "tontines" && s[1] && s[2] === "rate-creator")          return (await db.rateCreator(s[1], Number(body?.rating), body?.comment)) as T;
    if (method === "GET"  && s[0] === "creator-reputation" && s[1])                           return (await db.getCreatorReputation(s[1])) as T;
    if (method === "POST" && s[0] === "security" && s[1] === "device-fingerprint")            return (await db.registerDeviceFingerprint(body?.fingerprint)) as T;
    if (method === "POST" && s[0] === "security" && s[1] === "flag-user")                     return (await db.flagUserAsFraud(body?.user_id, body?.reason)) as T;
    if (method === "GET"  && s[0] === "security" && s[1] === "trust-flags" && s[2])           return (await db.getUserTrustFlags(s[2])) as T;

    // ── Consent
    if (method === "POST" && s[0] === "consent" && s[1] === "tontine")                        return (await db.recordTontineConsent(body?.version, body?.tontine_id)) as T;
    if (method === "GET"  && s[0] === "consent" && s[1] === "tontine" && s[2] === "check")
      return ({ signed: await db.hasSignedConsent(query.get("version") ?? body?.version ?? "1.0") }) as T;

    // ── Wallet security
    if (method === "POST" && s[0] === "wallet" && s[1] === "pin" && s[2] === "set")           return (await db.setWalletPin(body?.pin_hash)) as T;
    if (method === "POST" && s[0] === "wallet" && s[1] === "pin" && s[2] === "verify")        return (await db.verifyWalletPin(body?.pin_hash)) as T;
    if (method === "GET"  && s[0] === "wallet" && s[1] === "pin" && s[2] === "status")        return ({ has_pin: await db.hasWalletPin() }) as T;
    if (method === "POST" && s[0] === "wallet" && s[1] === "otp" && s[2] === "generate")      return (await db.generateTransactionOtp()) as T;
    if (method === "POST" && s[0] === "wallet" && s[1] === "otp" && s[2] === "verify")        return (await db.verifyTransactionOtp(body?.code)) as T;
    if (method === "POST" && s[0] === "wallet" && s[1] === "check-tx")                        return (await db.preTransactionCheck(Number(body?.amount_xaf), body?.recipient_phone)) as T;
    if (method === "GET"  && s[0] === "wallet" && s[1] === "freeze-status")                   return (await db.getWalletFreezeStatus()) as T;
    if (method === "POST" && s[0] === "wallet" && s[1] === "unfreeze")                        return (await db.unfreezeWallet()) as T;
    if (method === "GET"  && s[0] === "wallet" && s[1] === "security-log")                    return (await db.getSecurityLog()) as T;

    // ── Associations
    if (method === "GET"  && s[0] === "associations" && !s[1])                         return (await db.listAssociations()) as T;
    if (method === "POST" && s[0] === "associations" && !s[1])                         return (await db.createAssociation(body)) as T;
    if (method === "POST" && s[0] === "associations" && s[1] === "join")               return (await db.joinAssociation(body?.invite_code)) as T;
    if (method === "GET"  && s[0] === "associations" && s[1] && !s[2])                 return (await db.getAssociation(s[1])) as T;
    if (method === "POST" && s[0] === "associations" && s[1] && s[2] === "contribute")
      return db.rejectDirectPaymentRedirect("association_contribution", { association_id: s[1] }) as T;

    // ── Cooperatives
    if (method === "GET"  && s[0] === "cooperatives" && !s[1])                         return (await db.listCooperatives()) as T;
    if (method === "POST" && s[0] === "cooperatives" && !s[1])                         return (await db.createCooperative(body)) as T;
    if (method === "POST" && s[0] === "cooperatives" && s[1] === "join")               return (await db.joinCooperative(body?.invite_code)) as T;
    if (method === "GET"  && s[0] === "cooperatives" && s[1] && !s[2])                 return (await db.getCooperative(s[1])) as T;
    if (method === "POST" && s[0] === "cooperatives" && s[1] && s[2] === "contribute")
      return db.rejectDirectPaymentRedirect("cooperative_contribution", { cooperative_id: s[1] }) as T;

    // ── Funds
    if (method === "GET"  && s[0] === "funds" && !s[1])                                return (await db.listFunds()) as T;
    if (method === "POST" && s[0] === "funds" && !s[1])                                return (await db.createFund(body)) as T;
    if (method === "GET"  && s[0] === "funds" && s[1] && !s[2])                        return (await db.getFund(s[1])) as T;
    if (method === "POST" && s[0] === "funds" && s[1] && s[2] === "contribute")
      return db.rejectDirectPaymentRedirect("fund_contribution", { fund_id: s[1] }) as T;

    // ── Savings
    if (method === "GET"  && s[0] === "savings" && (!s[1] || s[1] === "goals"))          return (await db.listSavings()) as T;
    if (method === "GET"  && s[0] === "savings" && s[1] === "summary")                 return (await db.getSavingsSummary()) as T;
    if (method === "GET"  && s[0] === "savings" && s[1] === "roundup" && s[2] === "events") return (await db.listMomoRoundUpEvents()) as T;
    if (method === "GET"  && s[0] === "savings" && s[1] === "roundup")                   return (await db.getMomoRoundUpSettings()) as T;
    if (method === "PATCH" && s[0] === "savings" && s[1] === "roundup")                  return (await db.updateMomoRoundUpSettings(body ?? {})) as T;
    if (method === "POST" && s[0] === "savings" && (!s[1] || s[1] === "goals"))         return (await db.createSaving(body)) as T;
    if (method === "GET"  && s[0] === "savings" && s[1] && !s[2])                      return (await db.getSaving(s[1])) as T;
    if (method === "POST" && s[0] === "savings" && s[1] && s[2] === "deposit")
      return db.rejectDirectPaymentRedirect("savings_deposit", { goal_id: s[1] }) as T;
    if (method === "POST" && s[0] === "savings" && s[1] === "goals" && s[2] && s[3] === "transactions")
      return (await db.savingsGoalTransaction(s[2], body)) as T;
    if (method === "POST" && s[0] === "savings" && s[1] === "goals" && s[2] && s[3] === "unlock")
      return (await db.grantSavingsEarlyUnlock(s[2])) as T;

    // ── Manager
    if (method === "GET" && s[0] === "manager" && s[1] === "overview")                   return (await db.getManagerOverview()) as T;

    // ── SMS
    if (method === "POST" && s[0] === "sms" && s[1] === "tontines" && s[2] && s[3] === "reminders")
      return (await db.sendTontineReminders(s[2])) as T;
    if (method === "GET" && s[0] === "trust-score")                                    return (await db.getTrustScore()) as T;
    if (method === "GET" && s[0] === "insights")                                       return (await db.getInsights()) as T;
    if (method === "GET" && s[0] === "analytics" && !s[1])
      return (await db.getSavingsSeries(Number(query.get("days")) || 14)) as T;
    if (method === "GET" && s[0] === "analytics" && s[1] === "me" && s[2] === "savings")
      return (await db.getSavingsSeries(Number(query.get("days")) || 14)) as T;
    if (method === "GET" && s[0] === "analytics" && s[1] === "me" && s[2] === "contributions")
      return (await db.getContributionsSeries(Number(query.get("days")) || 14)) as T;
    if (method === "GET" && s[0] === "analytics" && s[1] === "platform" && s[2] === "savings")
      return (await db.getPlatformSavingsSeries(Number(query.get("days")) || 14)) as T;
    if (method === "GET" && s[0] === "analytics" && s[1] === "platform" && s[2] === "users")
      return (await db.getUsersSeries(Number(query.get("days")) || 14)) as T;
    if (method === "GET" && s[0] === "analytics" && s[1] === "platform" && s[2] === "contributions")
      return (await db.getPlatformContributionsSeries(Number(query.get("days")) || 14)) as T;

    if (method === "GET" && s[0] === "verify" && s[1])
      return (await db.verifyCertificateByHash(s[1])) as T;

    if (method === "GET" && s[0] === "manager" && s[1] === "pro-status")
      return (await db.getManagerProStatus()) as T;

    // ── Identity
    if (method === "GET" && s[0] === "identity" && !s[1])                              return (await db.getIdentity()) as T;
    if (method === "GET" && s[0] === "identity-profile" && s[1] === "me")              return (await db.getIdentityProfile()) as T;

    // ── Notifications
    if (method === "GET"  && s[0] === "notifications" && !s[1])                          return (await db.listNotifications()) as T;
    if (method === "POST" && s[0] === "notifications" && s[1] === "read-all")          return (await db.markAllNotificationsRead()) as T;
    if (method === "POST" && s[0] === "notifications" && s[1] && s[2] === "read") {
      await db.markNotifRead(s[1]);
      return { detail: "Lu" } as T;
    }
    if (method === "POST" && s[0] === "notifications" && s[1] === "push-token")        return (await db.savePushToken(body?.token, body?.platform)) as T;
    if (method === "POST" && s[0] === "notifications" && s[1] === "consent")          return (await db.saveNotificationConsent(!!body?.push_consent, body?.marketing_consent)) as T;

    // ── Credit score
    if (method === "GET"  && s[0] === "credit-score" && !s[1])                         return (await db.getCreditScore()) as T;
    if (method === "GET"  && s[0] === "credit-score" && s[1] === "history")            return (await db.getCreditScoreHistory()) as T;
    if (method === "GET"  && s[0] === "emoney" && s[1] === "license")                  return (await db.getEmoneyLicenseConfig()) as T;

    // ── Savings analytics
    if (method === "GET" && s[0] === "savings" && s[1] === "analytics" && !s[2])       return (await db.getAllSavingsAnalytics()) as T;
    if (method === "GET" && s[0] === "savings" && s[1] && s[2] === "analytics")        return (await db.getSavingsAnalytics(s[1])) as T;

    // ── Wallet
    if (method === "GET"  && s[0] === "wallet" && !s[1])                               return (await db.getWallet()) as T;
    if (method === "GET"  && s[0] === "wallet" && s[1] === "transactions" && s[2])     return (await db.getWalletTransaction(s[2])) as T;
    if (method === "GET"  && s[0] === "wallet" && s[1] === "transactions")             return (await db.getWalletTransactions()) as T;
    if (method === "GET"  && s[0] === "wallet" && s[1] === "rates")                    return (await db.getExchangeRates()) as T;
    if (method === "POST" && s[0] === "wallet" && s[1] === "topup")                    return db.rejectDirectPayment() as T;
    if (method === "POST" && s[0] === "wallet" && s[1] === "withdraw")                 return (await db.withdrawWallet(body)) as T;
    if (method === "POST" && s[0] === "wallet" && s[1] === "transfer")                 return (await db.transferWallet(body)) as T;
    if (method === "POST" && s[0] === "wallet" && s[1] === "pay-contribution")         return db.rejectDirectPayment() as T;

    // ── KYC
    if (method === "POST" && s[0] === "kyc" && s[1] === "submit") {
      if (body?.id_front_base64 && body?.selfie_base64) {
        return (await db.submitKycFromBase64(body)) as T;
      }
      return (await db.submitKyc(body)) as T;
    }

    // ── Payments
    if (method === "GET"  && s[0] === "payments" && s[1] === "history")                 return (await db.listPayments()) as T;
    if (method === "GET"  && s[0] === "payments" && s[1] && s[2] === "receipt")          return (await db.getPaymentReceipt(s[1])) as T;
    if (method === "GET"  && s[0] === "withdrawals" && s[1] && s[2] === "receipt")        return (await db.getWithdrawalReceipt(s[1])) as T;
    if (method === "POST" && s[0] === "payments" && s[1] && s[2] === "receipt" && s[3] === "email")
      return (await db.sendPaymentReceiptEmail(s[1], !!body?.force)) as T;
    if (method === "GET"  && s[0] === "payments" && s[1] && s[2] === "status")          return (await db.getPaymentStatus(s[1])) as T;
    if (method === "POST" && s[0] === "payments" && s[1] === "mtn" && s[2] === "initiate")
      return (await db.initiateMtnPayment(body)) as T;
    if (method === "POST" && s[0] === "payments" && s[1] === "cinetpay" && s[2] === "initiate")
      return (await db.initiateMtnPayment(body)) as T;
    if (method === "POST" && s[0] === "payments" && s[1] === "cinetpay" && s[2] === "confirm")
      return (await db.confirmCinetpayPayment(body)) as T;
    if (method === "POST" && s[0] === "payments" && s[1] === "paynote" && s[2] === "confirm")
      return (await db.confirmPaynoteMtnPayment(body)) as T;
    if (method === "POST" && s[0] === "payments" && s[1] === "contributions" && s[2] === "checkout")
      return (await db.createContributionCheckout(body)) as T;
    if (method === "POST" && s[0] === "payments" && s[1] === "mobile-money" && s[2] === "initiate")
      return (await db.initiateMtnPayment(body)) as T;
    if (method === "POST" && s[0] === "payments" && s[1] === "mobile-money" && s[2] === "confirm")
      return (await db.confirmCinetpayPayment(body)) as T;
    if (method === "GET"  && s[0] === "payments" && s[1] === "qr-data")                   return (await db.getPaymentQrData()) as T;
    if (method === "POST" && s[0] === "payments" && s[1] === "withdrawal" && s[2] === "request")
      return (await db.requestWithdrawal(body)) as T;

    // ── Analytics (simplified chart series from existing data)
    if (method === "GET" && s[0] === "analytics" && s[1] === "savings-series")  return (await db.getSavingsSeries(14)) as T;
    if (method === "GET" && s[0] === "analytics" && s[1] === "users-series")    return (await db.getUsersSeries(14)) as T;
    if (method === "GET" && s[0] === "financial-analytics")  return (await db.getFinancialAnalytics()) as T;

    // ── Streaks
    if (method === "GET"  && s[0] === "streaks")                                          return (await db.getStreakData()) as T;

    // ── Leaderboard / Ranking
    if (method === "GET"  && s[0] === "tontines" && s[1] && s[2] === "leaderboard")      return (await db.getTontineLeaderboard(s[1])) as T;
    if (method === "GET"  && s[0] === "ranking" && s[1] === "regional")                  return (await db.getRegionalRanking(query.get("country") ?? "CM")) as T;

    // ── Family accounts
    if (method === "POST" && s[0] === "family" && s[1] === "link")                       return (await db.linkFamilyMember(body?.email, body?.relationship)) as T;
    if (method === "GET"  && s[0] === "family" && s[1] === "overview")                   return (await db.getFamilyOverview()) as T;

    // ── Smart alerts
    if (method === "GET"  && s[0] === "alerts")                                           return (await db.getSmartAlerts()) as T;
    if (method === "POST" && s[0] === "alerts" && s[1] === "dismiss")                     return (await db.dismissSmartAlert(body?.alert_id ?? "")) as T;

    // ── NFT certificates
    if (method === "POST" && s[0] === "certificates" && s[1] === "mint")                 return (await db.mintCertificateHash(body?.doc_id, body?.doc_type)) as T;

    // ── Exchange rates (extended)
    if (method === "GET"  && s[0] === "exchange-rates")                                   return (await import("@/src/exchange-rates").then(m => m.getRates())) as T;

    // ── Diaspora (manual cotisations depuis l'étranger)
    if (method === "GET"  && s[0] === "diaspora" && s[1] === "home")                      return (await db.getDiasporaHome()) as T;
    if (method === "GET"  && s[0] === "diaspora" && s[1] === "contributions")              return (await db.listDiasporaContributions({ status: query.get("status") ?? undefined, tontine_id: query.get("tontine_id") ?? undefined })) as T;
    if (method === "POST" && s[0] === "diaspora" && s[1] === "requests")                   return (await db.ensureDiasporaRequest(body?.tontine_id)) as T;
    if (method === "GET"  && s[0] === "diaspora" && s[1] === "join-preview")               return (await db.getDiasporaJoinPreview(query.get("code") ?? undefined, query.get("tontine_id") ?? undefined)) as T;
    if (method === "POST" && s[0] === "diaspora" && s[1] === "join")                      return (await db.joinTontineDiaspora(body?.invite_code, !!body?.diaspora_consent)) as T;
    if (method === "POST" && s[0] === "diaspora" && s[1] === "proof-upload")             return (await db.uploadDiasporaProof(body?.base64, body?.mime)) as T;
    if (method === "GET"  && s[0] === "diaspora" && s[1] === "requests" && s[2] && s[3] === "receipt")
      return (await db.getDiasporaReceipt(s[2])) as T;
    if (method === "GET"  && s[0] === "diaspora" && s[1] === "requests" && s[2])
      return (await db.getDiasporaContribution(s[2])) as T;
    if (method === "POST" && s[0] === "diaspora" && s[1] === "requests" && s[2] && s[3] === "payment-started")
      return (await db.markDiasporaPaymentStarted(s[2], body)) as T;
    if (method === "POST" && s[0] === "diaspora" && s[1] === "requests" && s[2] && s[3] === "proof")
      return (await db.submitDiasporaProof(s[2], body)) as T;

    // ── Admin
    if (method === "GET" && s[0] === "admin" && s[1] === "stats")                      return (await db.getAdminStats()) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "payment-config")                   return (await db.getPaymentConfig()) as T;
    if (method === "PATCH" && s[0] === "admin" && s[1] === "payment-config")                   return (await db.updatePaymentConfig(body)) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "analytics")                         return (await db.getAdminAnalytics()) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "investor-kpis")                       return (await db.getInvestorKpis()) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "investor-export")                   return (await db.getInvestorDataRoomExport(Number(query.get("days")) || 90)) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "users")
      return (await db.adminListUsers(
        query.get("search") ?? "",
        Number(query.get("offset")) || 0,
        Number(query.get("limit")) || 50,
      )) as T;
    if (method === "PATCH" && s[0] === "admin" && s[1] === "users" && s[2] === "role")          return (await db.adminUpdateUserRole(body?.user_id, body?.role)) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "users" && s[2] === "deactivate")    return (await db.adminDeactivateUser(body?.user_id)) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "tontines")                          return (await db.adminListTontines(query.get("search") ?? "")) as T;
    if (method === "PATCH" && s[0] === "admin" && s[1] === "tontines" && s[2])                  return (await db.adminUpdateTontine(s[2], body)) as T;
    if (method === "DELETE"&& s[0] === "admin" && s[1] === "tontines" && s[2])                  return (await db.adminDeleteTontine(s[2])) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "kyc" && s[2])                      return (await db.adminGetKycDetail(s[2])) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "kyc")                               return (await db.adminListKyc()) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "kyc" && s[2] === "approve")         return (await db.adminHandleKyc(body?.user_id, true)) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "kyc" && s[2] === "reject")          return (await db.adminHandleKyc(body?.user_id, false, body?.reason)) as T;
    if (method === "DELETE"&& s[0] === "admin" && s[1] === "kyc" && s[2])                      return (await db.adminDeleteKyc(s[2])) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "compliance" && s[2] === "stats")     return (await db.adminComplianceStats()) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "compliance" && s[2] === "audit")    return (await db.adminListComplianceAudit(Number(query.get("limit") ?? 100), query.get("category") ?? undefined)) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "compliance" && s[2] === "fraud-alerts") return (await db.adminListFraudAlerts(query.get("status") ?? "open")) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "compliance" && s[2] === "fraud-review") return (await db.adminReviewFraudAlert(body?.alert_id, body?.status)) as T;
    if (method === "POST" && s[0] === "promotion-requests" && !s[1])                            return (await db.createPromotionRequest(body?.reason)) as T;
    if (method === "GET"  && s[0] === "promotion-requests" && s[1] === "me")                   return (await db.getMyPromotionRequest()) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "promotion-requests")                return (await db.adminListPromotionRequests()) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "promotion" && s[2] === "approve")   return (await db.adminHandlePromotion(body?.user_id, true, body?.request_id)) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "promotion" && s[2] === "reject")    return (await db.adminHandlePromotion(body?.user_id, false, body?.request_id)) as T;
    if (method === "DELETE"&& s[0] === "admin" && s[1] === "promotion-requests" && s[2])       return (await db.adminDeletePromotionRequest(s[2])) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "broadcast")                         return (await db.adminSendAdvertisement(body?.title, body?.body)) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "messages" && s[2] === "threads")     return (await db.adminListMessageThreads()) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "messages")                          return (await db.adminListAllMessages()) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "messages")                          return (await db.adminSendMessageToUser(body?.user_id, body?.content)) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "advertisement")                     return (await db.adminSendAdvertisement(body?.title, body?.content)) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "diaspora" && s[2] === "stats")      return (await db.adminDiasporaStats()) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "diaspora" && s[2] === "requests")   return (await db.adminListDiasporaRequests({ status: query.get("status") ?? undefined, method: query.get("method") ?? undefined, overdue: query.get("overdue") === "1" })) as T;
    if (method === "GET"   && s[0] === "admin" && s[1] === "diaspora" && s[2] === "requests" && s[3])
      return (await db.getDiasporaContributionAdmin(s[3])) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "diaspora" && s[2] === "validate")   return (await db.adminValidateDiaspora(body?.request_id, body?.note)) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "diaspora" && s[2] === "reject")     return (await db.adminRejectDiaspora(body?.request_id, body?.reason, body?.note)) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "diaspora" && s[2] === "needs-info") return (await db.adminRequestDiasporaInfo(body?.request_id, body?.message)) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "diaspora" && s[2] === "suspicious") return (await db.adminMarkDiasporaSuspicious(body?.request_id, body?.note)) as T;
    if (method === "POST"  && s[0] === "admin" && s[1] === "diaspora" && s[2] === "assign")     return (await db.adminAssignDiaspora(body?.request_id, body?.agent_id)) as T;

    // ── Messages
    if (method === "GET"  && s[0] === "messages" && s[1] === "conversations")                   return (await db.listConversations()) as T;
    if (method === "GET"  && s[0] === "messages" && s[1] === "search")                         return (await db.searchMessageRecipients(query.get("q") ?? "")) as T;
    if (method === "GET"  && s[0] === "messages" && s[1] === "unread-count")                   return ({ unread_count: await db.getUnreadCount() }) as T;
    if (method === "GET"  && s[0] === "messages" && s[1] === "admin")                           return (await db.listMessages("admin")) as T;
    if (method === "GET"  && s[0] === "messages" && s[1] === "broadcast")                      return (await db.listMessages("broadcast")) as T;
    if (method === "GET"  && s[0] === "messages" && s[1] === "direct" && s[2])                 return (await db.listMessages("direct", s[2])) as T;
    if (method === "GET"  && s[0] === "messages" && s[1] === "tontine" && s[2])                 return (await db.listMessages("tontine", undefined, s[2])) as T;
    if (method === "POST" && s[0] === "messages" && s[1] === "thread" && s[2] === "read")       return (await db.markThreadRead(body?.thread_type, body?.peer_id, body?.tontine_id)) as T;
    if (method === "POST" && s[0] === "messages")                                               return (await db.sendMessage(body)) as T;
    if (method === "PATCH"&& s[0] === "messages" && s[1] && s[2] === "read")                   return (await db.markMessageRead(s[1])) as T;

    // ── Referral
    if (method === "GET"  && s[0] === "users" && s[1] === "me" && s[2] === "referral")         return (await db.getReferralInfo()) as T;

    // ── Forgot / Reset password (delegated to Supabase Auth)
    if (method === "POST" && s[0] === "auth" && s[1] === "forgot-password") {
      const email = normalizeEmail(body?.email ?? "");
      const { error } = await getSupabase().auth.resetPasswordForEmail(email);
      if (error) throw { status: 400, detail: error.message };
      return { detail: "Email de réinitialisation envoyé" } as T;
    }
    if (method === "POST" && s[0] === "auth" && s[1] === "reset-password") {
      const { error } = await getSupabase().auth.updateUser({ password: body?.new_password });
      if (error) throw { status: 400, detail: error.message };
      return { detail: "Mot de passe mis à jour" } as T;
    }

    // ── Reports & loans
    if (method === "GET"  && s[0] === "reports-b64" && s[1])                              return (await db.getReportHtml(s[1] as "identity" | "trust-score" | "savings")) as T;
    if (method === "GET"  && s[0] === "reports" && s[1] === "certified" && s[2])
      return (await db.getCertifiedReport(s[2] as "identity" | "trust-score" | "savings")) as T;
    if (method === "GET"  && s[0] === "certificates" && s[1] === "purchases")
      return (await db.listCertificatePurchases()) as T;
    if (method === "POST" && s[0] === "certificates" && s[1] === "send-email")
      return (await db.sendCertificateEmail(body?.kind, body?.email, body?.payment_id)) as T;
    if (method === "POST" && s[0] === "loans" && s[1] === "apply")                       return (await db.submitLoanApplication(body)) as T;
    if (method === "GET"  && s[0] === "loans" && s[1] === "applications")                  return (await db.getLoanApplications()) as T;

    // ── P3: Instant credit
    if (method === "GET"  && s[0] === "instant-credit" && s[1] === "eligibility")         return (await db.getInstantCreditEligibility()) as T;
    if (method === "GET"  && s[0] === "instant-credit" && s[1] === "loans")              return (await db.listInstantLoans()) as T;
    if (method === "GET"  && s[0] === "instant-credit" && s[1] === "active")              return (await db.getActiveInstantLoan()) as T;
    if (method === "POST" && s[0] === "instant-credit" && s[1] === "disburse")             return (await db.disburseInstantLoan(Number(body?.amount_xaf))) as T;
    if (method === "POST" && s[0] === "instant-credit" && s[1] === "repay")                return (await db.repayInstantLoan(String(body?.loan_id))) as T;

    // ── Subscriptions
    if (method === "GET"  && s[0] === "subscriptions" && s[1] === "plans")               return (await import("@/src/db/subscriptions").then(m => m.getActivePlans())) as T;
    if (method === "GET"  && s[0] === "subscriptions" && s[1] === "me")                  return (await import("@/src/db/subscriptions").then(m => m.getMyPlan())) as T;
    if (method === "POST" && s[0] === "subscriptions" && s[1] === "upgrade")             return (await import("@/src/db/subscriptions").then(m => m.subscribeToPlan(body?.plan_id, body?.payment_id))) as T;
    if (method === "POST" && s[0] === "subscriptions" && s[1] === "cancel")              return (await import("@/src/db/subscriptions").then(m => m.cancelSubscription())) as T;

    throw { status: 404, detail: `Route introuvable: ${method} /${s.join("/")}` };

  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e?.status ?? 500, e?.detail ?? e?.message ?? "Erreur inattendue", {
      redirect_to: e?.redirect_to,
      payment_required: e?.payment_required,
    });
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
  const n = Number(amount);
  if (!Number.isFinite(n)) return `0 ${currency}`;
  return `${Math.round(n).toLocaleString("fr-FR")} ${currency}`;
}
