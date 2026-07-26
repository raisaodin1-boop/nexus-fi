/**
 * HODIX Security Engine — client-side utilities.
 * Lightweight: no heavy libraries, pure JS + expo-device + secure storage.
 */
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* ── Key names ───────────────────────────────────────────── */
const PIN_KEY = "hodix_wallet_pin_hash";
const PIN_ATTEMPTS_KEY = "hodix_pin_attempts";
const PIN_LOCKOUT_KEY = "hodix_pin_lockout_until";

/* ── PIN hashing ─────────────────────────────────────────── */
// v2: SHA-256 (expo-crypto), iterated to slow down offline brute-force.
// Do NOT change PIN_ITERATIONS — it would invalidate existing hashes.
const PIN_ITERATIONS = 10_000;

export async function hashPin(pin: string, salt: string): Promise<string> {
  if (!salt?.trim()) throw new Error("Identifiant utilisateur requis pour le PIN.");
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN invalide.");
  let digest = `hodix:${salt}:${pin}:v2`;
  for (let i = 0; i < PIN_ITERATIONS; i++) {
    digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, digest);
  }
  return digest;
}

export function hashPinLegacy(pin: string, salt: string): string {
  const raw = `hodix:${salt}:${pin}:v1`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h) ^ raw.charCodeAt(i);
    h = h >>> 0;
  }
  let h2 = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h2 ^= raw.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/* ── Durable PIN storage (SecureStore + AsyncStorage web/fallback) ── */
// Raw string values (not JSON) so existing SecureStore hashes keep working.

async function durableSet(key: string, value: string): Promise<void> {
  let secureOk = false;
  if (Platform.OS !== "web") {
    try {
      await SecureStore.setItemAsync(key, value);
      secureOk = true;
    } catch (e) {
      console.warn("[security] SecureStore set failed, falling back", e);
    }
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch (e) {
    if (!secureOk) throw e instanceof Error ? e : new Error("Stockage PIN impossible.");
  }
}

async function durableGet(key: string): Promise<string | null> {
  if (Platform.OS !== "web") {
    try {
      const v = await SecureStore.getItemAsync(key);
      if (v) return v;
    } catch (e) {
      console.warn("[security] SecureStore get failed, falling back", e);
    }
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function durableDelete(key: string): Promise<void> {
  if (Platform.OS !== "web") {
    try { await SecureStore.deleteItemAsync(key); } catch { /* ignore */ }
  }
  try { await AsyncStorage.removeItem(key); } catch { /* ignore */ }
}

export async function storePinHash(hash: string): Promise<void> {
  if (!hash?.trim()) throw new Error("Hash PIN vide.");
  await durableSet(PIN_KEY, hash.trim());
}

export async function getStoredPinHash(): Promise<string | null> {
  const h = await durableGet(PIN_KEY);
  return h?.trim() || null;
}

export async function clearStoredPinHash(): Promise<void> {
  await durableDelete(PIN_KEY);
}

export async function isPinSet(): Promise<boolean> {
  const h = await getStoredPinHash();
  return !!h;
}

/* ── PIN attempt throttling ─────────────────────────────────── */

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function checkPinLocked(): Promise<{ locked: boolean; minutesLeft: number }> {
  const until = await durableGet(PIN_LOCKOUT_KEY);
  if (!until) return { locked: false, minutesLeft: 0 };
  const t = Number(until);
  const now = Date.now();
  if (now >= t) {
    await durableDelete(PIN_LOCKOUT_KEY);
    await durableDelete(PIN_ATTEMPTS_KEY);
    return { locked: false, minutesLeft: 0 };
  }
  return { locked: true, minutesLeft: Math.ceil((t - now) / 60000) };
}

export async function recordPinAttempt(success: boolean): Promise<void> {
  if (success) {
    await durableDelete(PIN_ATTEMPTS_KEY);
    await durableDelete(PIN_LOCKOUT_KEY);
    return;
  }
  const current = Number((await durableGet(PIN_ATTEMPTS_KEY)) ?? "0");
  const next = current + 1;
  if (next >= MAX_ATTEMPTS) {
    await durableSet(PIN_LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS));
    await durableDelete(PIN_ATTEMPTS_KEY);
  } else {
    await durableSet(PIN_ATTEMPTS_KEY, String(next));
  }
}

export async function getRemainingAttempts(): Promise<number> {
  const current = Number((await durableGet(PIN_ATTEMPTS_KEY)) ?? "0");
  return MAX_ATTEMPTS - current;
}

/* ── Emulator / rooted device detection ────────────────────── */

export function detectSuspiciousEnvironment(): { suspicious: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const model = Device.modelName?.toLowerCase() ?? "";
  const isEmulator = !Device.isDevice;
  if (isEmulator) reasons.push("emulator");
  if (model.includes("generic") || model.includes("sdk") || model.includes("emulator"))
    reasons.push("emulator_model");

  if (Platform.OS === "ios" && !Device.isDevice)
    reasons.push("ios_simulator");

  if (Device.deviceYearClass && Device.deviceYearClass < 2015)
    reasons.push("old_device");

  return { suspicious: reasons.length > 0, reasons };
}

/* ── Transaction risk scoring (client-side pre-check) ──────── */

export interface RiskCheck {
  level: "low" | "medium" | "high";
  requiresPin: boolean;
  requiresOtp: boolean;
  flags: string[];
}

const PIN_THRESHOLD = 5_000;
const OTP_THRESHOLD = 100_000;

export function assessTransactionRisk(
  amount: number,
  isNewRecipient: boolean,
  isNewDevice: boolean,
  avgMonthlyAmount: number,
): RiskCheck {
  const flags: string[] = [];

  if (amount >= OTP_THRESHOLD) flags.push("high_amount");
  if (amount > avgMonthlyAmount * 2 && avgMonthlyAmount > 0) flags.push("unusual_amount");
  if (isNewRecipient) flags.push("new_recipient");
  if (isNewDevice) flags.push("new_device");

  const isHigh = flags.includes("high_amount") || (flags.includes("new_device") && amount > PIN_THRESHOLD);
  const isMedium = !isHigh && flags.length > 0;

  return {
    level: isHigh ? "high" : isMedium ? "medium" : "low",
    requiresPin: amount >= PIN_THRESHOLD,
    requiresOtp: isHigh,
    flags,
  };
}

export function formatOtpForDisplay(code: string): string {
  return code.slice(0, 3) + " " + code.slice(3);
}
