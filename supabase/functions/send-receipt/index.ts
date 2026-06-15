/**
 * HODIX — envoi du reçu de transaction par email après paiement.
 *
 * Secrets (Supabase → Edge Functions → Secrets) :
 *   RESEND_API_KEY          — clé API Resend (https://resend.com)
 *   RECEIPT_FROM_EMAIL      — ex. receipts@hodix.app (domaine vérifié Resend)
 *   RECEIPT_FROM_NAME       — ex. HODIX (optionnel)
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

function buildReceiptId(id: string): string {
  const clean = id.replace(/-/g, "").toUpperCase().slice(0, 8).padEnd(8, "0");
  return `HDX-${clean}`;
}

function extractRef(description: string | null): string {
  const m = description?.match(/· ref:(.+)$/);
  return m?.[1]?.trim() ?? idShort(description ?? "");
}

function idShort(id: string): string {
  return id.replace(/-/g, "").toUpperCase().slice(0, 12);
}

function parseMeta(description: string | null): Record<string, unknown> | null {
  if (!description) return null;
  const raw = description.split(" · ref:")[0]?.trim() ?? description;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function kindLabel(kind?: string): string {
  switch (kind) {
    case "tontine_contribution": return "Cotisation tontine";
    case "savings_deposit": return "Dépôt épargne";
    case "association_contribution": return "Cotisation association";
    case "cooperative_contribution": return "Cotisation coopérative";
    case "fund_contribution": return "Contribution fonds";
    case "wallet_topup": return "Recharge wallet";
    default: return "Paiement HODIX";
  }
}

function providerLabel(p?: string): string {
  switch ((p ?? "").toLowerCase()) {
    case "orange": return "Orange Money";
    case "mtn": return "MTN Mobile Money";
    case "moov": return "Moov Money";
    case "card": return "Carte bancaire";
    default: return p ?? "CinetPay";
  }
}

function formatXaf(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} XAF`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function receiptHtml(opts: {
  receiptId: string;
  fullName: string;
  amountXaf: number;
  kindLabel: string;
  label?: string;
  method: string;
  reference: string;
  createdAt: string;
}): string {
  const { receiptId, fullName, amountXaf, kindLabel, label, method, reference, createdAt } = opts;
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
    <tr>
      <td style="background:linear-gradient(135deg,#0B1F3A,#10B981);padding:28px 32px;">
        <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">HODIX</div>
        <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;font-weight:600;">Reçu de transaction</div>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <p style="margin:0 0 8px;color:#64748b;font-size:13px;">Bonjour ${fullName},</p>
        <p style="margin:0 0 24px;color:#334155;font-size:14px;line-height:1.5;">
          Votre paiement a été confirmé. Voici votre reçu officiel.
        </p>
        <div style="text-align:center;padding:20px;background:#f8fafc;border-radius:12px;margin-bottom:24px;">
          <div style="font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Montant</div>
          <div style="font-size:32px;font-weight:900;color:#0B1F3A;margin-top:4px;">${formatXaf(amountXaf)}</div>
          <div style="font-size:13px;color:#10B981;font-weight:800;margin-top:8px;">✓ Confirmé</div>
        </div>
        <table width="100%" style="font-size:14px;color:#334155;">
          <tr><td style="padding:8px 0;color:#94a3b8;font-weight:600;">Référence reçu</td><td style="padding:8px 0;text-align:right;font-weight:800;font-family:monospace;">${receiptId}</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8;font-weight:600;">Type</td><td style="padding:8px 0;text-align:right;font-weight:700;">${kindLabel}</td></tr>
          ${label ? `<tr><td style="padding:8px 0;color:#94a3b8;font-weight:600;">Libellé</td><td style="padding:8px 0;text-align:right;font-weight:700;">${label}</td></tr>` : ""}
          <tr><td style="padding:8px 0;color:#94a3b8;font-weight:600;">Mode de paiement</td><td style="padding:8px 0;text-align:right;font-weight:700;">${method}</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8;font-weight:600;">Réf. transaction</td><td style="padding:8px 0;text-align:right;font-weight:700;font-family:monospace;font-size:12px;">${reference}</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8;font-weight:600;">Date</td><td style="padding:8px 0;text-align:right;font-weight:700;">${formatDate(createdAt)}</td></tr>
        </table>
        <p style="margin:28px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;text-align:center;">
          Conservez ce reçu pour vos archives. Pour toute question : support@hodix.app
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
  const paymentId = String(body.payment_id ?? "").trim();
  if (!paymentId) return json({ ok: false, error: "payment_id requis." }, 400);

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: payment, error: payErr } = await admin
    .from("payments")
    .select("id, user_id, amount, status, description, created_at, receipt_email_sent_at")
    .eq("id", paymentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (payErr || !payment) return json({ ok: false, error: "Paiement introuvable." }, 404);
  if (payment.status !== "succeeded") {
    return json({ ok: false, error: "Le paiement n'est pas encore confirmé." }, 400);
  }
  if (payment.receipt_email_sent_at && !body.force) {
    return json({ ok: true, already_sent: true, sent_at: payment.receipt_email_sent_at });
  }

  const { data: profile } = await admin.from("profiles")
    .select("full_name, email").eq("id", user.id).maybeSingle();
  const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
  if (!email) return json({ ok: false, error: "Aucune adresse email sur le compte." }, 400);

  const meta = parseMeta(payment.description ?? null);
  const kind = String(meta?.kind ?? "");
  const receiptId = buildReceiptId(payment.id);
  const reference = extractRef(payment.description ?? null);
  const amountXaf = Number(payment.amount);
  const label = meta?.label ? String(meta.label) : undefined;
  const method = providerLabel(meta?.provider ? String(meta.provider) : undefined);
  const fullName = profile?.full_name ?? user.email?.split("@")[0] ?? "Membre";

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RECEIPT_FROM_EMAIL") ?? "onboarding@resend.dev";
  const fromName = Deno.env.get("RECEIPT_FROM_NAME") ?? "HODIX";

  let delivery: "email" | "app" = "app";

  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      const { data: sent, error: sendErr } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [email],
        subject: `Reçu HODIX ${receiptId} — ${formatXaf(amountXaf)}`,
        html: receiptHtml({
          receiptId,
          fullName,
          amountXaf,
          kindLabel: kindLabel(kind),
          label,
          method,
          reference,
          createdAt: payment.created_at,
        }),
      });
      if (sendErr) {
        console.error("Resend error:", sendErr);
      } else if (sent?.id) {
        delivery = "email";
      }
    } catch (e) {
      console.error("Resend send failed:", e);
    }
  }

  const sentAt = new Date().toISOString();
  await admin.from("payments").update({ receipt_email_sent_at: sentAt }).eq("id", payment.id);

  const pushTitle = delivery === "email" ? "Reçu envoyé par email" : "Reçu de transaction disponible";
  const pushBody = delivery === "email"
    ? `${formatXaf(amountXaf)} — Réf. ${receiptId}`
    : `${formatXaf(amountXaf)} — ${kindLabel(kind)}. Réf. ${receiptId}. Consultez l'app pour le détail.`;

  if (delivery === "app") {
    await admin.from("notifications").insert({
      user_id: user.id,
      title: pushTitle,
      body: pushBody,
      type: "receipt",
      is_read: false,
    });
  }

  try {
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: user.id, title: pushTitle, body: pushBody, type: "receipt" }),
    });
  } catch { /* best-effort */ }

  return json({
    ok: true,
    delivery,
    email_masked: email.replace(/(.{2}).+(@.+)/, "$1•••$2"),
    receipt_id: receiptId,
    sent_at: sentAt,
  });
});
