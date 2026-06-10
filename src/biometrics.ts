/**
 * Biometric authentication — Face ID / Touch ID / Android fingerprint.
 *
 * The biometric unlock relies on the OS-level check + the Supabase session
 * already persisted on the device: no password is ever stored.
 */
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIO_ENABLED_KEY = "bio_enabled";

export interface BiometricInfo {
  available: boolean;
  /** Human-readable label for the strongest available method. */
  label: string;
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
  if (Platform.OS === "web") return false;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "Annuler",
      fallbackLabel: "Utiliser le code de l'appareil",
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    return (await SecureStore.getItemAsync(BIO_ENABLED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await SecureStore.setItemAsync(BIO_ENABLED_KEY, "1");
    } else {
      await SecureStore.deleteItemAsync(BIO_ENABLED_KEY);
      // legacy keys from the old (never-functional) credential-storage flow
      await SecureStore.deleteItemAsync("bio_email");
      await SecureStore.deleteItemAsync("bio_password");
    }
  } catch {}
}
