import { getSupabase } from "@/src/supabase";

export interface CertificateVerification {
  valid: boolean;
  content_hash: string;
  doc_type: string;
  doc_id: string;
  holder_name: string;
  issued_at: string;
  chain_ref: string | null;
  verify_url: string;
  country?: string | null;
  city?: string | null;
  kyc_status?: string | null;
  member_since?: string | null;
  trust_score?: number | null;
  profile_bound?: boolean;
}

export async function verifyCertificateByHash(hash: string): Promise<CertificateVerification> {
  const normalized = (hash ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw { status: 400, detail: "Hash de certificat invalide" };
  }

  const { data, error } = await getSupabase().rpc("verify_certificate", { p_hash: normalized });
  if (error) throw { status: 502, detail: error.message ?? "Vérification impossible" };
  const row = data as CertificateVerification | null;
  if (!row?.valid) throw { status: 404, detail: "Certificat introuvable ou révoqué" };
  return row;
}
