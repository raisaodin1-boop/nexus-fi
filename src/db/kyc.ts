import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";
import { notifyUser } from "./notifications";

const BUCKET = "kyc-documents";

const COUNTRY_CODES: Record<string, string> = {
  // Afrique Centrale
  Cameroun: "CM", Tchad: "TD", Gabon: "GA", Congo: "CG", RDC: "CD",
  "République Centrafricaine": "CF", "Guinée Équatoriale": "GQ",
  // Afrique de l'Ouest
  Sénégal: "SN", "Côte d'Ivoire": "CI", Mali: "ML", "Burkina Faso": "BF",
  Niger: "NE", Togo: "TG", Bénin: "BJ", Guinée: "GN", Nigeria: "NG",
  Ghana: "GH", "Sierra Leone": "SL", Liberia: "LR", "Guinée-Bissau": "GW",
  Mauritanie: "MR", "Cap-Vert": "CV", Gambie: "GM",
  // Afrique de l'Est
  Kenya: "KE", Éthiopie: "ET", Tanzanie: "TZ", Ouganda: "UG",
  Rwanda: "RW", Burundi: "BI", Djibouti: "DJ", Somalie: "SO", Érythrée: "ER",
  // Afrique du Nord
  Maroc: "MA", Algérie: "DZ", Tunisie: "TN", Égypte: "EG", Libye: "LY",
  // Afrique Australe
  "Afrique du Sud": "ZA", Zimbabwe: "ZW", Mozambique: "MZ", Zambie: "ZM",
  Malawi: "MW", Madagascar: "MG", Angola: "AO", Botswana: "BW",
  Namibie: "NA", Lesotho: "LS", Eswatini: "SZ",
};

function base64ToUint8Array(base64: string): Uint8Array {
  // atob() n'existe pas dans React Native — décodage manuel compatible JSC/Hermes
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = clean.length;
  const bytes = new Uint8Array(Math.floor(len * 3 / 4));
  let idx = 0;
  for (let i = 0; i < len; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = chars.indexOf(clean[i + 2]);
    const d = chars.indexOf(clean[i + 3]);
    bytes[idx++] = (a << 2) | (b >> 4);
    if (c !== -1) bytes[idx++] = ((b & 0xf) << 4) | (c >> 2);
    if (d !== -1) bytes[idx++] = ((c & 0x3) << 6) | d;
  }
  return bytes.slice(0, idx);
}

export type KycDocKind = "id_front" | "id_back" | "selfie";

function randomToken(len = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function uploadKycDocument(kind: KycDocKind, base64: string, mime = "image/jpeg"): Promise<string> {
  const me = await uid();
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  // Nom aléatoire pour éviter l'énumération des documents KYC
  const path = `${me}/${kind}-${randomToken()}.${ext}`;
  const data = base64ToUint8Array(base64);
  if (data.length === 0) throw { status: 400, detail: "Document vide ou encodage base64 invalide." };
  const { error } = await getSupabase().storage
    .from(BUCKET)
    .upload(path, data, { contentType: mime, upsert: true });
  throwSb(error);
  return path;
}

export async function getKycStatus() {
  const me = await uid();
  const { data } = await getSupabase()
    .from("kyc_submissions")
    .select("status, submitted_at, reviewed_at, verification_mode, provider, rejection_reason")
    .eq("user_id", me)
    .maybeSingle();
  if (!data) return { status: "not_submitted" };
  const status = data.status === "pending" ? "pending_review" : data.status;
  return { ...data, status };
}

export async function submitKyc(payload?: {
  id_front_path?: string;
  id_back_path?: string;
  selfie_path?: string;
  id_type?: string;
  country?: string;
  country_code?: string;
}) {
  const me = await uid();
  const sb = getSupabase();

  if (payload?.id_front_path && payload?.selfie_path) {
    const { data, error } = await sb.functions.invoke("verify-kyc", {
      body: {
        id_front_path: payload.id_front_path,
        id_back_path: payload.id_back_path ?? null,
        selfie_path: payload.selfie_path,
        id_type: payload.id_type ?? "IDENTITY_CARD",
        country: payload.country,
        country_code: payload.country_code ?? COUNTRY_CODES[payload.country ?? ""] ?? "CM",
      },
    });
    if (error) throw { status: 502, detail: error.message ?? "Vérification KYC impossible." };
    if (!data?.ok) throw { status: 400, detail: data?.error ?? "Vérification KYC impossible." };
    return {
      detail: data.mode === "automated"
        ? "Dossier soumis — vérification automatique en cours"
        : "Dossier soumis — revue manuelle en cours",
      ...data,
    };
  }

  // Fallback sans documents : file manuelle (profil déjà complété)
  const { error } = await sb.from("kyc_submissions").upsert({
    user_id: me,
    status: "pending",
    verification_mode: "manual",
    provider: "manual",
    submitted_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  throwSb(error);
  await sb.from("profiles").update({ kyc_status: "pending_review" }).eq("id", me);
  await notifyUser({
    user_id: me,
    title: "Dossier KYC soumis",
    body: "Votre dossier est en file d'attente pour revue par notre équipe.",
    type: "kyc",
  });
  return { detail: "Demande KYC soumise (revue manuelle)" };
}

export async function submitKycFromBase64(docs: {
  id_front_base64: string;
  selfie_base64: string;
  id_back_base64?: string;
  id_type?: string;
  country?: string;
}) {
  const [idFrontPath, selfiePath, idBackPath] = await Promise.all([
    uploadKycDocument("id_front", docs.id_front_base64),
    uploadKycDocument("selfie", docs.selfie_base64),
    docs.id_back_base64 ? uploadKycDocument("id_back", docs.id_back_base64) : Promise.resolve(null),
  ]);
  return submitKyc({
    id_front_path: idFrontPath,
    selfie_path: selfiePath,
    id_back_path: idBackPath ?? undefined,
    id_type: docs.id_type,
    country: docs.country,
  });
}
