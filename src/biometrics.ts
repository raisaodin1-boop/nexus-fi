/**
 * Biometric authentication — Face ID / Touch ID / Android fingerprint.
 *
 * Relies on OS-level check + Supabase session already on device (no password stored).
 */
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { storage } from "@/src/utils/storage";

const BIO_ENABLED_KEY = "bio_enabled";

export interface BiometricInfo {
  available: boolean;
  label: string;
}

export interface BiometricAuthResult {
  success: boolean;
  error?: "unavailable" | "cancelled" | "failed" | "web";
}

async function readEnabledFlag(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    if (await SecureStore.isAvailableAsync()) {
      const v = await SecureStore.getItemAsync(BIO_ENABLED_KEY);
      if (v === "1") return true;
    }
  } catch {
    /* fallback below */
  }
  const fallback = await storage.getItem<string | boolean>(BIO_ENABLED_KEY, "");
  return fallback === "1" || fallback === true;
}

async function writeEnabledFlag(enabled: boolean): Promise<boolean> {
  if (Platform.OS === "web") return false;
  let secureOk = false;
  try {
    if (await SecureStore.isAvailableAsync()) {
      if (enabled) {
        await SecureStore.setItemAsync(BIO_ENABLED_KEY, "1");
      } else {
        await SecureStore.deleteItemAsync(BIO_ENABLED_KEY);
        await SecureStore.deleteItemAsync("bio_email").catch(() => {});
        await SecureStore.deleteItemAsync("bio_password").catch(() => {});
      }
      secureOk = true;
    }
  } catch {
    secureOk = false;
  }
  const asyncOk = enabled
    ? await storage.setItem(BIO_ENABLED_KEY, "1")
    : await storage.removeItem(BIO_ENABLED_KEY);
  return secureOk || asyncOk;
}

export async function getBiometricInfo(): Promise<BiometricInfo> {
  if (Platform.OS === "web") return { available: false, label: "" };
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) return { available: false, label: "" };
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const label = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? (Platform.OS === "ios" ? "Face ID" : "Reconnaissance faciale")
      : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? (Platform.OS === "ios" ? "Touch ID" : "Empreinte digitale")
        : "Biométrie";
    return { available: true, label };
  } catch {
    return { available: false, label: "" };
  }
}

export async function authenticateBiometric(reason: string): Promise<boolean> {
  const result = await authenticateBiometricDetailed(reason);
  return result.success;
}

export async function authenticateBiometricDetailed(reason: string): Promise<BiometricAuthResult> {
  if (Platform.OS === "web") return { success: false, error: "web" };

  const info = await getBiometricInfo();
  if (!info.available) return { success: false, error: "unavailable" };

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "Annuler",
      ...(Platform.OS === "ios"
        ? { fallbackLabel: "Code de l'appareil", disableDeviceFallback: false }
        : { disableDeviceFallback: false }),
    });

    if (result.success) return { success: true };
    if (result.error === "user_cancel" || result.error === "system_cancel" || result.error === "app_cancel") {
      return { success: false, error: "cancelled" };
    }
    return { success: false, error: "failed" };
  } catch {
    return { success: false, error: "failed" };
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  return readEnabledFlag();
}

export async function setBiometricEnabled(enabled: boolean): Promise<boolean> {
  if (Platform.OS === "web") return false;
  return writeEnabledFlag(enabled);
}
