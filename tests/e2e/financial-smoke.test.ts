/**
 * E2E smoke tests — require Supabase test credentials in env.
 * Run: npm run test:e2e
 *
 * Required env:
 *   E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_TEST_EMAIL, E2E_TEST_PASSWORD
 */
import { describe, expect, it, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.E2E_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.E2E_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

const canRun = !!(url && anon && email && password);

describe.skipIf(!canRun)("E2E financial smoke", () => {
  let sb: SupabaseClient;
  let userId: string;

  beforeAll(async () => {
    sb = createClient(url!, anon!);
    const { data, error } = await sb.auth.signInWithPassword({ email: email!, password: password! });
    if (error) throw error;
    userId = data.user!.id;
  });

  it("auth — session active", async () => {
    const { data } = await sb.auth.getSession();
    expect(data.session?.user.id).toBe(userId);
  });

  it("wallet — read balance", async () => {
    const { data, error } = await sb.from("wallets").select("balance_xaf").eq("user_id", userId).maybeSingle();
    expect(error).toBeNull();
    expect(data?.balance_xaf).toBeDefined();
  });

  it("payments — initiate sandbox topup record", async () => {
    const paymentId = crypto.randomUUID();
    const meta = JSON.stringify({ kind: "wallet_topup", amount_xaf: 1000, provider: "mtn" });
    const { error } = await sb.from("payments").insert({
      id: paymentId,
      user_id: userId,
      amount: 1000,
      currency: "XAF",
      direction: "out",
      description: meta,
      status: "pending_cinetpay",
    });
    expect(error).toBeNull();

    const { data: row } = await sb.from("payments").select("status").eq("id", paymentId).single();
    expect(row?.status).toBe("pending_cinetpay");

    await sb.from("payments").delete().eq("id", paymentId);
  });

  it("withdraw — RPC rejects zero amount", async () => {
    const { error } = await sb.rpc("wallet_withdraw", {
      p_amount: 0,
      p_currency: "XAF",
      p_provider: "MTN MoMo",
      p_phone: "+237600000000",
      p_amount_xaf: 0,
    });
    expect(error).not.toBeNull();
  });
});

describe.skipIf(canRun)("E2E financial smoke (skipped)", () => {
  it("needs E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_TEST_EMAIL, E2E_TEST_PASSWORD", () => {
    expect(true).toBe(true);
  });
});
