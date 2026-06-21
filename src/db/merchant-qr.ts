import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";

export interface MerchantProfile {
  id: string;
  user_id: string;
  business_name: string;
  category: string;
  qr_payload: string;
  total_received_xaf: number;
  transactions_count: number;
  is_active: boolean;
  created_at: string;
}

export const MERCHANT_CATEGORIES = [
  "Alimentation", "Restaurant", "Transport", "Santé", "Mode & Beauté",
  "Électronique", "Services", "Éducation", "Agriculture", "Autre",
];

export async function getMerchantProfile(): Promise<MerchantProfile | null> {
  const me = await uid();
  const { data } = await getSupabase()
    .from("merchant_profiles")
    .select("*")
    .eq("user_id", me)
    .maybeSingle();
  return data ? mapMerchant(data) : null;
}

export async function createMerchantProfile(params: {
  business_name: string;
  category: string;
}): Promise<MerchantProfile> {
  const me = await uid();
  const sb = getSupabase();

  const existing = await getMerchantProfile();
  if (existing) throw new Error("Vous avez déjà un profil marchand.");

  const qrPayload = JSON.stringify({
    type: "hodix_merchant",
    user_id: me,
    name: params.business_name.trim(),
    category: params.category,
    v: 1,
  });

  const { data, error } = await sb.from("merchant_profiles").insert({
    user_id: me,
    business_name: params.business_name.trim(),
    category: params.category,
    qr_payload: qrPayload,
    is_active: true,
    total_received_xaf: 0,
    transactions_count: 0,
  }).select("*").single();
  throwSb(error);
  return mapMerchant(data);
}

export async function updateMerchantProfile(id: string, params: Partial<{ business_name: string; category: string; is_active: boolean }>): Promise<void> {
  const me = await uid();
  const { error } = await getSupabase()
    .from("merchant_profiles")
    .update(params)
    .eq("id", id)
    .eq("user_id", me);
  throwSb(error);
}

export async function getMerchantTransactions(limit = 30): Promise<Array<{
  id: string; payer_name: string; amount: number; created_at: string;
}>> {
  const me = await uid();
  const { data } = await getSupabase()
    .from("merchant_transactions")
    .select("id, amount, created_at, profiles!payer_id(full_name)")
    .eq("merchant_user_id", me)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((t: any) => ({
    id: t.id,
    payer_name: t.profiles?.full_name ?? "Client",
    amount: Number(t.amount),
    created_at: t.created_at,
  }));
}

export async function payMerchantFromQR(qrPayload: string, amount: number, note?: string): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Montant invalide.");
  const me = await uid();

  let parsed: { user_id?: string; name?: string; type?: string };
  try { parsed = JSON.parse(qrPayload); } catch { throw new Error("QR invalide."); }
  if (parsed.type !== "hodix_merchant" || !parsed.user_id) throw new Error("Ce QR n'est pas un QR marchand HODIX.");
  if (parsed.user_id === me) throw new Error("Vous ne pouvez pas vous payer vous-même.");

  const sb = getSupabase();
  const { error } = await sb.rpc("wallet_transfer", {
    p_recipient: parsed.user_id,
    p_amount: amount,
    p_currency: "XAF",
    p_amount_xaf: amount,
    p_note: note ?? `Paiement chez ${parsed.name ?? "marchand"}`,
  });
  if (error) {
    const msg = error.message.includes("insufficient") || error.message.includes("balance")
      ? "Solde insuffisant."
      : error.message;
    throw new Error(msg);
  }

  await sb.from("merchant_transactions").insert({
    merchant_user_id: parsed.user_id,
    payer_id: me,
    amount,
    note: note ?? null,
  });

  const { data: mp } = await sb.from("merchant_profiles").select("total_received_xaf, transactions_count").eq("user_id", parsed.user_id).single();
  await sb.from("merchant_profiles").update({
    total_received_xaf: Number(mp?.total_received_xaf ?? 0) + amount,
    transactions_count: Number(mp?.transactions_count ?? 0) + 1,
  }).eq("user_id", parsed.user_id);
}

function mapMerchant(d: any): MerchantProfile {
  return {
    id: d.id,
    user_id: d.user_id,
    business_name: d.business_name,
    category: d.category,
    qr_payload: d.qr_payload,
    total_received_xaf: Number(d.total_received_xaf ?? 0),
    transactions_count: Number(d.transactions_count ?? 0),
    is_active: !!d.is_active,
    created_at: d.created_at,
  };
}
