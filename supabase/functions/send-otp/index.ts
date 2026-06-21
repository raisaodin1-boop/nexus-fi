/**
 * HODIX — OTP SMS (Twilio Verify ou Messages API) + fallback in-app/push.
 *
 * Secrets : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 *           TWILIO_VERIFY_SERVICE_SID (recommandé) ou TWILIO_FROM_NUMBER
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

function normalizePhone(raw: string): string {
  const p = raw.replace(/[\s\-]/g, "");
  if (p.startsWith("6") && p.length === 9) return `+237${p}`;
  if (p.startsWith("237") && !p.startsWith("+")) return `+${p}`;
  return p.startsWith("+") ? p : `+${p}`;
}

async function twilioVerifySend(serviceSid: string, sid: string, token: string, to: string): Promise<boolean> {
  const resp = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${token}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, Channel: "sms" }),
  });
  return resp.ok;
}

async function twilioVerifyCheck(serviceSid: string, sid: string, token: string, to: string, code: string): Promise<boolean> {
  const resp = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${token}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, Code: code }),
  });
  if (!resp.ok) return false;
  const data = await resp.json().catch(() => ({}));
  return data?.status === "approved";
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
  const purpose = String(body.purpose ?? "transaction");

  if (body.action === "send") {
    const { data: existing } = await admin.from("otp_codes")
      .select("last_sent_at").eq("user_id", user.id).maybeSingle();
    if (existing && Date.now() - new Date(existing.last_sent_at).getTime() < RESEND_COOLDOWN_S * 1000) {
      return json({ ok: false, error: "Veuillez patienter avant de redemander un code." });
    }

    const { data: profile } = await admin.from("profiles").select("phone").eq("id", user.id).maybeSingle();
    const phoneRaw = String(body.phone ?? profile?.phone ?? "").trim();
    const phone = normalizePhone(phoneRaw);
    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    const verifySid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");
    const from = Deno.env.get("TWILIO_FROM_NUMBER");

    let delivery: "sms" | "app" = "app";
    let verifyMode = false;

    if (sid && token && verifySid && /^\+?\d{8,15}$/.test(phone)) {
      try {
        if (await twilioVerifySend(verifySid, sid, token, phone)) {
          delivery = "sms";
          verifyMode = true;
        }
      } catch { /* fallback below */ }
    }

    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();
    let otp = "";

    if (!verifyMode) {
      otp = randomOtp();
      await admin.from("otp_codes").upsert({
        user_id: user.id,
        code_hash: await sha256(`${user.id}:${otp}`),
        expires_at: expiresAt,
        attempts: 0,
        last_sent_at: new Date().toISOString(),
        purpose,
        phone,
      });

      if (delivery === "app" && sid && token && from && /^\+?\d{8,15}$/.test(phone)) {
        try {
          const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(`${sid}:${token}`),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: phone,
              From: from,
              Body: `HODIX : votre code est ${otp}. Valable ${OTP_TTL_MIN} min.`,
            }),
          });
          if (resp.ok) delivery = "sms";
        } catch { /* fallback in-app */ }
      }
    } else {
      await admin.from("otp_codes").upsert({
        user_id: user.id,
        code_hash: "twilio_verify",
        expires_at: expiresAt,
        attempts: 0,
        last_sent_at: new Date().toISOString(),
        purpose,
        phone,
      });
    }

    const otpTitle = "Code de vérification HODIX";
    const otpBody = verifyMode
      ? `Un code a été envoyé par SMS au ${phone.slice(0, 4)}•••${phone.slice(-2)}.`
      : `Votre code : ${otp}. Valable ${OTP_TTL_MIN} min.`;

    if (delivery === "app" && !verifyMode) {
      await admin.from("notifications").insert({
        user_id: user.id, title: otpTitle, body: otpBody, type: "otp", is_read: false,
      });
    }

    const masked = phone.length >= 6 ? `${phone.slice(0, 4)}•••${phone.slice(-2)}` : null;
    return json({ ok: true, expires_at: expiresAt, delivery, phone_masked: delivery === "sms" ? masked : null, verify_mode: verifyMode });
  }

  if (body.action === "verify") {
    const input = String(body.code ?? "").trim();
    if (!/^\d{4,6}$/.test(input)) return json({ ok: true, valid: false, reason: "Entrez le code reçu." });

    const { data: row } = await admin.from("otp_codes").select("*").eq("user_id", user.id).maybeSingle();
    if (!row) return json({ ok: true, valid: false, reason: "Aucun code actif. Demandez un nouveau code." });

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    const verifySid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");
    const phone = normalizePhone(String(row.phone ?? ""));

    if (row.code_hash === "twilio_verify" && sid && token && verifySid && phone) {
      const approved = await twilioVerifyCheck(verifySid, sid, token, phone, input);
      if (!approved) return json({ ok: true, valid: false, reason: "Code incorrect ou expiré." });
      await admin.from("otp_codes").delete().eq("user_id", user.id);
      if (row.purpose === "registration") {
        await admin.from("profiles").update({ phone_verified: true, phone }).eq("id", user.id);
      }
      return json({ ok: true, valid: true });
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return json({ ok: true, valid: false, reason: "Code expiré. Demandez un nouveau code." });
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      return json({ ok: true, valid: false, reason: "Trop de tentatives. Demandez un nouveau code." });
    }

    if (await sha256(`${user.id}:${input}`) !== row.code_hash) {
      await admin.from("otp_codes").update({ attempts: row.attempts + 1 }).eq("user_id", user.id);
      const left = MAX_ATTEMPTS - row.attempts - 1;
      return json({ ok: true, valid: false, reason: left > 0 ? `Code incorrect (${left} essai${left > 1 ? "s" : ""} restant${left > 1 ? "s" : ""}).` : "Trop de tentatives." });
    }

    await admin.from("otp_codes").delete().eq("user_id", user.id);
    if (row.purpose === "registration") {
      await admin.from("profiles").update({ phone_verified: true, phone: row.phone }).eq("id", user.id);
    }
    return json({ ok: true, valid: true });
  }

  return json({ ok: false, error: "Action inconnue." }, 400);
});
