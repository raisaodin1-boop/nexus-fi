/**
 * Wallet DB layer — Supabase tables: wallets, wallet_transactions.
 *
 * Required migration (run once in Supabase SQL editor):
 * ─────────────────────────────────────────────────────
 * create table wallets (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid references auth.users not null unique,
 *   balance_xaf numeric(15,2) default 0 not null check (balance_xaf >= 0),
 *   balance_usd numeric(15,4) default 0 not null check (balance_usd >= 0),
 *   balance_eur numeric(15,4) default 0 not null check (balance_eur >= 0),
 *   created_at timestamptz default now(),
 *   updated_at timestamptz default now()
 * );
 * alter table wallets enable row level security;
 * create policy "own wallet" on wallets for all using (auth.uid() = user_id);
 *
 * create table wallet_transactions (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid references auth.users not null,
 *   counterpart_id uuid references auth.users,
 *   counterpart_name text,
 *   type text not null,  -- topup|withdraw|transfer_in|transfer_out|contribution
 *   amount numeric(15,2) not null,
 *   currency text not null default 'XAF',
 *   amount_xaf numeric(15,2) not null,
 *   reference text,
 *   note text,
 *   status text not null default 'completed',
 *   mobile_money_provider text,
 *   mobile_money_number text,
 *   created_at timestamptz default now()
 * );
 * alter table wallet_transactions enable row level security;
 * create policy "own txs" on wallet_transactions for all using (auth.uid() = user_id);
 * create index on wallet_transactions (user_id, created_at desc);
 */

import { getSupabase } from "@/src/supabase";
import { getRates, convert, type Currency } from "@/src/exchange-rates";

async function currentUserId(): Promise<string> {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error("Non authentifié.");
  return user.id;
}

// ─── Wallet balance ───────────────────────────────────────────────────────────

export interface WalletBalance {
  balance_xaf: number;
  balance_usd: number;
  balance_eur: number;
  user_id: string;
}

export async function getWallet(): Promise<WalletBalance> {
  const me = await currentUserId();
  const sb = getSupabase();

  let { data } = await sb.from("wallets").select("*").eq("user_id", me).maybeSingle();

  if (!data) {
    // Auto-create wallet on first access
    const ins = await sb.from("wallets").insert({ user_id: me }).select("*").single();
    if (ins.error) throw new Error(ins.error.message);
    data = ins.data;
  }

  return {
    balance_xaf: Number(data.balance_xaf ?? 0),
    balance_usd: Number(data.balance_usd ?? 0),
    balance_eur: Number(data.balance_eur ?? 0),
    user_id: me,
  };
}

// ─── Transaction history ──────────────────────────────────────────────────────

export interface WalletTx {
  id: string;
  type: string;
  amount: number;
  currency: string;
  amount_xaf: number;
  counterpart_name: string | null;
  note: string | null;
  status: string;
  mobile_money_provider: string | null;
  mobile_money_number: string | null;
  created_at: string;
}

export async function getWalletTransactions(limit = 50): Promise<WalletTx[]> {
  const me = await currentUserId();
  const { data } = await getSupabase()
    .from("wallet_transactions")
    .select("id,type,amount,currency,amount_xaf,counterpart_name,note,status,mobile_money_provider,mobile_money_number,created_at")
    .eq("user_id", me)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(r => ({
    ...r,
    amount: Number(r.amount),
    amount_xaf: Number(r.amount_xaf),
  }));
}

// ─── Top-up from Mobile Money ─────────────────────────────────────────────────

export type MobileMoneyProvider = "MTN MoMo" | "Orange Money" | "Moov Money" | "Wave";

export interface TopupPayload {
  amount: number;
  currency: Currency;
  provider: MobileMoneyProvider;
  phone: string;
}

