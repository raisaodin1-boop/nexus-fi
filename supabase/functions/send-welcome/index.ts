/**
 * HODIX — email de bienvenue à l'inscription.
 *
 * Secrets : RESEND_API_KEY, RECEIPT_FROM_EMAIL, RECEIPT_FROM_NAME
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

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

function welcomeHtml(opts: { fullName: string; referralCode: string }): string {
  const { fullName, referralCode } = opts;
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
    <tr>
      <td style="background:linear-gradient(135deg,#0B1F3A,#10B981);padding:28px 32px;">
        <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">HODIX</div>
        <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;font-weight:600;">Bienvenue !</div>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <p style="margin:0 0 8px;color:#64748b;font-size:13px;">Bonjour ${fullName},</p>
        <p style="margin:0 0 24px;color:#334155;font-size:14px;line-height:1.6;">
          Votre compte HODIX est créé. Vous pouvez dès maintenant rejoindre des tontines,
          épargner en groupe et gérer vos finances participatives en toute sécurité.
        </p>
        <div style="text-align:center;padding:20px;background:#f8fafc;border-radius:12px;margin-bottom:24px;">
          <div style="font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Votre code parrainage</div>
          <div style="font-size:28px;font-weight:900;color:#0B1F3A;margin-top:8px;font-family:monospace;letter-spacing:2px;">${referralCode}</div>
          <div style="font-size:13px;color:#64748b;margin-top:8px;line-height:1.5;">
            Partagez ce code et gagnez <strong>500 FCFA</strong> par nouvelle inscription !
          </div>
        </div>
        <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">
          Prochaines étapes :
        </p>
        <ul style="margin:12px 0 24px;padding-left:20px;color:#334155;font-size:14px;line-height:1.8;">
          <li>Complétez votre profil</li>
          <li>Rejoignez ou créez une tontine</li>
          <li>Invitez vos proches avec votre code</li>
        </ul>
        <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;text-align:center;">
          Besoin d'aide ? support@hodix.app
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px;background:#f8fafc;text-align:center;font-size:11px;color:#94a3b8;">
        © HODIX — Tontines & épargne participative africaine
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ ok: false, error: "Non authentifié." }, 401);

  const body = await req.json().catch(() => ({}));
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("full_name, email, referral_code, welcome_email_sent_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr || !profile) return json({ ok: false, error: "Profil introuvable." }, 404);
  if (profile.welcome_email_sent_at && !body.force) {
    return json({ ok: true, already_sent: true, sent_at: profile.welcome_email_sent_at });
  }

  const email = (profile.email ?? user.email ?? "").trim().toLowerCase();
  if (!email) return json({ ok: false, error: "Aucune adresse email sur le compte." }, 400);

  const fullName = String(body.full_name ?? profile.full_name ?? user.email?.split("@")[0] ?? "Membre");
  const referralCode = String(body.referral_code ?? profile.referral_code ?? "").trim();
  if (!referralCode) return json({ ok: false, error: "Code parrainage manquant." }, 400);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RECEIPT_FROM_EMAIL") ?? "onboarding@resend.dev";
  const fromName = Deno.env.get("RECEIPT_FROM_NAME") ?? "HODIX";

  let delivery: "email" | "skipped" = "skipped";

  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      const { data: sent, error: sendErr } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [email],
        subject: `Bienvenue sur HODIX, ${fullName} ! 🎉`,
        html: welcomeHtml({ fullName, referralCode }),
      });
      if (sendErr) {
        console.error("Resend welcome error:", sendErr);
      } else if (sent?.id) {
        delivery = "email";
      }
    } catch (e) {
      console.error("Resend welcome send failed:", e);
    }
  }

  const sentAt = new Date().toISOString();
  await admin.from("profiles").update({ welcome_email_sent_at: sentAt }).eq("id", user.id);

  return json({
    ok: true,
    delivery,
    email_masked: email.replace(/(.{2}).+(@.+)/, "$1•••$2"),
    sent_at: sentAt,
  });
});
