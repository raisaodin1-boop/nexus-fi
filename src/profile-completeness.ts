/** Profile fields required before any in-app action (account may exist without them). */

export type ProfileActionFields = {
  phone?: string | null;
  city?: string | null;
  occupation?: string | null;
  photo_url?: string | null;
  avatar_kind?: string | null;
};

export function isFilled(value?: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Phone, profession, city + avatar choice (real or generic). */
export function isProfileActionReady(profile: ProfileActionFields | null | undefined): boolean {
  if (!profile) return false;
  const hasAvatar =
    isFilled(profile.avatar_kind) ||
    isFilled(profile.photo_url) ||
    (typeof (profile as { photo_base64?: string | null }).photo_base64 === "string" &&
      !!(profile as { photo_base64?: string | null }).photo_base64);
  return (
    isFilled(profile.phone) &&
    isFilled(profile.city) &&
    isFilled(profile.occupation) &&
    hasAvatar
  );
}

export function missingProfileActionFields(profile: ProfileActionFields | null | undefined): string[] {
  const missing: string[] = [];
  if (!isFilled(profile?.phone)) missing.push("téléphone");
  if (!isFilled(profile?.city)) missing.push("ville de résidence");
  if (!isFilled(profile?.occupation)) missing.push("profession");
  const hasAvatar =
    isFilled(profile?.avatar_kind) ||
    isFilled(profile?.photo_url);
  if (!hasAvatar) missing.push("photo de profil");
  return missing;
}

export const PROFILE_COMPLETION_ALLOWLIST = [
  "/complete-profile",
  "/welcome",
  "/landing",
  "/cgu",
  "/privacy",
  "/data-rights",
  "/verify",
  "/(auth)",
  "/login",
  "/register",
  "/auth",
] as const;

export function isProfileCompletionAllowedPath(pathname: string): boolean {
  return PROFILE_COMPLETION_ALLOWLIST.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p),
  );
}