export async function topupFromMobileMoney(payload: TopupPayload): Promise<WalletTx> {
  if (payload.amount <= 0) throw new Error("Montant invalide.");
  if (!/^\+?[\d\s\-]{8,15}$/.test(payload.phone)) throw new Error("Numéro de téléphone invalide.");

  const me = await currentUserId();
  const rates = await getRates();
  const amountXaf = convert(payload.amount, payload.currency, "XAF", rates);
  const sb = getSupabase();

  // Ensure wallet exists
  await getWallet();

  // In production: call Mobile Money API here and await confirmation.
  // For now we simulate immediate confirmation (sandbox mode).
  const ref = `TUP-${Date.now().toString(36).toUpperCase()}`;

  // Credit wallet
  const col = payload.currency === "XAF" ? "balance_xaf"
    : payload.currency === "EUR" ? "balance_eur" : "balance_usd";

  const { data: wallet } = await sb.from("wallets").select(col).eq("user_id", me).single();
  const current = Number((wallet as any)?.[col] ?? 0);

  const { error: updateErr } = await sb.from("wallets")
    .update({ [col]: current + payload.amount, updated_at: new Date().toISOString() })
    .eq("user_id", me);
  if (updateErr) throw new Error(updateErr.message);

  // Record transaction
  const { data: tx, error: txErr } = await sb.from("wallet_transactions").insert({
    user_id: me,
    type: "topup",
    amount: payload.amount,
    currency: payload.currency,
    amount_xaf: amountXaf,
    reference: ref,
    status: "completed",
    mobile_money_provider: payload.provider,
    mobile_money_number: payload.phone,
    note: `Recharge via ${payload.provider}`,
  }).select("*").single();
  if (txErr) throw new Error(txErr.message);

  return { ...tx, amount: Number(tx.amount), amount_xaf: Number(tx.amount_xaf) };
}

// ─── Withdrawal to Mobile Money ───────────────────────────────────────────────

export interface WithdrawPayload {
  amount: number;
  currency: Currency;
  provider: MobileMoneyProvider;
  phone: string;
}

export async function withdrawToMobileMoney(payload: WithdrawPayload): Promise<WalletTx> {
  if (payload.amount <= 0) throw new Error("Montant invalide.");

  const me = await currentUserId();
  const rates = await getRates();
  const amountXaf = convert(payload.amount, payload.currency, "XAF", rates);
  const sb = getSupabase();

  // Check balance
  const wallet = await getWallet();
  const currentBal = payload.currency === "XAF" ? wallet.balance_xaf
    : payload.currency === "EUR" ? wallet.balance_eur : wallet.balance_usd;

  if (currentBal < payload.amount) throw new Error("Solde insuffisant.");

  const col = payload.currency === "XAF" ? "balance_xaf"
    : payload.currency === "EUR" ? "balance_eur" : "balance_usd";

  const ref = `WDR-${Date.now().toString(36).toUpperCase()}`;

  const { error: updateErr } = await sb.from("wallets")
    .update({ [col]: currentBal - payload.amount, updated_at: new Date().toISOString() })
    .eq("user_id", me);
  if (updateErr) throw new Error(updateErr.message);

  const { data: tx, error: txErr } = await sb.from("wallet_transactions").insert({
    user_id: me,
    type: "withdraw",
    amount: payload.amount,
    currency: payload.currency,
    amount_xaf: amountXaf,
    reference: ref,
    status: "completed",
    mobile_money_provider: payload.provider,
    mobile_money_number: payload.phone,
    note: `Retrait vers ${payload.provider}`,
  }).select("*").single();
  if (txErr) throw new Error(txErr.message);

  return { ...tx, amount: Number(tx.amount), amount_xaf: Number(tx.amount_xaf) };
}

// ─── Peer-to-peer transfer ────────────────────────────────────────────────────

export interface TransferPayload {
  to_phone_or_email: string;   // lookup by phone or email
  amount: number;
  currency: Currency;
  note?: string;
}

