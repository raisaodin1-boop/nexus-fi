import { getSupabase } from "@/src/supabase";
import { publicEnv } from "@/src/public-env";

export function paynoteMtnEnabled(): boolean {
  return publicEnv("EXPO_PUBLIC_PAYNOTE_MTN_ENABLED") === "true";
}

export function normalizeMtnMsisdn(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("237") && digits.length > 9) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export async function invokePaynoteMtn<T = unknown>(
  action: "initiate" | "status",
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke("paynote-mtn", {
    body: { action, ...body },
  });
  if (error) throw { status: 502, detail: error.message ?? "Erreur Paynote MTN." };
  if (!data?.ok) throw { status: 502, detail: data?.error ?? "Erreur Paynote MTN." };
  return data as T;
}
