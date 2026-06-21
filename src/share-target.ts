import { parseDeepLink } from "@/src/deep-link";

export interface ShareTargetParams {
  title?: string;
  text?: string;
  url?: string;
}

/** Resolve a Web Share Target payload to an Expo Router path. */
export function routeFromShareTarget(params: ShareTargetParams): string {
  const title = decodeParam(params.title);
  const text = decodeParam(params.text);
  const url = decodeParam(params.url);
  const combined = [url, text, title].filter(Boolean).join("\n");

  if (url) {
    const fromUrl = parseDeepLink(url);
    if (fromUrl) return fromUrl;
  }

  const hodixUrl = combined.match(/https?:\/\/(?:www\.)?hodix\.app[^\s"'<>]*/i)?.[0];
  if (hodixUrl) {
    const fromHodix = parseDeepLink(hodixUrl);
    if (fromHodix) return fromHodix;
  }

  const hodixScheme = combined.match(/hodix:\/\/[^\s"'<>]+/i)?.[0];
  if (hodixScheme) {
    const fromScheme = parseDeepLink(hodixScheme);
    if (fromScheme) return fromScheme;
  }

  const joinUrlCode = combined.match(/\/(?:tontines|associations|cooperatives)\/join\?code=([A-Za-z0-9]+)/i);
  if (joinUrlCode) {
    const base = combined.includes("/associations/") ? "/associations/join"
      : combined.includes("/cooperatives/") ? "/cooperatives/join"
      : "/tontines/join";
    return `${base}?code=${encodeURIComponent(joinUrlCode[1].toUpperCase())}`;
  }

  const codePatterns = [
    /code\s*[:：]\s*\*?([A-Z0-9]{4,12})\*?/i,
    /invite[_\s-]?code\s*[:=]\s*([A-Z0-9]{4,12})/i,
    /rejoindre[^A-Z0-9]*([A-Z0-9]{5,12})/i,
  ];

  for (const pattern of codePatterns) {
    const match = combined.match(pattern);
    if (match?.[1]) {
      return `/tontines/join?code=${encodeURIComponent(match[1].toUpperCase())}`;
    }
  }

  return "/tontines/join";
}

function decodeParam(value?: string): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}
