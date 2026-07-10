/**
 * Wallet DB layer — Supabase tables: wallets, wallet_transactions.
 *
 * Schema + RLS + atomic RPC functions (wallet_topup, wallet_withdraw,
 * wallet_transfer, wallet_pay_contribution) live in
 * supabase/migrations/20260610_security_hardening.sql.
 *
 * Balances move ONLY through the server-side functions: there are no
 * UPDATE policies on wallets, so the client cannot write balances.
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
  balance_xof: number;
  balance_ngn: number;
  balance_ghs: number;
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
    balance_xof: Number(data.balance_xof ?? 0),
    balance_ngn: Number(data.balance_ngn ?? 0),
    balance_ghs: Number(data.balance_ghs ?? 0),
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
  counterpart_id?: string | null;
  note: string | null;
  status: string;
  mobile_money_provider: string | null;
  mobile_money_number: string | null;
  created_at: string;
  tontine_id?: string | null;
  reference?: string | null;
  balance_after?: number | null;
}

const TX_FIELDS =
  "id,type,amount,currency,amount_xaf,counterpart_name,counterpart_id,note,status,mobile_money_provider,mobile_money_number,created_at,tontine_id,reference,balance_after";

function mapTx(r: Record<string, unknown>): WalletTx {
  return {
    ...r,
    amount: Number(r.amount),
    amount_xaf: Number(r.amount_xaf),
  } as WalletTx;
}

export async function getWalletTransactions(limit = 50): Promise<WalletTx[]> {
  const me = await currentUserId();
  const { data } = await getSupabase()
    .from("wallet_transactions")
    .select(TX_FIELDS)
    .eq("user_id", me)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapTx);
}

export async function getWalletTransaction(id: string): Promise<WalletTx> {
  const me = await currentUserId();
  const { data, error } = await getSupabase()
    .from("wallet_transactions")
    .select(TX_FIELDS)
    .eq("id", id)
    .eq("user_id", me)
    .single();
  if (error || !data) throw new Error("Transaction introuvable.");
  return mapTx(data);
}

// ─── Top-up from Mobile Money ─────────────────────────────────────────────────

export type MobileMoneyProvider = "MTN MoMo" | "Orange Money" | "Moov Money" | "Wave";

export interface TopupPayload {
  amount: number;
  currency: Currency;
  provider: MobileMoneyProvider;
  phone: string;
}

export async function topupFromMobileMoney(_payload: TopupPayload): Promise<WalletTx> {
  throw new Error("Recharge wallet via MTN MoMo (page de paiement Paynote) uniquement.");
}

// ─── Withdrawal to Mobile Money ───────────────────────────────────────────────

export interface WithdrawPayload {
  amount: number;
  currency: Currency;
  provider: MobileMoneyProvider;
  phone: string;
}

export async function withdrawToMobileMoney(payload: WithdrawPayload): Promise<WalletTx> {
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) throw new Error("Montant invalide.");

  const rates = await getRates();
  const amountXaf = convert(payload.amount, payload.currency, "XAF", rates);

  const { data: tx, error } = await getSupabase().rpc("wallet_withdraw", {
    p_amount: payload.amount,
    p_currency: payload.currency,
    p_provider: payload.provider,
    p_phone: payload.phone,
    p_amount_xaf: amountXaf,
  });
  if (error) {
    const msg = error.message.includes("insufficient") || error.message.includes("balance")
      ? "Solde insuffisant pour effectuer ce retrait."
      : error.message.includes("limit") ? "Limite de retrait journalière atteinte."
      : error.message;
    throw new Error(msg);
  }

  const debited: WalletTx = { ...tx, amount: Number(tx.amount), amount_xaf: Number(tx.amount_xaf) };

  try {
    const { data, error: payoutErr } = await getSupabase().functions.invoke("cinetpay-payout", {
      body: { wallet_tx_id: debited.id },
    });
    if (payoutErr) throw new Error(payoutErr.message ?? "Échec du virement Mobile Money.");
    if (!data?.ok) throw new Error(data?.error ?? "Échec du virement Mobile Money.");
    const paid = data.tx ?? debited;
    return { ...paid, amount: Number(paid.amount), amount_xaf: Number(paid.amount_xaf) };
  } catch (e: any) {
    throw new Error(e?.message ?? "Retrait débité mais virement Mobile Money en échec — wallet recrédité.");
  }
}

// ─── Peer-to-peer transfer ────────────────────────────────────────────────────

export interface TransferPayload {
  to_phone_or_email?: string;
  to_user_id?: string;
  amount: number;
  currency: Currency;
  note?: string;
}

export async function transferToMember(payload: TransferPayload): Promise<WalletTx> {
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) throw new Error("Montant invalide.");

  const me = await currentUserId();
  const sb = getSupabase();
  const rates = await getRates();
  const amountXaf = convert(payload.amount, payload.currency, "XAF", rates);

  let recipient: { id: string; full_name: string | null } | null = null;

  if (payload.to_user_id) {
    // UUID path (QR / deep link): wallet_transfer validates the recipient server-side.
    // Client RLS may hide other profiles, so do not require a visible profiles row here.
    recipient = { id: payload.to_user_id, full_name: null };
  } else if (payload.to_phone_or_email) {
    const search = payload.to_phone_or_email.trim();
    const isEmail = search.includes("@");
    // SECURITY DEFINER RPCs — required after profiles RLS was tightened to own/shared-group only.
    // Recipient does not need to be online; only to have a HODIX account.
    const { data: rows, error: lookupErr } = isEmail
      ? await sb.rpc("lookup_profile_by_email", { p_email: search.toLowerCase() })
      : await sb.rpc("lookup_profile_by_phone", { p_phone: search.replace(/\s+/g, "") });
    if (lookupErr) throw new Error(lookupErr.message);
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    const row = (list[0] as { id: string; full_name: string } | undefined) ?? null;
    recipient = row;
  } else {
    throw new Error("Destinataire requis.");
  }

  if (!recipient) {
    throw new Error("Membre introuvable. Vérifiez l'email ou le téléphone — le destinataire n'a pas besoin d'être connecté.");
  }
  if (recipient.id === me) throw new Error("Impossible de vous transférer à vous-même.");

  // Debit + credit + both transaction records happen in ONE server-side
  // transaction (RPC) — all-or-nothing, balance-guarded.
  const { data: tx, error } = await sb.rpc("wallet_transfer", {
    p_recipient: recipient.id,
    p_amount: payload.amount,
    p_currency: payload.currency,
    p_amount_xaf: amountXaf,
    p_note: payload.note ?? null,
  });
  if (error) {
    const msg = error.message.includes("insufficient") || error.message.includes("balance")
      ? "Solde insuffisant pour ce transfert."
      : error.message.includes("limit") ? "Limite de transfert atteinte."
      : error.message;
    throw new Error(msg);
  }

  return { ...tx, amount: Number(tx.amount), amount_xaf: Number(tx.amount_xaf) };
}

// ─── Pay tontine contribution from wallet ─────────────────────────────────────

export async function payContributionFromWallet(tontineId: string, amount: number, cycle: number): Promise<WalletTx> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Montant invalide.");

  const sb = getSupabase();

  // Atomic server-side: debit + contribution record + wallet transaction
  // in a single DB transaction.
  const { data: tx, error } = await sb.rpc("wallet_pay_contribution", {
    p_tontine: tontineId,
    p_amount: amount,
    p_cycle: cycle,
  });
  if (error) {
    const msg = error.message.includes("insufficient") || error.message.includes("balance")
      ? "Solde insuffisant pour payer cette cotisation."
      : error.message.includes("already") ? "Cotisation déjà payée pour ce cycle."
      : error.message;
    throw new Error(msg);
  }

  return { ...tx, amount: Number(tx.amount), amount_xaf: Number(tx.amount_xaf) };
}
