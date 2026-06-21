/**
 * HODIX — vérification KYC documentaire.
 *
 * 1. Valide les fichiers uploadés dans Storage (bucket kyc-documents)
 * 2. Si Smile Identity configuré → vérification tierce automatique
 * 3. Sinon → file d'attente revue manuelle admin
 *
 * Secrets :
 *   SMILE_PARTNER_ID, SMILE_API_KEY, SMILE_CALLBACK_URL (optionnel)
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COUNTRY_MAP: Record<string, string> = {
  Cameroun: "CM", Sénégal: "SN", "Côte d'Ivoire": "CI", Mali: "ML",
  "Burkina Faso": "BF", Niger: "NE", Tchad: "TD", Gabon: "GA", Congo: "CG",
  RDC: "CD", Nigeria: "NG", Ghana: "GH", Togo: "TG", Bénin: "BJ",
  Guinée: "GN", Madagascar: "MG",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function smileSignature(partnerId: string, apiKey: string): Promise<{ timestamp: string; signature: string }> {
  const timestamp = new Date().toISOString();
  const msg = `${timestamp}${partnerId}sid_request`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return { timestamp, signature };
}

async function fileToBase64(admin: ReturnType<typeof createClient>, path: string): Promise<string | null> {
  const { data, error } = await admin.storage.from("kyc-documents").download(path);
  if (error || !data) return null;
  const buf = await data.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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
  const idFrontPath = String(body.id_front_path ?? "").trim();
  const idBackPath = String(body.id_back_path ?? "").trim() || null;
  const selfiePath = String(body.selfie_path ?? "").trim();
  const idType = String(body.id_type ?? "IDENTITY_CARD").trim();
  const countryCode = String(body.country_code ?? COUNTRY_MAP[String(body.country ?? "")] ?? "CM").trim();

  if (!idFrontPath || !selfiePath) {
    return json({ ok: false, error: "id_front_path et selfie_path requis." }, 400);
  }

  const prefix = `${user.id}/`;
  if (!idFrontPath.startsWith(prefix) || !selfiePath.startsWith(prefix)) {
    return json({ ok: false, error: "Chemins de fichiers invalides." }, 403);
  }
  if (idBackPath && !idBackPath.startsWith(prefix)) {
    return json({ ok: false, error: "Chemin verso invalide." }, 403);
  }

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jobId = crypto.randomUUID();
  const partnerId = Deno.env.get("SMILE_PARTNER_ID");
  const apiKey = Deno.env.get("SMILE_API_KEY");
  const callbackUrl = Deno.env.get("SMILE_CALLBACK_URL")
    ?? `${supabaseUrl}/functions/v1/kyc-webhook`;

  const { error: upsertErr } = await admin.from("kyc_submissions").upsert({
    user_id: user.id,
    status: "pending",
    id_type: idType,
    country_code: countryCode,
    id_front_path: idFrontPath,
    id_back_path: idBackPath,
    selfie_path: selfiePath,
    provider: partnerId ? "smile_id" : "manual",
    provider_job_id: jobId,
    verification_mode: partnerId ? "automated" : "manual",
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    notes: null,
    provider_result: null,
  }, { onConflict: "user_id" });
  if (upsertErr) return json({ ok: false, error: "Erreur enregistrement KYC." }, 500);

  await admin.from("profiles").update({ kyc_status: "pending_review" }).eq("id", user.id);

  let mode: "automated" | "manual" = "manual";
  let smileJobId: string | null = null;

  if (partnerId && apiKey) {
    const [idFrontB64, selfieB64, idBackB64] = await Promise.all([
      fileToBase64(admin, idFrontPath),
      fileToBase64(admin, selfiePath),
      idBackPath ? fileToBase64(admin, idBackPath) : Promise.resolve(null),
    ]);

    if (idFrontB64 && selfieB64) {
      const { timestamp, signature } = await smileSignature(partnerId, apiKey);
      const imageDetails: { image_type_id: number; image: string }[] = [
        { image_type_id: 1, image: idFrontB64 },
        { image_type_id: 2, image: selfieB64 },
      ];
      if (idBackB64) imageDetails.push({ image_type_id: 3, image: idBackB64 });

      try {
        const resp = await fetch("https://api.smileidentity.com/v1/async_id_verification", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "smileid-partner-id": partnerId,
            "smileid-request-signature": signature,
            "smileid-timestamp": timestamp,
          },
          body: JSON.stringify({
            partner_params: { job_id: jobId, user_id: user.id, job_type: 1 },
            country: countryCode,
            id_type: idType,
            callback_url: callbackUrl,
            image_details: imageDetails,
          }),
        });
        const result = await resp.json().catch(() => ({}));
        smileJobId = result?.job_id ?? result?.SmileJobID ?? jobId;
        mode = "automated";
        await admin.from("kyc_submissions").update({
          provider_job_id: smileJobId,
          provider_result: result,
        }).eq("user_id", user.id);
      } catch (e) {
        console.error("Smile ID error:", e);
        mode = "manual";
        await admin.from("kyc_submissions").update({
          verification_mode: "manual",
          provider: "manual",
          notes: "Smile ID indisponible — revue manuelle.",
        }).eq("user_id", user.id);
      }
    }
  }

  await admin.from("notifications").insert({
    user_id: user.id,
    title: "Dossier KYC soumis",
    body: mode === "automated"
      ? "Votre identité est en cours de vérification automatique."
      : "Votre dossier est en file d'attente pour revue par notre équipe.",
    type: "kyc",
    is_read: false,
  });

  return json({
    ok: true,
    mode,
    job_id: smileJobId ?? jobId,
    status: "pending_review",
  });
});
