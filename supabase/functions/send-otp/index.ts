/**
 * HODIX — transaction 2FA (server-side OTP).
 *
 * actions:
 *   { action: "send" }                → generates a 6-digit code, stores its
 *     hash in otp_codes, delivers it by SMS (Twilio) when TWILIO_* secrets
 *     are configured and the user has a phone number, otherwise falls back
 *     to an in-app notification.
 *   { action: "verify", code: "123456" } → checks the code (expiry + max 5
 *     attempts), deletes it on success.
 *
 * The client NEVER sees or stores the code: generation and verification are
 * fully server-side, unlike the previous client-generated flow.
 *
 * Required secrets for SMS delivery (Dashboard → Edge Functions → Secrets):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const OTP_TTL_MIN = 10;
const RESEND_COOLDOWN_S = 60;
const MAX_ATTEMPTS = 5;

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

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomOtp(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ ok: false, error: "Non authentifié." }, 401);

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));

  if (body.action === "send") {
    const { data: existing } = await admin.from("otp_codes")
      .select("last_sent_at").eq("user_id", user.id).maybeSingle();
    if (existing && Date.now() - new Date(existing.last_sent_at).getTime() < RESEND_COOLDOWN_S * 1000) {
      return json({ ok: false, error: "Veuillez patienter avant de redemander un code." });
    }

    const otp = randomOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();
    const { error: upsertErr } = await admin.from("otp_codes").upsert({
      user_id: user.id,
      code_hash: await sha256(`${user.id}:${otp}`),
      expires_at: expiresAt,
      attempts: 0,
      last_sent_at: new Date().toISOString(),
    });
    if (upsertErr) return json({ ok: false, error: "Erreur interne." }, 500);

    const { data: profile } = await admin.from("profiles").select("phone").eq("id", user.id).maybeSingle();
    const phone = String(profile?.phone ?? "").replace(/[\s\-]/g, "");
    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    const from = Deno.env.get("TWILIO_FROM_NUMBER");

    let delivery: "sms" | "app" = "app";
    if (sid && token && from && /^\+?\d{8,15}$/.test(phone)) {
      const to = phone.startsWith("+") ? phone : `+${phone}`;
      try {
        const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(`${sid}:${token}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: to,
            From: from,
            Body: `Hodix : votre code de vérification est ${otp}. Valable ${OTP_TTL_MIN} min. Ne le partagez jamais.`,
          }),
        });
        if (resp.ok) delivery = "sms";
      } catch {
        // SMS failed → fall back to in-app delivery below
      }
    }

    if (delivery === "app") {
      await admin.from("notifications").insert({
        user_id: user.id,
        title: "Code de vérification HODIX",
        body: `Votre code : ${otp}. Valable ${OTP_TTL_MIN} min. Ne le communiquez jamais.`,
        type: "otp",
        is_read: false,
      });
    }

    const masked = phone.length >= 6 ? `${phone.slice(0, 4)}•••${phone.slice(-2)}` : null;
    return json({ ok: true, expires_at: expiresAt, delivery, phone_masked: delivery === "sms" ? masked : null });
  }

  if (body.action === "verify") {
    const input = String(body.code ?? "").trim();
    if (!/^\d{6}$/.test(input)) return json({ ok: true, valid: false, reason: "Entrez le code à 6 chiffres." });

    const { data: row } = await admin.from("otp_codes").select("*").eq("user_id", user.id).maybeSingle();
    if (!row) return json({ ok: true, valid: false, reason: "Aucun code actif. Demandez un nouveau code." });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return json({ ok: true, valid: false, reason: "Code expiré. Demandez un nouveau code." });
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      return json({ ok: true, valid: false, reason: "Trop de tentatives. Demandez un nouveau code." });
    }

    if (await sha256(`${user.id}:${input}`) !== row.code_hash) {
      await admin.from("otp_codes").update({ attempts: row.attempts + 1 }).eq("user_id", user.id);
      const left = MAX_ATTEMPTS - row.attempts - 1;
      return json({ ok: true, valid: false, reason: left > 0 ? `Code incorrect (${left} essai${left > 1 ? "s" : ""} restant${left > 1 ? "s" : ""}).` : "Trop de tentatives. Demandez un nouveau code." });
    }

    await admin.from("otp_codes").delete().eq("user_id", user.id);
    return json({ ok: true, valid: true });
  }

  return json({ ok: false, error: "Action inconnue." }, 400);
});
