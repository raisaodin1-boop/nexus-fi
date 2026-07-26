/** Preset avatars — no AI, no upload. Stored as photo_url = generic:{id}. */

export type GenericAvatar = {
  id: string;
  label: string;
  bg: string;
  fg: string;
};

export const GENERIC_AVATARS: GenericAvatar[] = [
  { id: "1", label: "Or", bg: "#D4AF37", fg: "#111827" },
  { id: "2", label: "Teal", bg: "#0F766E", fg: "#FFFFFF" },
  { id: "3", label: "Navy", bg: "#1E3A5F", fg: "#FFFFFF" },
  { id: "4", label: "Terracotta", bg: "#C2410C", fg: "#FFFFFF" },
  { id: "5", label: "Forest", bg: "#166534", fg: "#FFFFFF" },
  { id: "6", label: "Slate", bg: "#475569", fg: "#FFFFFF" },
];

export function genericPhotoUrl(id: string): string {
  return `generic:${id}`;
}

export function parseGenericAvatarId(photoUrl?: string | null): string | null {
  if (!photoUrl?.startsWith("generic:")) return null;
  return photoUrl.slice("generic:".length) || null;
}

export function getGenericAvatar(photoUrl?: string | null): GenericAvatar | null {
  const id = parseGenericAvatarId(photoUrl);
  if (!id) return null;
  return GENERIC_AVATARS.find((a) => a.id === id) ?? null;
}
