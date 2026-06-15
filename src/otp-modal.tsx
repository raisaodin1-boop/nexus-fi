/**
 * OTP verification modal.
 * Auto-generates an OTP on mount, shows a 6-digit input, handles resend cooldown.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors, Radius, Spacing } from "@/src/theme";
import { api, formatXAF } from "@/src/api";
import { Button } from "@/src/ui";

const RESEND_COOLDOWN = 60; // seconds
const OTP_VALIDITY = 10 * 60; // 10 minutes in seconds — default if expires_at not parseable

interface OtpModalProps {
  visible: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  amountXaf?: number;
}

export function OtpModal({ visible, onSuccess, onCancel, amountXaf }: OtpModalProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deliveryHint, setDeliveryHint] = useState("Un code a été envoyé par notification à votre appareil");

  // Resend cooldown (seconds)
  const [resendCooldown, setResendCooldown] = useState(0);
  // OTP expiry countdown (seconds)
  const [expiresIn, setExpiresIn] = useState<number | null>(null);

  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
  };

  const startResendCooldown = () => {
    setResendCooldown(RESEND_COOLDOWN);
    resendTimerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(resendTimerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startExpiryCountdown = (expiresAt: string | null) => {
    let secs: number;
    if (expiresAt) {
      secs = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    } else {
      secs = OTP_VALIDITY;
    }
    setExpiresIn(secs);
    expiryTimerRef.current = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(expiryTimerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const generateOtp = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.post<{ expires_at?: string; delivery?: "sms" | "app"; phone_masked?: string | null }>("/wallet/otp/generate");
      setDeliveryHint(
        res?.delivery === "sms"
          ? `Un code a été envoyé par SMS au ${res.phone_masked ?? "numéro enregistré"}`
          : "Un code a été envoyé dans vos notifications Hodix",
      );
      startResendCooldown();
      startExpiryCountdown(res?.expires_at ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Impossible d'envoyer le code. Réessayez.");
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setCode("");
      setError(null);
      clearTimers();
      generateOtp();
    } else {
      clearTimers();
    }
    return clearTimers;
  }, [visible]);

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError("Entrez le code à 6 chiffres.");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const res = await api.post<{ valid: boolean; reason?: string }>("/wallet/otp/verify", { code });
      if (res?.valid) {
        clearTimers();
        onSuccess();
      } else {
        setError(res?.reason ?? "Code incorrect ou expiré.");
      }
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? "Erreur de vérification.");
    } finally {
      setVerifying(false);
    }
  };

  const formatExpiry = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>Vérification par code</Text>

          {amountXaf !== undefined && (
            <Text style={styles.amountLabel}>Confirmer {formatXAF(amountXaf)}</Text>
          )}

          {generating ? (
            <View style={styles.generatingRow}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.generatingText}>Envoi du code...</Text>
            </View>
          ) : (
            <Text style={styles.hint}>{deliveryHint}</Text>
          )}

          {expiresIn !== null && expiresIn > 0 && (
            <Text style={styles.timer}>Expire dans {formatExpiry(expiresIn)}</Text>
          )}
          {expiresIn === 0 && (
            <Text style={[styles.timer, { color: Colors.danger }]}>Code expiré</Text>
          )}

          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            placeholderTextColor={Colors.textSubtle}
            textAlign="center"
            autoFocus
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actionsCol}>
            <Button
              label="Vérifier"
              onPress={handleVerify}
              loading={verifying}
              disabled={code.length !== 6 || generating}
            />

            <TouchableOpacity
              disabled={resendCooldown > 0 || generating}
              onPress={() => {
                clearTimers();
                generateOtp();
              }}
              style={styles.resendBtn}
            >
              <Text
                style={[
                  styles.resendText,
                  (resendCooldown > 0 || generating) && styles.resendDisabled,
                ]}
              >
                {resendCooldown > 0
                  ? `Renvoyer le code (${resendCooldown}s)`
                  : "Renvoyer le code"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.xxl,
    paddingBottom: 40,
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  amountLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.primary,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  generatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: Spacing.md,
  },
  generatingText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  hint: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  timer: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.warning,
    marginBottom: Spacing.md,
  },
  codeInput: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 12,
    color: Colors.text,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 24,
    paddingVertical: 16,
    width: "100%",
    textAlign: "center",
    marginVertical: Spacing.lg,
  },
  errorText: {
    fontSize: 13,
    color: Colors.danger,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  actionsCol: {
    width: "100%",
    gap: 8,
    marginTop: Spacing.sm,
  },
  resendBtn: {
    paddingVertical: 10,
    alignItems: "center",
  },
  resendText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.primary,
  },
  resendDisabled: {
    color: Colors.textSubtle,
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textMuted,
  },
});
