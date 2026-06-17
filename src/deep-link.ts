import { decodeQR } from "@/src/qr-payment";

const WEB_ORIGINS = ["https://www.hodix.app", "https://hodix.app", "http://localhost:8081", "http://localhost:19006"];

/** Map hodix:// or https:// URLs to Expo Router paths (with query string). */
export function parseDeepLink(url: string): string | null {
  if (!url?.trim()) return null;

  try {
    if (url.startsWith("hodix://")) {
      return parseHodixScheme(url);
    }

    const u = new URL(url);
    if (!WEB_ORIGINS.some((o) => url.startsWith(o))) return null;

    const path = `${u.pathname}${u.search}${u.hash}`;
    if (path === "/" || path === "") return "/";
    return path;
  } catch {
    return null;
  }
}

function parseHodixScheme(url: string): string | null {
  const pay = decodeQR(url);
  if (pay) {
    const params = new URLSearchParams({ to: pay.to, name: pay.name });
    if (pay.amount) params.set("amount", String(pay.amount));
    return `/wallet/transfer?${params.toString()}`;
  }

  const u = new URL(url);
  const host = u.hostname;
  const path = u.pathname;

  if (host === "auth" && path.startsWith("/callback")) {
    return `/auth/callback${u.search}${url.includes("#") ? url.slice(url.indexOf("#")) : ""}`;
  }

  if (host === "join") {
    const code = u.searchParams.get("code");
    const type = u.searchParams.get("type") ?? "tontines";
    const base =
      type === "associations" ? "/associations/join"
      : type === "cooperatives" ? "/cooperatives/join"
      : "/tontines/join";
    return code ? `${base}?code=${encodeURIComponent(code)}` : base;
  }

  if (host && host !== "pay") {
    const route = path && path !== "/" ? path : `/${host}`;
    return `${route}${u.search}`;
  }

  return null;
}
