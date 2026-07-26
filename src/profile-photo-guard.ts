/**
 * Reject AI-generated profile photos (heuristics + EXIF / filename signals).
 * Real photos improve trust score and credibility — communicated in the UI.
 */

const AI_NAME_RE =
  /midjourney|dall[\s._-]?e|dalle|stable[\s._-]?diffusion|chatgpt|openai|leonardo[\s._-]?ai|firefly|bing[\s._-]?image|gemini[\s._-]?image|ideogram|flux[\s._-]?ai|generated[\s._-]?by[\s._-]?ai|ai[\s._-]?art|synthetic/i;

const AI_EXIF_RE =
  /midjourney|dall[\s.\-]?e|stable diffusion|openai|chatgpt|adobe firefly|leonardo|ideogram|flux\.1|generative|ai image|synthesized/i;

export const AI_PHOTO_REJECT_MESSAGE =
  "Les photos générées par IA sont refusées. Utilisez une photo réelle de vous — cela augmente votre Trust Score et votre crédibilité — ou choisissez un avatar générique.";

export const REAL_PHOTO_CREDIBILITY_TIP =
  "Une photo réelle augmente votre Trust Score et renforce la confiance des autres membres. Les photos IA sont refusées.";

function decodeBase64Prefix(base64: string, maxBytes = 65536): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/^data:image\/\w+;base64,/, "").replace(/[^A-Za-z0-9+/]/g, "");
  const needChars = Math.min(clean.length, Math.ceil(maxBytes * 4 / 3));
  const bytes = new Uint8Array(Math.floor(needChars * 3 / 4));
  let idx = 0;
  for (let i = 0; i + 3 < needChars; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = chars.indexOf(clean[i + 2]);
    const d = chars.indexOf(clean[i + 3]);
    if (a < 0 || b < 0) break;
    bytes[idx++] = (a << 2) | (b >> 4);
    if (c >= 0) bytes[idx++] = ((b & 0xf) << 4) | (c >> 2);
    if (d >= 0) bytes[idx++] = ((c & 0x3) << 6) | d;
    if (idx >= maxBytes) break;
  }
  return bytes.slice(0, idx);
}

function bytesToAscii(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    s += c >= 32 && c < 127 ? String.fromCharCode(c) : " ";
  }
  return s;
}

/** Scan JPEG/PNG binary for AI software tags in EXIF / text chunks. */
export function detectAiSignalsInImageBase64(base64: string): string | null {
  try {
    const bytes = decodeBase64Prefix(base64);
    const ascii = bytesToAscii(bytes);
    if (AI_EXIF_RE.test(ascii)) {
      const m = ascii.match(AI_EXIF_RE);
      return m ? `métadonnées (${m[0]})` : "métadonnées IA";
    }
  } catch {
    /* ignore decode errors */
  }
  return null;
}

export function detectAiSignalsFromMeta(opts: {
  fileName?: string | null;
  exif?: Record<string, unknown> | null;
}): string | null {
  if (opts.fileName && AI_NAME_RE.test(opts.fileName)) {
    return `nom de fichier (${opts.fileName})`;
  }
  if (opts.exif) {
    const blob = JSON.stringify(opts.exif);
    if (AI_EXIF_RE.test(blob) || AI_NAME_RE.test(blob)) {
      return "EXIF / métadonnées";
    }
    const software = String(opts.exif.Software ?? opts.exif.software ?? "");
    if (software && AI_EXIF_RE.test(software)) return `logiciel (${software})`;
  }
  return null;
}

export function assertNotAiPhoto(opts: {
  base64: string;
  fileName?: string | null;
  exif?: Record<string, unknown> | null;
}): void {
  const fromMeta = detectAiSignalsFromMeta(opts);
  if (fromMeta) {
    throw { status: 400, detail: AI_PHOTO_REJECT_MESSAGE };
  }
  const fromBytes = detectAiSignalsInImageBase64(opts.base64);
  if (fromBytes) {
    throw { status: 400, detail: AI_PHOTO_REJECT_MESSAGE };
  }
}
