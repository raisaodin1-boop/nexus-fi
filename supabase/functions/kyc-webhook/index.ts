/**
 * HODIX — callback Smile Identity pour résultats KYC.
 * verify_jwt: false (webhook externe)
 */
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);

  const payload = await req.json().catch(() => ({}));
  const partnerParams = payload?.PartnerParams ?? payload?.partner_params ?? {};
  const userId = String(partnerParams.user_id ?? "").trim();
  const jobId = String(partnerParams.job_id ?? payload?.SmileJobID ?? "").trim();

  if (!userId) return json({ ok: false, error: "user_id manquant" }, 400);

  const resultCode = String(payload?.ResultCode ?? payload?.result?.ResultCode ?? "");
  const approved = resultCode === "0810" || resultCode === "1210"
    || String(payload?.result ?? "").toLowerCase() === "approved";

  const status = approved ? "approved" : "rejected";
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  await admin.from("kyc_submissions").update({
    status,
    reviewed_at: new Date().toISOString(),
    provider_result: payload,
    notes: approved ? "Approuvé par Smile Identity" : `Rejeté — code ${resultCode || "inconnu"}`,
  }).eq("user_id", userId);

  await admin.from("profiles").update({ kyc_status: status }).eq("id", userId);

  const title = approved ? "KYC approuvé ✅" : "KYC refusé";
  const body = approved
    ? "Votre identité a été vérifiée avec succès."
    : "Votre dossier KYC a été refusé. Vous pouvez soumettre à nouveau.";

  await admin.from("notifications").insert({
    user_id: userId, title, body, type: "kyc", is_read: false,
  });

  return json({ ok: true, user_id: userId, job_id: jobId, status });
});
