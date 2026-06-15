/**
 * HODIX — envoi du certificat authentifié par email.
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

const KIND_LABELS: Record<string, string> = {
  identity: "Identité Certifiée",
  "trust-score": "Trust Score Certifié",
  savings: "Épargne Certifiée",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ ok: false, error: "Non authentifié." }, 401);

  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const html = String(body.html ?? "").trim();
  if (!kind || !email || !html) {
    return json({ ok: false, error: "kind, email et html sont requis." }, 400);
  }

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: purchase } = await admin
    .from("certificate_purchases")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .eq("status", "paid")
    .maybeSingle();
  if (!purchase) return json({ ok: false, error: "Certificat non payé ou introuvable." }, 403);

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const fromEmail = Deno.env.get("RECEIPT_FROM_EMAIL")?.trim() ?? "receipts@hodix.app";
  const fromName = Deno.env.get("RECEIPT_FROM_NAME")?.trim() ?? "HODIX";

  if (!resendKey) {
    return json({ ok: true, delivery: "app", email_masked: email.replace(/(.{2}).+(@.+)/, "$1***$2") });
  }

  const resend = new Resend(resendKey);
  const label = KIND_LABELS[kind] ?? "Certificat HODIX";
  const { error: sendErr } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: email,
    subject: `Votre ${label} — HODIX`,
    html: `<!DOCTYPE html><html lang="fr"><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#334155;">
      <h2 style="color:#0B1F3A;">${label}</h2>
      <p>Merci pour votre achat. Votre certificat authentifié HODIX est joint ci-dessous.</p>
      <div style="margin-top:24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${html}</div>
      <p style="margin-top:24px;font-size:12px;color:#94a3b8;">© HODIX — support@hodix.app</p>
    </body></html>`,
  });
  if (sendErr) return json({ ok: false, error: sendErr.message }, 502);

  return json({
    ok: true,
    delivery: "email",
    email_masked: email.replace(/(.{2}).+(@.+)/, "$1***$2"),
    sent_at: new Date().toISOString(),
  });
});
