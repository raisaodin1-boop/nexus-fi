/** Canonical origin — always use www for Search Console consistency. */
export const SITE_ORIGIN = "https://www.hodix.app";

export const OG_IMAGE_URL = `${SITE_ORIGIN}/og-image.png`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** Routes that require authentication — noindex + excluded from sitemaps. */
export const NOINDEX_PATH_PREFIXES = [
  "/wallet",
  "/groups",
  "/savings",
  "/identity",
  "/profile",
  "/kyc",
  "/notifications",
  "/admin",
  "/documents",
  "/streaks",
  "/ranking",
  "/referral",
  "/credit-score",
  "/pay",
  "/payments",
  "/messages",
  "/alerts",
  "/analytics",
  "/complete-profile",
  "/onboarding",
  "/qr-",
  "/receipt",
  "/withdraw",
  "/fee-config",
  "/promotion-request",
  "/family",
  "/funds",
  "/cooperatives/",
  "/associations/",
  "/tontines/",
  "/savings/",
  "/auth/",
] as const;

/** Public marketing / legal pages safe for indexing. */
export const INDEXABLE_PATHS = [
  "/",
  "/welcome",
  "/login",
  "/register",
  "/tontines/create",
  "/tontines/join",
  "/tontines/directory",
  "/tontines/leaderboard",
  "/cooperatives/create",
  "/associations/create",
  "/privacy",
  "/cgu",
  "/data-rights",
  "/seo.html",
] as const;

export function isNoindexPath(pathname: string): boolean {
  const path = pathname || "/";
  if (path === "/tontines/create" || path === "/tontines/join" || path === "/tontines/directory" || path === "/tontines/leaderboard") {
    return false;
  }
  if (path === "/cooperatives/create" || path === "/associations/create") {
    return false;
  }
  return NOINDEX_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function absoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