export async function transferToMember(payload: TransferPayload): Promise<WalletTx> {
  if (payload.amount <= 0) throw new Error("Montant invalide.");

  const me = await currentUserId();
  const sb = getSupabase();
  const rates = await getRates();
  const amountXaf = convert(payload.amount, payload.currency, "XAF", rates);

  // Resolve recipient
  const search = payload.to_phone_or_email.trim();
  const isEmail = search.includes("@");
  const profileQuery = isEmail
    ? sb.from("profiles").select("id, full_name").eq("email", search).maybeSingle()
    : sb.from("profiles").select("id, full_name").eq("phone", search).maybeSingle();
  const { data: recipient } = await profileQuery;
  if (!recipient) throw new Error("Membre introuvable. Vérifiez l'email ou le téléphone.");
  if (recipient.id === me) throw new Error("Impossible de vous transférer à vous-même.");

  // Check sender balance
  const wallet = await getWallet();
  const col = payload.currency === "XAF" ? "balance_xaf"
    : payload.currency === "EUR" ? "balance_eur" : "balance_usd";
  const senderBal = payload.currency === "XAF" ? wallet.balance_xaf
    : payload.currency === "EUR" ? wallet.balance_eur : wallet.balance_usd;
  if (senderBal < payload.amount) throw new Error("Solde insuffisant.");

  // Ensure recipient has a wallet
  const { data: recWallet } = await sb.from("wallets").select(col).eq("user_id", recipient.id).maybeSingle();
  if (!recWallet) {
    await sb.from("wallets").insert({ user_id: recipient.id });
  }
  const recBal = Number((recWallet as any)?.[col] ?? 0);

  // Debit sender
  await sb.from("wallets").update({ [col]: senderBal - payload.amount, updated_at: new Date().toISOString() }).eq("user_id", me);
  // Credit recipient
  await sb.from("wallets").update({ [col]: recBal + payload.amount, updated_at: new Date().toISOString() }).eq("user_id", recipient.id);

  const ref = `TRF-${Date.now().toString(36).toUpperCase()}`;
  const me_profile = await sb.from("profiles").select("full_name").eq("id", me).single();
  const senderName = me_profile.data?.full_name ?? "Hodix User";

  // Sender record (outgoing)
  const { data: tx, error: txErr } = await sb.from("wallet_transactions").insert({
    user_id: me,
    counterpart_id: recipient.id,
    counterpart_name: recipient.full_name,
    type: "transfer_out",
    amount: payload.amount,
    currency: payload.currency,
    amount_xaf: amountXaf,
    reference: ref,
    note: payload.note ?? null,
    status: "completed",
  }).select("*").single();
  if (txErr) throw new Error(txErr.message);

  // Recipient record (incoming)
  await sb.from("wallet_transactions").insert({
    user_id: recipient.id,
    counterpart_id: me,
    counterpart_name: senderName,
    type: "transfer_in",
    amount: payload.amount,
    currency: payload.currency,
    amount_xaf: amountXaf,
    reference: ref,
    note: payload.note ?? null,
    status: "completed",
  });

  return { ...tx, amount: Number(tx.amount), amount_xaf: Number(tx.amount_xaf) };
}

// ─── Pay tontine contribution from wallet ─────────────────────────────────────

export async function payContributionFromWallet(tontineId: string, amount: number, cycle: number): Promise<WalletTx> {
  const me = await currentUserId();
  const sb = getSupabase();

  const wallet = await getWallet();
  if (wallet.balance_xaf < amount) throw new Error("Solde XAF insuffisant.");

  // Debit wallet
  await sb.from("wallets")
    .update({ balance_xaf: wallet.balance_xaf - amount, updated_at: new Date().toISOString() })
    .eq("user_id", me);

  // Record tontine contribution
  const { error: contribErr } = await sb.from("tontine_contributions").insert({
    tontine_id: tontineId,
    user_id: me,
    amount,
    cycle,
    paid_at: new Date().toISOString(),
    payment_method: "wallet",
  });
  if (contribErr) throw new Error(contribErr.message);

  const ref = `CTB-${Date.now().toString(36).toUpperCase()}`;
  const { data: tontine } = await sb.from("tontines").select("name").eq("id", tontineId).single();

  const { data: tx, error: txErr } = await sb.from("wallet_transactions").insert({
    user_id: me,
    type: "contribution",
    amount,
    currency: "XAF",
    amount_xaf: amount,
    reference: ref,
    note: `Cotisation tontine${tontine?.name ? ` — ${tontine.name}` : ""} (cycle ${cycle})`,
    status: "completed",
  }).select("*").single();
  if (txErr) throw new Error(txErr.message);

  return { ...tx, amount: Number(tx.amount), amount_xaf: Number(tx.amount_xaf) };
}
