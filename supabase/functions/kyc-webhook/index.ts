/**
 * HODIX — callback Smile Identity pour résultats KYC.
 * verify_jwt: false (webhook externe)
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-smile-signature, x-webhook-secret",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const REJECTION_MESSAGES: Record<string, string> = {
  "0811": "Document illisible ou photo de mauvaise qualité.",
  "0812": "Document expiré ou invalide.",
  "0813": "Selfie ne correspond pas à la pièce d'identité.",
  "0814": "Informations incohérentes sur le document.",
  "1211": "Vérification biométrique échouée.",
  "1212": "Document non reconnu pour ce pays.",
};

function mapRejectionReason(resultCode: string): string {
  return REJECTION_MESSAGES[resultCode]
    ?? `Vérification refusée (code ${resultCode || "inconnu"}). Soumettez des photos plus nettes.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);

  const secret = Deno.env.get("KYC_WEBHOOK_SECRET")?.trim();
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    const sig = req.headers.get("x-smile-signature") ?? req.headers.get("x-webhook-secret") ?? "";
    const valid = auth === `Bearer ${secret}` || sig === secret;
    if (!valid) return json({ ok: false, error: "Non autorisé" }, 401);
  }

  const payload = await req.json().catch(() => ({}));
  const partnerParams = payload?.PartnerParams ?? payload?.partner_params ?? {};
  const userId = String(partnerParams.user_id ?? "").trim();
  const jobId = String(partnerParams.job_id ?? payload?.SmileJobID ?? "").trim();

  if (!userId) return json({ ok: false, error: "user_id manquant" }, 400);

  const resultCode = String(payload?.ResultCode ?? payload?.result?.ResultCode ?? "");
  const approved = resultCode === "0810" || resultCode === "1210"
    || String(payload?.result ?? "").toLowerCase() === "approved";

  const status = approved ? "approved" : "rejected";
  const rejectionReason = approved ? null : mapRejectionReason(resultCode);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Idempotency: skip if already finalized with same or newer review
  const { data: existing } = await admin
    .from("kyc_submissions")
    .select("id, status, provider_job_id, reviewed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    return json({ ok: true, ignored: true, reason: "submission_not_found" });
  }

  if (jobId && existing.provider_job_id && existing.provider_job_id !== jobId) {
    console.warn("kyc-webhook: job_id mismatch", { expected: existing.provider_job_id, got: jobId });
    return json({ ok: true, ignored: true, reason: "stale_job" });
  }

  if (existing.status === "approved" || existing.status === "rejected") {
    if (existing.reviewed_at) {
      return json({ ok: true, user_id: userId, already_reviewed: true, status: existing.status });
    }
  }

  const { error: subErr } = await admin.from("kyc_submissions").update({
    status,
    reviewed_at: new Date().toISOString(),
    provider_result: payload,
    rejection_reason: rejectionReason,
    notes: approved ? "Approuvé par Smile Identity" : `Rejeté — ${rejectionReason}`,
  }).eq("user_id", userId).eq("id", existing.id);

  if (subErr) {
    console.error("kyc-webhook update error:", subErr);
    return json({ ok: false, error: subErr.message }, 500);
  }

  await admin.from("profiles").update({ kyc_status: status }).eq("id", userId);

  await admin.rpc("log_compliance_event", {
    p_user_id: userId,
    p_category: "kyc",
    p_event_type: approved ? "kyc_smile_approved" : "kyc_smile_rejected",
    p_entity_type: "kyc_submission",
    p_entity_id: existing.id,
    p_metadata: { job_id: jobId, result_code: resultCode, provider: "smile_id" },
  });

  const title = approved ? "KYC approuvé ✅" : "KYC refusé";
  const body = approved
    ? "Votre identité a été vérifiée. Les retraits sont maintenant disponibles."
    : rejectionReason ?? "Votre dossier KYC a été refusé. Vous pouvez soumettre à nouveau.";

  await admin.from("notifications").insert({
    user_id: userId, title, body, type: approved ? "kyc" : "kyc_rejected", is_read: false,
  });

  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, title, body, type: "kyc" }),
    });
  } catch { /* best-effort */ }

  return json({ ok: true, user_id: userId, job_id: jobId, status });
});
