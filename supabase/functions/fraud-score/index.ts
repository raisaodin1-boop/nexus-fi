/**
 * HODIX — Real-time fraud scoring (heuristic ML model v1).
 * Invoked before wallet outbound transactions.
 *
 * Features: velocity, amount anomaly, device, time-of-day, recipient novelty.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Risk = "low" | "medium" | "high" | "critical";

interface ScoreResult {
  ok: boolean;
  score: number;
  risk: Risk;
  flags: string[];
  should_block: boolean;
  should_freeze: boolean;
  model_version: string;
}

function classify(score: number, flags: string[]): Pick<ScoreResult, "risk" | "should_block" | "should_freeze"> {
  const critical = flags.includes("blacklisted_pattern") || (flags.includes("high_frequency") && flags.includes("large_amount"));
  if (critical || score >= 85) return { risk: "critical", should_block: true, should_freeze: true };
  if (score >= 65) return { risk: "high", should_block: true, should_freeze: false };
  if (score >= 40) return { risk: "medium", should_block: false, should_freeze: false };
  return { risk: "low", should_block: false, should_freeze: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ ok: false, error: "Non authentifié." }, 401);

  const body = await req.json().catch(() => ({}));
  const amountXaf = Number(body.amount_xaf ?? 0);
  const txType = String(body.tx_type ?? "withdraw");
  const recipientPhone = String(body.recipient_phone ?? "").trim();
  const deviceFp = String(body.device_fingerprint ?? "").trim();

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const flags: string[] = [];
  let score = 0;

  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [profileRes, hourlyTxRes, monthlyTxRes, deviceMatchRes] = await Promise.all([
    admin.from("profiles").select("wallet_frozen, is_blacklisted, trust_flags, device_fingerprint, kyc_status, created_at")
      .eq("id", user.id).single(),
    admin.from("wallet_transactions").select("id, amount_xaf")
      .eq("user_id", user.id).in("type", ["withdraw", "transfer_out"]).gte("created_at", oneHourAgo),
    admin.from("wallet_transactions").select("amount_xaf")
      .eq("user_id", user.id).in("type", ["withdraw", "transfer_out"]).gte("created_at", thirtyDaysAgo),
    recipientPhone
      ? admin.from("wallet_transactions").select("id").eq("user_id", user.id)
          .eq("mobile_money_number", recipientPhone).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const profile = profileRes.data;
  if (profile?.is_blacklisted || (profile?.trust_flags ?? []).includes("blacklisted")) {
    flags.push("blacklisted_pattern");
    score += 100;
  }
  if (profile?.wallet_frozen) {
    flags.push("wallet_frozen");
    score += 80;
  }

  const hourlyCount = hourlyTxRes.data?.length ?? 0;
  if (hourlyCount >= 3) { flags.push("high_frequency"); score += 35; }
  if (hourlyCount >= 5) score += 20;

  const monthlyAmounts = (monthlyTxRes.data ?? []).map((t: { amount_xaf: number }) => Number(t.amount_xaf));
  const avgMonthly = monthlyAmounts.length
    ? monthlyAmounts.reduce((a, b) => a + b, 0) / monthlyAmounts.length
    : 0;
  if (avgMonthly > 0 && amountXaf > avgMonthly * 3) { flags.push("unusual_amount"); score += 25; }
  if (amountXaf >= 300_000) { flags.push("large_amount"); score += 20; }

  if (deviceFp && profile?.device_fingerprint && profile.device_fingerprint !== deviceFp) {
    flags.push("new_device");
    score += 30;
  }

  const hour = new Date().getUTCHours();
  if (hour >= 1 && hour <= 5) { flags.push("off_hours"); score += 15; }

  if (recipientPhone && !deviceMatchRes.data) {
    flags.push("new_recipient");
    score += 15;
  }

  if (profile?.kyc_status !== "approved" && amountXaf >= 100_000) {
    flags.push("no_kyc_high_amount");
    score += 20;
  }

  const accountAgeDays = profile?.created_at
    ? (Date.now() - new Date(profile.created_at).getTime()) / 86400000
    : 0;
  if (accountAgeDays < 7 && amountXaf >= 50_000) {
    flags.push("young_account");
    score += 25;
  }

  score = Math.min(100, score);
  const classification = classify(score, flags);

  await admin.from("fraud_score_snapshots").insert({
    user_id: user.id,
    tx_type: txType,
    amount_xaf: amountXaf,
    score,
    risk: classification.risk,
    flags,
    model_version: "hodix-fraud-v1",
    metadata: { recipient_phone: recipientPhone || null, device_fp: deviceFp || null },
  });

  if (classification.should_freeze) {
    await admin.rpc("create_fraud_alert", {
      p_user_id: user.id,
      p_alert_type: "realtime_fraud_block",
      p_severity: "critical",
      p_amount_xaf: amountXaf,
      p_flags: flags,
      p_metadata: { score, tx_type: txType, model: "hodix-fraud-v1" },
    });
  }

  const result: ScoreResult = {
    ok: true,
    score,
    flags,
    model_version: "hodix-fraud-v1",
    ...classification,
  };

  return json(result);
});
