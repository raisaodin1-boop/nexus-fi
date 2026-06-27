/**
 * HODIX — Supabase data layer
 * This file re-exports all modules from src/db/ for backwards compatibility.
 * Source of truth: src/db/*.ts
 */

export * from "./db/profiles";
export * from "./db/tontines";
export * from "./db/groups";
export * from "./db/savings";
export * from "./db/identity";
export * from "./db/admin";
export * from "./db/notifications";
export * from "./db/messages";
export * from "./db/misc";
export * from "./db/payments";
export * from "./db/kyc";
export * from "./db/reports";
export * from "./db/loans";
export * from "./db/extras";
export * from "./db/wallet-security";
export * from "./db/compliance";
export * from "./db/collective-goal";
export * from "./db/tontine-guarantor";
export * from "./db/momo-roundup";
export * from "./db/instant-loan";
export * from "./db/emoney-license";
export * from "./db/verify";
export { invalidateCache } from "./db/helpers";

// Wallet operations (delegated to wallet-db.ts)
import * as walletDb from "@/src/wallet-db";
import { getRates } from "@/src/exchange-rates";

export async function getWallet() { return walletDb.getWallet(); }
export async function getWalletTransactions() { return walletDb.getWalletTransactions(); }
export async function getWalletTransaction(id: string) { return walletDb.getWalletTransaction(id); }
export async function getExchangeRates() { return getRates(); }
export async function topupWallet(body: any) { return walletDb.topupFromMobileMoney(body); }
export async function withdrawWallet(body: any) { return walletDb.withdrawToMobileMoney(body); }
export async function transferWallet(body: any) { return walletDb.transferToMember(body); }
export async function payContributionWallet(body: any) {
  return walletDb.payContributionFromWallet(body?.tontine_id, Number(body?.amount), Number(body?.cycle));
}
