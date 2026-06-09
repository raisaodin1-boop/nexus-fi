/**
 * HODIX — Supabase data layer
 * This file re-exports all modules from src/db/ for backwards compatibility.
 * Source of truth: src/db/*.ts
 */

export * from "@/src/db/index";

// Wallet operations (delegated to wallet-db.ts)
import * as walletDb from "@/src/wallet-db";
import { getRates } from "@/src/exchange-rates";

export async function getWallet() { return walletDb.getWallet(); }
export async function getWalletTransactions() { return walletDb.getWalletTransactions(); }
export async function getExchangeRates() { return getRates(); }
export async function topupWallet(body: any) { return walletDb.topupFromMobileMoney(body); }
export async function withdrawWallet(body: any) { return walletDb.withdrawToMobileMoney(body); }
export async function transferWallet(body: any) { return walletDb.transferToMember(body); }
export async function payContributionWallet(body: any) {
  return walletDb.payContributionFromWallet(body?.tontine_id, Number(body?.amount), Number(body?.cycle));
}
