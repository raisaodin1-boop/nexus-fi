import { getSupabase } from "@/src/supabase";
import { uid, throwSb, invalidateCache, cached, requireAdmin } from "./helpers";
import { notifyUser } from "./notifications";
import { secureRandomAlphanumeric } from "./secure-random";
import {
  type DiasporaAccess,
  type DiasporaEnrollmentStatus,
  diasporaCurrencyForCountry,
  isBlockedDiasporaCountry,
} from "@/src/diaspora-enrollment-config";
import type { Currency } from "@/src/exchange-rates";

const ENROLLMENT_BUCKET = "diaspora-enrollment";

export interface DiasporaEnrollment {
  id: string;
  user_id: string;
  status: DiasporaEnrollmentStatus;
  full_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  region?: string | null;
  country_of_residence?: string | null;
  phone?: string | null;
  email?: string | null;
  id_document_type?: string | null;
  rejection_reason?: string | null;
  preferred_currency?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

function base64ToUint8Array(base64: string): Uint8Array {
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

function mapEnrollment(row: Record<string, unknown>): DiasporaEnrollment {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    status: row.status as DiasporaEnrollmentStatus,
    full_name: row.full_name as string | null,
    address_line1: row.address_line1 as string | null,
    address_line2: row.address_line2 as string | null,
    city: row.city as string | null,
    postal_code: row.postal_code as string | null,
    region: row.region as string | null,
    country_of_residence: row.country_of_residence as string | null,
    phone: row.phone as string | null,
    email: row.email as string | null,
    id_document_type: row.id_document_type as string | null,
    rejection_reason: row.rejection_reason as string | null,
    preferred_currency: row.preferred_currency as string | null,
    submitted_at: row.submitted_at as string | null,
    reviewed_at: row.reviewed_at as string | null,
    created_at: String(row.created_at),
  };
}

export async function uploadDiasporaEnrollmentDoc(
  kind: "id_front" | "id_back" | "selfie" | "proof_abroad",
  base64: string,
  mime = "image/jpeg",
): Promise<string> {
  const me = await uid();
  const ext = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : "jpg";
  const path = `${me}/${kind}-${secureRandomAlphanumeric(12, "abcdefghijklmnopqrstuvwxyz0123456789")}.${ext}`;
  const data = base64ToUint8Array(base64);
  if (data.length === 0) throw { status: 400, detail: "Document vide ou encodage invalide." };
  const { error } = await getSupabase().storage.from(ENROLLMENT_BUCKET).upload(path, data, { contentType: mime, upsert: true });
  throwSb(error);
  return path;
}

export async function getDiasporaAccess(): Promise<DiasporaAccess> {
  const me = await uid();
  return cached(`diaspora-access-${me}`, 30_000, async () => {
    const { data: profile } = await getSupabase()
      .from("profiles")
      .select("diaspora_status, diaspora_country, diaspora_currency")
      .eq("id", me)
      .maybeSingle();

    const { data: row } = await getSupabase()
      .from("diaspora_enrollments")
      .select("*")
      .eq("user_id", me)
      .maybeSingle();

    if (!row) {
      if (profile?.diaspora_status === "approved") {
        return {
          status: "approved",
          has_access: true,
          country_of_residence: profile.diaspora_country,
          preferred_currency: (profile.diaspora_currency as Currency) ?? "EUR",
        };
      }
      return { status: "not_submitted", has_access: false };
    }

    const enrollment = mapEnrollment(row);
    const approved = enrollment.status === "approved" || profile?.diaspora_status === "approved";

    return {
      status: enrollment.status,
      has_access: approved,
      country_of_residence: enrollment.country_of_residence ?? profile?.diaspora_country,
      preferred_currency: (enrollment.preferred_currency ?? profile?.diaspora_currency ?? "EUR") as Currency,
      rejection_reason: enrollment.rejection_reason,
      submitted_at: enrollment.submitted_at ?? undefined,
      enrollment_id: enrollment.id,
    };
  });
}

export async function requireDiasporaAccess(): Promise<DiasporaAccess> {
  const access = await getDiasporaAccess();
  if (!access.has_access) {
    throw {
      status: 403,
      detail: "Accès Diaspora réservé aux membres vérifiés. Complétez votre inscription Diaspora.",
      redirect_to: "/diaspora",
    };
  }
  return access;
}

export async function getDiasporaEnrollment(): Promise<DiasporaEnrollment | null> {
  const me = await uid();
  const { data } = await getSupabase().from("diaspora_enrollments").select("*").eq("user_id", me).maybeSingle();
  return data ? mapEnrollment(data) : null;
}

export async function submitDiasporaEnrollment(payload: {
  full_name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  postal_code: string;
  region?: string;
  country_of_residence: string;
  phone: string;
  email?: string;
  id_document_type: "passport" | "foreign_id" | "residence_permit";
  id_front_path: string;
  id_back_path?: string;
  selfie_path: string;
  proof_abroad_path: string;
  declared_abroad: boolean;
}) {
  const me = await uid();

  if (!payload.declared_abroad) {
    throw { status: 400, detail: "Vous devez confirmer résider hors du Cameroun." };
  }
  if (isBlockedDiasporaCountry(payload.country_of_residence)) {
    throw { status: 400, detail: "Le mode Diaspora est réservé aux membres résidant hors du Cameroun." };
  }
  if (!payload.full_name?.trim() || !payload.address_line1?.trim() || !payload.city?.trim()) {
    throw { status: 400, detail: "Nom et adresse complète requis." };
  }
  if (!payload.phone?.trim()) throw { status: 400, detail: "Téléphone requis." };
  if (!payload.id_front_path || !payload.selfie_path || !payload.proof_abroad_path) {
    throw { status: 400, detail: "Pièce d'identité, selfie et preuve de résidence à l'étranger sont obligatoires." };
  }

  const currency = diasporaCurrencyForCountry(payload.country_of_residence);
  const now = new Date().toISOString();

  const row = {
    user_id: me,
    status: "pending_review" as const,
    full_name: payload.full_name.trim(),
    address_line1: payload.address_line1.trim(),
    address_line2: payload.address_line2?.trim() ?? null,
    city: payload.city.trim(),
    postal_code: payload.postal_code.trim(),
    region: payload.region?.trim() ?? null,
    country_of_residence: payload.country_of_residence.trim(),
    phone: payload.phone.trim(),
    email: payload.email?.trim() ?? null,
    id_document_type: payload.id_document_type,
    id_front_path: payload.id_front_path,
    id_back_path: payload.id_back_path ?? null,
    selfie_path: payload.selfie_path,
    proof_abroad_path: payload.proof_abroad_path,
    declared_abroad: true,
    preferred_currency: currency,
    rejection_reason: null,
    submitted_at: now,
    updated_at: now,
  };

  const { data: existing } = await getSupabase().from("diaspora_enrollments").select("id, status").eq("user_id", me).maybeSingle();

  if (existing?.status === "approved") {
    throw { status: 400, detail: "Votre accès Diaspora est déjà actif." };
  }

  let error;
  if (existing) {
    ({ error } = await getSupabase().from("diaspora_enrollments").update(row).eq("user_id", me));
  } else {
    ({ error } = await getSupabase().from("diaspora_enrollments").insert(row));
  }
  throwSb(error);

  await getSupabase().from("profiles").update({ diaspora_status: "pending_review" }).eq("id", me);

  await notifyUser({
    user_id: me,
    title: "Dossier Diaspora reçu",
    body: "Votre inscription au mode Diaspora est en cours de vérification (24–48 h ouvrées).",
    type: "info",
    metadata: { action_url: "/diaspora" },
  });

  invalidateCache(`diaspora-access-${me}`);
  return { detail: "Dossier soumis pour validation", status: "pending_review" as const };
}

/* ── Admin ─────────────────────────────────────────────────── */

export async function adminListDiasporaEnrollments(status?: string) {
  await requireAdmin();
  let q = getSupabase().from("diaspora_enrollments").select("*").order("submitted_at", { ascending: false, nullsFirst: false });
  if (status && status !== "all") q = q.eq("status", status);
  else q = q.neq("status", "not_submitted");
  const { data, error } = await q.limit(200);
  throwSb(error);

  const userIds = [...new Set((data ?? []).map((r: { user_id: string }) => r.user_id))];
  const { data: profiles } = await getSupabase()
    .from("profiles")
    .select("id, full_name, email, kyc_status")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const profMap = new Map((profiles ?? []).map((p: { id: string }) => [p.id, p]));

  return (data ?? []).map((r) => ({
    ...mapEnrollment(r as Record<string, unknown>),
    user: profMap.get(r.user_id),
  }));
}

export async function adminGetDiasporaEnrollment(id: string) {
  await requireAdmin();
  const { data, error } = await getSupabase().from("diaspora_enrollments").select("*").eq("id", id).single();
  throwSb(error);

  const { data: profile } = await getSupabase()
    .from("profiles")
    .select("full_name, email, phone, kyc_status, country, created_at")
    .eq("id", data.user_id)
    .single();

  const signed = async (path?: string | null) => {
    if (!path) return null;
    const { data: s } = await getSupabase().storage.from(ENROLLMENT_BUCKET).createSignedUrl(path, 3600);
    return s?.signedUrl ?? null;
  };

  return {
    ...mapEnrollment(data),
    user: profile,
    id_front_url: await signed(data.id_front_path),
    id_back_url: await signed(data.id_back_path),
    selfie_url: await signed(data.selfie_path),
    proof_abroad_url: await signed(data.proof_abroad_path),
  };
}

export async function adminApproveDiasporaEnrollment(enrollmentId: string, note?: string) {
  await requireAdmin();
  const { data, error } = await getSupabase().rpc("approve_diaspora_enrollment", {
    p_enrollment_id: enrollmentId,
    p_internal_note: note ?? null,
  });
  throwSb(error);

  const { data: row } = await getSupabase().from("diaspora_enrollments").select("user_id, country_of_residence").eq("id", enrollmentId).single();
  if (row?.user_id) {
    invalidateCache(`diaspora-access-${row.user_id}`);
    await notifyUser({
      user_id: row.user_id,
      title: "Mode Diaspora activé",
      body: `Votre inscription Diaspora est validée. Bienvenue depuis ${row.country_of_residence ?? "l'étranger"} !`,
      type: "success",
      metadata: { action_url: "/(tabs)" },
    });
  }
  invalidateCache("diaspora");
  return data;
}

export async function adminRejectDiasporaEnrollment(enrollmentId: string, reason: string, note?: string) {
  await requireAdmin();
  const me = await uid();
  const { data, error } = await getSupabase().from("diaspora_enrollments")
    .update({
      status: "rejected",
      rejection_reason: reason,
      reviewed_by: me,
      reviewed_at: new Date().toISOString(),
      internal_note: note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId)
    .neq("status", "approved")
    .select("user_id")
    .single();
  throwSb(error);

  if (data?.user_id) {
    await getSupabase().from("profiles").update({ diaspora_status: "rejected" }).eq("id", data.user_id);
    invalidateCache(`diaspora-access-${data.user_id}`);
    await notifyUser({
      user_id: data.user_id,
      title: "Inscription Diaspora non validée",
      body: reason,
      type: "alert",
      metadata: { action_url: "/diaspora/enroll" },
    });
  }
  return { detail: "Inscription rejetée" };
}

export async function adminDiasporaEnrollmentStats() {
  await requireAdmin();
  const sb = getSupabase();
  const [pending, approved, rejected] = await Promise.all([
    sb.from("diaspora_enrollments").select("*", { count: "exact", head: true }).eq("status", "pending_review"),
    sb.from("diaspora_enrollments").select("*", { count: "exact", head: true }).eq("status", "approved"),
    sb.from("diaspora_enrollments").select("*", { count: "exact", head: true }).eq("status", "rejected"),
  ]);
  return {
    pending: pending.count ?? 0,
    approved: approved.count ?? 0,
    rejected: rejected.count ?? 0,
  };
}
