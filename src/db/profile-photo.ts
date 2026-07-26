import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";
import { secureRandomAlphanumeric } from "./secure-random";
import { assertNotAiPhoto } from "@/src/profile-photo-guard";
import { GENERIC_AVATARS, genericPhotoUrl } from "@/src/generic-avatars";
import { notifyUser } from "./notifications";
import { isProfileActionReady, missingProfileActionFields } from "@/src/profile-completeness";

const BUCKET = "avatars";
const REAL_PHOTO_BONUS_POINTS = 15;
const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function base64ToUint8Array(base64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/^data:image\/\w+;base64,/, "").replace(/[^A-Za-z0-9+/]/g, "");
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

export async function uploadProfilePhoto(opts: {
  base64: string;
  mime?: string;
  fileName?: string | null;
  exif?: Record<string, unknown> | null;
}): Promise<{ photo_url: string; avatar_kind: "real" }> {
  const me = await uid();
  assertNotAiPhoto({
    base64: opts.base64,
    fileName: opts.fileName,
    exif: opts.exif,
  });

  const mime = opts.mime ?? "image/jpeg";
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const path = `${me}/avatar-${secureRandomAlphanumeric(12)}.${ext}`;
  const data = base64ToUint8Array(opts.base64);
  if (data.length === 0) throw { status: 400, detail: "Image vide ou encodage invalide." };
  if (data.length > 3_145_728) throw { status: 400, detail: "Image trop lourde (max 3 Mo)." };

  const sb = getSupabase();
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, data, { contentType: mime, upsert: true });
  throwSb(upErr);

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const photo_url = pub.publicUrl;

  const { error } = await sb
    .from("profiles")
    .update({
      photo_url,
      avatar_kind: "real",
      updated_at: new Date().toISOString(),
    })
    .eq("id", me);
  throwSb(error);

  // One-time credibility bonus for a real (non-AI) photo.
  try {
    const { data: existing } = await sb
      .from("identity_events")
      .select("id")
      .eq("user_id", me)
      .eq("event_type", "photo_real")
      .limit(1);
    if (!existing?.length) {
      await sb.from("identity_events").insert({
        user_id: me,
        event_type: "photo_real",
        points_delta: REAL_PHOTO_BONUS_POINTS,
      });
    }
  } catch { /* best-effort */ }

  return { photo_url, avatar_kind: "real" };
}

export async function setGenericAvatar(avatarId: string): Promise<{ photo_url: string; avatar_kind: "generic" }> {
  const me = await uid();
  if (!GENERIC_AVATARS.some((a) => a.id === avatarId)) {
    throw { status: 400, detail: "Avatar générique invalide." };
  }
  const photo_url = genericPhotoUrl(avatarId);
  const { error } = await getSupabase()
    .from("profiles")
    .update({
      photo_url,
      avatar_kind: "generic",
      updated_at: new Date().toISOString(),
    })
    .eq("id", me);
  throwSb(error);
  return { photo_url, avatar_kind: "generic" };
}

/** In-app reminder for existing incomplete profiles (cooldown 7 days). */
export async function maybeRemindIncompleteProfile(userId: string): Promise<void> {
  const sb = getSupabase();
  const { data: profile } = await sb
    .from("profiles")
    .select("phone,city,occupation,photo_url,avatar_kind,profile_reminder_sent_at,full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || isProfileActionReady(profile)) return;

  const last = profile.profile_reminder_sent_at
    ? new Date(profile.profile_reminder_sent_at).getTime()
    : 0;
  if (last && Date.now() - last < REMINDER_COOLDOWN_MS) return;

  const missing = missingProfileActionFields(profile).join(", ");
  await notifyUser({
    user_id: userId,
    title: "Complétez votre profil",
    body: `Avant d'utiliser HODIX, renseignez : ${missing}. Une photo réelle augmente votre Trust Score et votre crédibilité (les photos IA sont refusées).`,
    type: "profile_reminder",
    metadata: { action_url: "/complete-profile" },
  });

  await sb
    .from("profiles")
    .update({ profile_reminder_sent_at: new Date().toISOString() })
    .eq("id", userId);
}
