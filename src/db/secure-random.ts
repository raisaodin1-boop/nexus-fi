const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function fillRandomBytes(len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  // Native (Hermes/JSC) — lazy require avoids pulling RN in Node/Vitest.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getRandomValues } = require("expo-crypto") as typeof import("expo-crypto");
  getRandomValues(bytes);
  return bytes;
}

/** Cryptographically secure alphanumeric string (invite codes, tokens). */
export function secureRandomAlphanumeric(len: number, alphabet = INVITE_CHARS): string {
  if (len <= 0) return "";
  const bytes = fillRandomBytes(len);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function inviteCode(len = 6): string {
  return secureRandomAlphanumeric(len);
}
