import { getSupabase } from "@/src/supabase";

export function paynoteMtnEnabled(): boolean {
  return true;
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

  if (error) {
    let detail = error.message ?? "Erreur Paynote MTN.";
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const parsed = await ctx.json() as { error?: string };
        if (parsed?.error) detail = parsed.error;
      } catch { /* ignore */ }
    }
    throw { status: 502, detail };
  }
  if (!data?.ok) throw { status: 502, detail: data?.error ?? "Erreur Paynote MTN." };
  return data as T;
}
