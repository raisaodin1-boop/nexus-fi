import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";

export interface VirtualCard {
  id: string;
  user_id: string;
  masked_number: string;
  full_number: string;
  expiry: string;
  cvv: string;
  holder_name: string;
  balance_limit_xaf: number;
  is_active: boolean;
  created_at: string;
}

function generateLuhn16(): string {
  const digits = Array.from({ length: 15 }, () => Math.floor(Math.random() * 10));
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits[i];
    if ((digits.length - 1 - i) % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return "4" + digits.slice(1).join("") + check;
}

function generateExpiry(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 3);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}

function generateCVV(): string {
  return String(Math.floor(100 + Math.random() * 900));
}

export async function getVirtualCard(): Promise<VirtualCard | null> {
  const me = await uid();
  const { data } = await getSupabase()
    .from("virtual_cards")
    .select("*")
    .eq("user_id", me)
    .maybeSingle();
  return data ? mapCard(data) : null;
}

export async function createVirtualCard(holderName: string, limitXaf = 500_000): Promise<VirtualCard> {
  const me = await uid();
  const sb = getSupabase();

  const existing = await getVirtualCard();
  if (existing) throw new Error("Vous avez déjà une carte virtuelle HODIX.");

  const number = generateLuhn16();
  const { data, error } = await sb.from("virtual_cards").insert({
    user_id: me,
    card_number: number,
    expiry: generateExpiry(),
    cvv: generateCVV(),
    holder_name: holderName.toUpperCase(),
    balance_limit_xaf: limitXaf,
    is_active: true,
  }).select("*").single();
  throwSb(error);
  return mapCard(data);
}

export async function toggleVirtualCard(id: string, active: boolean): Promise<void> {
  const me = await uid();
  const { error } = await getSupabase()
    .from("virtual_cards")
    .update({ is_active: active })
    .eq("id", id)
    .eq("user_id", me);
  throwSb(error);
}

export async function deleteVirtualCard(id: string): Promise<void> {
  const me = await uid();
  const { error } = await getSupabase()
    .from("virtual_cards")
    .delete()
    .eq("id", id)
    .eq("user_id", me);
  throwSb(error);
}

function mapCard(d: any): VirtualCard {
  const num: string = d.card_number ?? "";
  return {
    id: d.id,
    user_id: d.user_id,
    full_number: num,
    masked_number: num.slice(0, 4) + " •••• •••• " + num.slice(-4),
    expiry: d.expiry,
    cvv: d.cvv,
    holder_name: d.holder_name,
    balance_limit_xaf: Number(d.balance_limit_xaf ?? 0),
    is_active: !!d.is_active,
    created_at: d.created_at,
  };
}
