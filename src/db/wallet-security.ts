import { getSupabase } from "@/src/supabase";
import { uid } from "./helpers";

const LIMITS = {
  per_tx: 500_000,
  daily: 1_000_000,
  weekly: 2_500_000,
  new_recipient: 100_000,
  cooling_hours: 2,
};

export async function logSecurityEvent(userId: string, eventType: string, metadata: Record<string, any>) {
  try {
    await getSupabase().from("identity_events").insert({
      user_id: userId, event_type: `sec:${eventType}`, points_delta: 0, metadata,
    } as any);
  } catch {
    // best-effort audit log — never block the calling flow
  }
}

// PIN hashes live in the private wallet_security table (RLS: own row only),
// NOT in profiles which is readable by all authenticated users.
export async function setWalletPin(pinHash: string) {
  const me = await uid();
  const { error } = await getSupabase().from("wallet_security")
    .upsert({ user_id: me, pin_hash: pinHash, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await logSecurityEvent(me, "pin_set", {});
  return { ok: true };
}

export async function verifyWalletPin(pinHash: string): Promise<{ valid: boolean }> {
  const me = await uid();
  const { data } = await getSupabase().from("wallet_security").select("pin_hash").eq("user_id", me).maybeSingle();
  const valid = !!data?.pin_hash && data.pin_hash === pinHash;
  await logSecurityEvent(me, valid ? "pin_ok" : "pin_fail", {});
  return { valid };
}

export async function hasWalletPin(): Promise<boolean> {
  const me = await uid();
  const { data } = await getSupabase().from("wallet_security").select("pin_hash").eq("user_id", me).maybeSingle();
  return !!data?.pin_hash;
}

export interface OtpSendResult {
  expires_at: string;
  delivery: "sms" | "app";
  phone_masked?: string | null;
}

// OTP generation + verification are fully server-side (send-otp edge
// function): the code is hashed in otp_codes, sent by SMS via Twilio when
// configured, otherwise delivered as an in-app notification. The client
// never sees the code.
export async function generateTransactionOtp(): Promise<OtpSendResult> {
  const me = await uid();
  const { data, error } = await getSupabase().functions.invoke("send-otp", { body: { action: "send" } });
  if (error) throw new Error("Impossible d'envoyer le code. Réessayez.");
  if (!data?.ok) throw new Error(data?.error ?? "Impossible d'envoyer le code.");
  await logSecurityEvent(me, "otp_generated", { delivery: data.delivery });
  return { expires_at: data.expires_at, delivery: data.delivery, phone_masked: data.phone_masked ?? null };
}

export async function verifyTransactionOtp(inputCode: string): Promise<{ valid: boolean; reason?: string }> {
  const me = await uid();
  const { data, error } = await getSupabase().functions.invoke("send-otp", {
    body: { action: "verify", code: inputCode.trim() },
  });
  if (error) return { valid: false, reason: "Erreur de vérification. Réessayez." };
  await logSecurityEvent(me, data?.valid ? "otp_ok" : "otp_fail", {});
  return { valid: !!data?.valid, reason: data?.reason };
}

export async function checkTransactionLimits(amountXaf: number): Promise<{ allowed: boolean; reason?: string }> {
  const me = await uid();
  const sb = getSupabase();
  if (amountXaf > LIMITS.per_tx) return { allowed: false, reason: `Montant max par transaction : ${LIMITS.per_tx.toLocaleString()} XAF` };
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
  const [dayRes, weekRes] = await Promise.all([
    sb.from("wallet_transactions").select("amount_xaf").eq("user_id", me).in("type", ["withdraw", "transfer_out"]).gte("created_at", dayStart),
    sb.from("wallet_transactions").select("amount_xaf").eq("user_id", me).in("type", ["withdraw", "transfer_out"]).gte("created_at", weekStart),
  ]);
  const todayTotal = (dayRes.data ?? []).reduce((s: number, t: any) => s + Number(t.amount_xaf), 0);
  const weekTotal = (weekRes.data ?? []).reduce((s: number, t: any) => s + Number(t.amount_xaf), 0);
  if (todayTotal + amountXaf > LIMITS.daily) return { allowed: false, reason: `Plafond journalier atteint (${LIMITS.daily.toLocaleString()} XAF/jour)` };
  if (weekTotal + amountXaf > LIMITS.weekly) return { allowed: false, reason: `Plafond hebdomadaire atteint (${LIMITS.weekly.toLocaleString()} XAF/semaine)` };
  return { allowed: true };
}

export async function checkCoolingPeriod(recipientPhone: string): Promise<{ allowed: boolean; wait_minutes?: number }> {
  const me = await uid();
  const { data } = await getSupabase().from("wallet_transactions")
    .select("created_at").eq("user_id", me).eq("type", "transfer_out").eq("mobile_money_number", recipientPhone).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!data) {
    const coolMs = LIMITS.cooling_hours * 3_600_000;
    const { data: regEvent } = await getSupabase().from("identity_events")
      .select("created_at").eq("user_id", me).eq("event_type", `new_recipient:${recipientPhone}`).maybeSingle();
    if (!regEvent) {
      await getSupabase().from("identity_events").insert({ user_id: me, event_type: `new_recipient:${recipientPhone}`, points_delta: 0, metadata: { phone: recipientPhone, registered_at: new Date().toISOString() } } as any);
      return { allowed: false, wait_minutes: LIMITS.cooling_hours * 60 };
    }
    const elapsed = Date.now() - new Date(regEvent.created_at).getTime();
    if (elapsed < coolMs) return { allowed: false, wait_minutes: Math.ceil((coolMs - elapsed) / 60000) };
  }
  return { allowed: true };
}

export interface AnomalyResult { risk: "low" | "medium" | "high"; flags: string[]; should_freeze: boolean; }

export async function detectTransactionAnomalies(amountXaf: number, deviceFp?: string): Promise<AnomalyResult> {
  const me = await uid();
  const sb = getSupabase();
  const flags: string[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const [monthlyTxRes, hourlyTxRes, profileRes] = await Promise.all([
    sb.from("wallet_transactions").select("amount_xaf").eq("user_id", me).in("type", ["withdraw", "transfer_out"]).gte("created_at", thirtyDaysAgo),
    sb.from("wallet_transactions").select("id").eq("user_id", me).in("type", ["withdraw", "transfer_out"]).gte("created_at", oneHourAgo),
    sb.from("profiles").select("device_fingerprint").eq("id", me).single(),
  ]);
  const monthlyAmounts = (monthlyTxRes.data ?? []).map((t: any) => Number(t.amount_xaf));
  const avgMonthly = monthlyAmounts.length > 0 ? monthlyAmounts.reduce((s, a) => s + a, 0) / monthlyAmounts.length : 0;
  const hourlyCount = hourlyTxRes.data?.length ?? 0;
  if (avgMonthly > 0 && amountXaf > avgMonthly * 3) flags.push("unusual_amount");
  if (hourlyCount >= 3) flags.push("high_frequency");
  if (deviceFp && profileRes.data?.device_fingerprint !== deviceFp) flags.push("new_device");
  if (amountXaf >= 300_000) flags.push("large_amount");
  const shouldFreeze = flags.includes("high_frequency") || (flags.includes("new_device") && flags.includes("large_amount"));
  if (shouldFreeze) {
    await sb.from("profiles").update({ wallet_frozen: true }).eq("id", me);
    await sb.from("notifications").insert({ user_id: me, title: "⚠️ Wallet temporairement gelé", body: "Activité inhabituelle détectée sur votre wallet.", type: "security_freeze" });
    await logSecurityEvent(me, "wallet_frozen", { flags, amount: amountXaf });
  }
  const risk = shouldFreeze || flags.length >= 3 ? "high" : flags.length >= 1 ? "medium" : "low";
  return { risk, flags, should_freeze: shouldFreeze };
}

export async function getWalletFreezeStatus(): Promise<{ frozen: boolean; reason?: string }> {
  const me = await uid();
  const { data } = await getSupabase().from("profiles").select("wallet_frozen, trust_flags").eq("id", me).single();
  const frozen = !!(data?.wallet_frozen);
  const blacklisted = (data?.trust_flags ?? []).includes("blacklisted");
  return { frozen: frozen || blacklisted, reason: blacklisted ? "Compte suspendu pour fraude" : frozen ? "Activité suspecte détectée" : undefined };
}

export async function unfreezeWallet(userId?: string) {
  const me = userId ?? await uid();
  await getSupabase().from("profiles").update({ wallet_frozen: false }).eq("id", me);
  await logSecurityEvent(me, "wallet_unfrozen", {});
  return { ok: true };
}

export async function getSecurityLog() {
  const me = await uid();
  const { data } = await getSupabase().from("identity_events")
    .select("event_type, created_at, metadata").eq("user_id", me).like("event_type", "sec:%").order("created_at", { ascending: false }).limit(50);
  return (data ?? []).map((e: any) => ({ type: e.event_type.replace("sec:", ""), at: e.created_at, meta: e.metadata ?? {} }));
}

export async function preTransactionCheck(amountXaf: number, recipientPhone?: string): Promise<{
  allowed: boolean; reason?: string; requires_pin: boolean; requires_otp: boolean; risk: string;
}> {
  const freeze = await getWalletFreezeStatus();
  if (freeze.frozen) return { allowed: false, reason: freeze.reason, requires_pin: false, requires_otp: false, risk: "blocked" };
  const limits = await checkTransactionLimits(amountXaf);
  if (!limits.allowed) return { allowed: false, reason: limits.reason, requires_pin: false, requires_otp: false, risk: "blocked" };
  if (recipientPhone) {
    const cooling = await checkCoolingPeriod(recipientPhone);
    if (!cooling.allowed) return { allowed: false, reason: `Nouveau bénéficiaire — délai de sécurité de ${cooling.wait_minutes} min requis`, requires_pin: false, requires_otp: false, risk: "cooling" };
  }
  const anomaly = await detectTransactionAnomalies(amountXaf);
  if (anomaly.should_freeze) return { allowed: false, reason: "Activité suspecte — wallet gelé.", requires_pin: false, requires_otp: false, risk: "high" };
  return { allowed: true, requires_pin: amountXaf >= 5_000, requires_otp: amountXaf >= 100_000 || anomaly.risk === "high", risk: anomaly.risk };
}
