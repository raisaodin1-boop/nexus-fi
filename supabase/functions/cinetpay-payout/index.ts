/**
 * HODIX — CinetPay Transfer (disbursement) for wallet withdrawals
 *
 * Flow: wallet_withdraw debits → status pending_disbursement → this function sends MM payout
 *
 * Secrets:
 *   CINETPAY_TRANSFER_APIKEY + CINETPAY_TRANSFER_PASSWORD
 *   CINETPAY_PAYOUT_NOTIFY_URL (optional)
 *   CINETPAY_PAYOUT_SANDBOX=true — mark completed without real transfer (dev)
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, json, sendTransfer } from "../_shared/cinetpay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ ok: false, error: "Non authentifié." }, 401);

  const body = await req.json().catch(() => ({}));
  const walletTxId = String(body.wallet_tx_id ?? "").trim();
  if (!walletTxId) return json({ ok: false, error: "wallet_tx_id requis." }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: tx, error: txErr } = await admin
    .from("wallet_transactions")
    .select("*")
    .eq("id", walletTxId)
    .eq("user_id", user.id)
    .eq("type", "withdraw")
    .maybeSingle();

  if (txErr || !tx) return json({ ok: false, error: "Transaction introuvable." }, 404);
  if (tx.status === "completed") {
    return json({ ok: true, status: "completed", already_done: true, reference: tx.reference });
  }
  if (tx.status !== "pending_disbursement") {
    return json({ ok: false, error: `Statut invalide: ${tx.status}` }, 400);
  }

  const phone = String(tx.mobile_money_number ?? "").trim();
  if (!phone) return json({ ok: false, error: "Numéro Mobile Money manquant." }, 400);

  const amountXaf = Number(tx.amount_xaf ?? tx.amount);
  const provider = String(tx.mobile_money_provider ?? "MTN MoMo");
  const sandbox = Deno.env.get("CINETPAY_PAYOUT_SANDBOX") === "true";

  if (sandbox) {
    const { data: completed, error: compErr } = await admin.rpc("complete_wallet_payout", {
      p_tx_id: walletTxId,
      p_payout_ref: `SANDBOX-${Date.now()}`,
      p_provider_ref: "sandbox",
    });
    if (compErr) return json({ ok: false, error: compErr.message }, 500);
    return json({ ok: true, status: "completed", sandbox: true, tx: completed });
  }

  const transfer = await sendTransfer({
    phone,
    amountXaf,
    clientTransactionId: walletTxId,
    provider,
  });

  if (!transfer.ok) {
    const { error: refundErr } = await admin.rpc("refund_wallet_withdraw", {
      p_tx_id: walletTxId,
      p_reason: transfer.message ?? "Échec CinetPay Transfer",
    });
    if (refundErr) console.error("refund_wallet_withdraw:", refundErr);

    await admin.from("notifications").insert({
      user_id: user.id,
      title: "Retrait échoué",
      body: `Le virement Mobile Money a échoué. Votre wallet a été recrédité. (${transfer.message ?? "erreur"})`,
      type: "error",
      is_read: false,
    });

    return json({ ok: false, error: transfer.message ?? "Échec du virement." }, 502);
  }

  const { data: completed, error: compErr } = await admin.rpc("complete_wallet_payout", {
    p_tx_id: walletTxId,
    p_payout_ref: transfer.lot ?? `CP-T-${Date.now()}`,
    p_provider_ref: transfer.lot ?? null,
  });
  if (compErr) return json({ ok: false, error: compErr.message }, 500);

  await admin.from("withdrawal_requests")
    .update({ status: "processing", payout_lot: transfer.lot ?? null, payout_reference: transfer.lot })
    .eq("wallet_tx_id", walletTxId);

  await admin.from("notifications").insert({
    user_id: user.id,
    title: "Retrait en cours",
    body: `${amountXaf.toLocaleString("fr-FR")} XAF envoyés vers ${phone}. Réf. ${transfer.lot ?? tx.reference}`,
    type: "withdrawal",
    is_read: false,
  });

  return json({
    ok: true,
    status: "completed",
    payout_lot: transfer.lot,
    tx: completed,
  });
});
