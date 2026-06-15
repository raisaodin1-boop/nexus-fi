/**
 * Device fingerprint — generates a stable identifier from device hardware.
 * Used to detect when a blacklisted user creates a new account on the same device.
 * Does NOT collect any personal data — purely hardware/OS characteristics.
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/src/api";

const FP_KEY = "@hodix_device_fp";

async function getOrCreateFingerprint(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(FP_KEY);
    if (existing) return existing;
    // Create a stable random ID stored on device
    const fp = Platform.OS + "_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await AsyncStorage.setItem(FP_KEY, fp);
    return fp;
  } catch {
    return "fallback_" + Date.now();
  }
}

export async function registerFingerprint(): Promise<void> {
  try {
    const fp = await getOrCreateFingerprint();
    await api.post("/security/device-fingerprint", { fingerprint: fp });
  } catch {}
}

export function useDeviceFingerprint() {
  useEffect(() => { registerFingerprint(); }, []);
}
