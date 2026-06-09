/**
 * HODIX Security Engine — client-side utilities.
 * Lightweight: no heavy libraries, pure JS + expo-device + expo-secure-store.
 */
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";

/* ── Key names in SecureStore ───────────────────────────────── */
const PIN_KEY = "hodix_wallet_pin_hash";
const PIN_ATTEMPTS_KEY = "hodix_pin_attempts";
const PIN_LOCKOUT_KEY = "hodix_pin_lockout_until";

/* ── PIN hashing (djb2 + user salt — no native crypto needed) ── */

export function hashPin(pin: string, salt: string): string {
  const raw = `hodix:${salt}:${pin}:v1`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h) ^ raw.charCodeAt(i);
    h = h >>> 0;
  }
  // Second pass for extra avalanche
  let h2 = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h2 ^= raw.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/* ── PIN storage (SecureStore — AES-256 on device, never leaves device) ── */

export async function storePinHash(hash: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, hash);
}

export async function getStoredPinHash(): Promise<string | null> {
  return SecureStore.getItemAsync(PIN_KEY);
}

export async function isPinSet(): Promise<boolean> {
  const h = await getStoredPinHash();
  return !!h;
}

/* ── PIN attempt throttling ─────────────────────────────────── */

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function checkPinLocked(): Promise<{ locked: boolean; minutesLeft: number }> {
  const until = await SecureStore.getItemAsync(PIN_LOCKOUT_KEY);
  if (!until) return { locked: false, minutesLeft: 0 };
  const t = Number(until);
  const now = Date.now();
  if (now >= t) {
    await SecureStore.deleteItemAsync(PIN_LOCKOUT_KEY);
    await SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY);
    return { locked: false, minutesLeft: 0 };
  }
  return { locked: true, minutesLeft: Math.ceil((t - now) / 60000) };
}

export async function recordPinAttempt(success: boolean): Promise<void> {
  if (success) {
    await SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY);
    await SecureStore.deleteItemAsync(PIN_LOCKOUT_KEY);
    return;
  }
  const current = Number(await SecureStore.getItemAsync(PIN_ATTEMPTS_KEY) ?? "0");
  const next = current + 1;
  if (next >= MAX_ATTEMPTS) {
    await SecureStore.setItemAsync(PIN_LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS));
    await SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY);
  } else {
    await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, String(next));
  }
}

export async function getRemainingAttempts(): Promise<number> {
  const current = Number(await SecureStore.getItemAsync(PIN_ATTEMPTS_KEY) ?? "0");
  return MAX_ATTEMPTS - current;
}

/* ── Emulator / rooted device detection ────────────────────── */

export function detectSuspiciousEnvironment(): { suspicious: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Emulator fingerprints
  const model = Device.modelName?.toLowerCase() ?? "";
  const isEmulator = !Device.isDevice;
  if (isEmulator) reasons.push("emulator");
  if (model.includes("generic") || model.includes("sdk") || model.includes("emulator"))
    reasons.push("emulator_model");

  // iOS simulator
  if (Platform.OS === "ios" && !Device.isDevice)
    reasons.push("ios_simulator");

  // Impossibly old device year (common in VMs)
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

const PIN_THRESHOLD = 5_000;    // XAF — require PIN above this
const OTP_THRESHOLD = 100_000;  // XAF — require OTP above this

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

/* ── OTP generation (client display only — stored server-side) ── */

export function formatOtpForDisplay(code: string): string {
  // "123456" → "123 456" for readability
  return code.slice(0, 3) + " " + code.slice(3);
}
