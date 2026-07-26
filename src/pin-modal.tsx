/**
 * PIN modals — setup and confirmation.
 * PinSetupModal: first-time 4-digit PIN creation (enter + confirm).
 * PinConfirmModal: transaction confirmation with lockout + server verify.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Radius, Spacing } from "@/src/theme";
import { api, ApiError, formatXAF } from "@/src/api";
import {
  hashPin,
  hashPinLegacy,
  storePinHash,
  getStoredPinHash,
  checkPinLocked,
  recordPinAttempt,
  getRemainingAttempts,
} from "@/src/security";
import { getBiometricInfo, isBiometricEnabled, authenticateBiometric } from "@/src/biometrics";
import { MIN_TOUCH } from "@/src/hooks/use-responsive";

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "⌫"],
];

function useKeySize() {
  const { width } = useWindowDimensions();
  // Fit 3 keys + gaps on narrow phones (320–360)
  if (width < 360) return 64;
  if (width < 400) return 68;
  return 72;
}

function Numpad({ onKey, disabled }: { onKey: (k: string) => void; disabled?: boolean }) {
  const keySize = useKeySize();
  return (
    <View style={styles.numpad}>
      {KEYS.map((row, ri) => (
        <View key={ri} style={styles.numpadRow}>
          {row.map((key, ki) => {
            if (key === "") {
              return <View key={ki} style={{ width: keySize, height: keySize }} />;
            }
            return (
              <TouchableOpacity
                key={ki}
                style={[styles.key, { width: keySize, height: keySize, borderRadius: keySize / 2 }, disabled && { opacity: 0.45 }]}
                onPress={() => onKey(key)}
                activeOpacity={0.7}
                disabled={disabled}
                hitSlop={4}
              >
                <Text style={styles.keyText}>{key}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function PinDots({ count, shake }: { count: number; shake: Animated.Value }) {
  return (
    <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shake }] }]}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.dot, i < count ? styles.dotFilled : styles.dotEmpty]} />
      ))}
    </Animated.View>
  );
}

function usePinShake() {
  const shake = useRef(new Animated.Value(0)).current;
  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };
  return { shake, triggerShake };
}

function SheetShell({
  children,
  onRequestClose,
}: {
  children: React.ReactNode;
  onRequestClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { maxHeight: height * 0.92, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          <View style={styles.handle} />
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetScroll}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

interface PinSetupModalProps {
  visible: boolean;
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PinSetupModal({ visible, userId, onSuccess, onCancel }: PinSetupModalProps) {
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [firstPin, setFirstPin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { shake, triggerShake } = usePinShake();

  const reset = () => {
    setStep("enter");
    setFirstPin("");
    setPin("");
    setError(null);
  };

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  const handleKey = async (key: string) => {
    if (loading) return;
    if (key === "⌫") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = pin + key;
    if (next.length > 4) return;
    setPin(next);

    if (next.length === 4) {
      if (step === "enter") {
        setFirstPin(next);
        setPin("");
        setStep("confirm");
        setError(null);
      } else if (next !== firstPin) {
        triggerShake();
        setError("Les PINs ne correspondent pas");
        setPin("");
      } else {
        if (!userId?.trim()) {
          setError("Session invalide — reconnectez-vous.");
          setPin("");
          return;
        }
        setLoading(true);
        setError(null);
        try {
          const h = await hashPin(next, userId);
          // Server first so status UI reflects truth; then cache on device
          await api.post("/wallet/pin/set", { pin_hash: h });
          await storePinHash(h);
          reset();
          onSuccess();
        } catch (e) {
          const msg = e instanceof ApiError
            ? e.detail
            : e instanceof Error
              ? e.message
              : "Erreur lors de la sauvegarde du PIN.";
          setError(msg);
          setPin("");
        } finally {
          setLoading(false);
        }
      }
    }
  };

  if (!visible) return null;

  return (
    <SheetShell onRequestClose={() => { reset(); onCancel(); }}>
      <Text style={styles.title}>
        {step === "enter" ? "Choisissez votre PIN à 4 chiffres" : "Confirmez votre PIN"}
      </Text>
      <Text style={styles.subtitle}>
        Requis pour les transactions ≥ 5 000 XAF. Mémorisez-le — il sécurise votre wallet.
      </Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Enregistrement sécurisé…</Text>
        </View>
      ) : (
        <>
          {error ? <Text style={styles.errorText}>{error}</Text> : <View style={{ height: 20 }} />}
          <PinDots count={pin.length} shake={shake} />
          <Numpad onKey={handleKey} disabled={loading} />
        </>
      )}

      <TouchableOpacity
        onPress={() => { reset(); onCancel(); }}
        style={styles.cancelBtn}
        disabled={loading}
        hitSlop={8}
      >
        <Text style={styles.cancelText}>Annuler</Text>
      </TouchableOpacity>
    </SheetShell>
  );
}

interface PinConfirmModalProps {
  visible: boolean;
  userId: string;
  amount?: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PinConfirmModal({ visible, userId, amount, onSuccess, onCancel }: PinConfirmModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bioLabel, setBioLabel] = useState<string | null>(null);
  const { shake, triggerShake } = usePinShake();

  const reset = () => {
    setPin("");
    setError(null);
  };

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  const tryBiometric = async () => {
    if (!userId?.trim()) {
      setError("Session invalide — reconnectez-vous.");
      return;
    }
    const stored = await getStoredPinHash();
    // Biometrics only if PIN already cached on device
    if (!stored) {
      setError("Entrez votre PIN une fois pour activer la biométrie sur cet appareil.");
      return;
    }
    const ok = await authenticateBiometric(
      amount !== undefined ? `Confirmer ${formatXAF(amount)}` : "Confirmer la transaction",
    );
    if (ok) {
      await recordPinAttempt(true);
      reset();
      onSuccess();
    }
  };

  useEffect(() => {
    if (!visible) return;
    let active = true;
    (async () => {
      if (!(await isBiometricEnabled())) return;
      const info = await getBiometricInfo();
      if (!active || !info.available) return;
      setBioLabel(info.label);
      tryBiometric();
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleKey = async (key: string) => {
    if (loading) return;
    if (key === "⌫") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = pin + key;
    if (next.length > 4) return;
    setPin(next);

    if (next.length === 4) {
      if (!userId?.trim()) {
        setError("Session invalide — reconnectez-vous.");
        setPin("");
        return;
      }
      setLoading(true);
      try {
        const lockStatus = await checkPinLocked();
        if (lockStatus.locked) {
          setError(`PIN bloqué — réessayez dans ${lockStatus.minutesLeft} minute${lockStatus.minutesLeft > 1 ? "s" : ""}`);
          setPin("");
          return;
        }

        const h = await hashPin(next, userId);
        const stored = await getStoredPinHash();

        let valid = !!stored && h === stored;

        // Legacy local hash migrate
        if (!valid && stored && stored === hashPinLegacy(next, userId)) {
          valid = true;
          await storePinHash(h);
          api.post("/wallet/pin/set", { pin_hash: h }).catch(() => {});
        }

        // Server is source of truth (new device / cleared storage)
        if (!valid) {
          try {
            const res = await api.post<{ valid: boolean }>("/wallet/pin/verify", { pin_hash: h });
            valid = !!res?.valid;
            if (valid) await storePinHash(h);
          } catch {
            // keep valid=false
          }
        }

        if (valid) {
          await recordPinAttempt(true);
          reset();
          onSuccess();
        } else {
          await recordPinAttempt(false);
          const remaining = await getRemainingAttempts();
          triggerShake();
          if (remaining <= 0) {
            setError("PIN bloqué — réessayez dans 30 minutes");
          } else {
            // Distinguish "no pin on server" vs wrong pin
            const status = await api.get<{ has_pin: boolean }>("/wallet/pin/status").catch(() => null);
            if (status && !status.has_pin) {
              setError("Aucun PIN configuré. Allez dans Wallet → Sécurité.");
            } else {
              setError(`PIN incorrect (${remaining} essai${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""})`);
            }
          }
          setPin("");
        }
      } catch {
        setError("Erreur de vérification.");
        setPin("");
      } finally {
        setLoading(false);
      }
    }
  };

  if (!visible) return null;

  return (
    <SheetShell onRequestClose={() => { reset(); onCancel(); }}>
      <Text style={styles.title}>Entrez votre PIN</Text>
      {amount !== undefined ? (
        <Text style={styles.amountLabel}>Confirmer {formatXAF(amount)}</Text>
      ) : null}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Vérification…</Text>
        </View>
      ) : (
        <>
          {error ? <Text style={styles.errorText}>{error}</Text> : <View style={{ height: 20 }} />}
          <PinDots count={pin.length} shake={shake} />
          <Numpad onKey={handleKey} disabled={loading} />
        </>
      )}

      {bioLabel ? (
        <TouchableOpacity onPress={tryBiometric} style={styles.bioBtn} disabled={loading}>
          <Text style={styles.bioBtnText}>Utiliser {bioLabel}</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        onPress={() => { reset(); onCancel(); }}
        style={styles.cancelBtn}
        disabled={loading}
        hitSlop={8}
      >
        <Text style={styles.cancelText}>Annuler</Text>
      </TouchableOpacity>
    </SheetShell>
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
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    width: "100%",
    alignSelf: "center",
    maxWidth: 480,
  },
  sheetScroll: {
    alignItems: "center",
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: Spacing.lg,
    alignSelf: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 17,
    marginBottom: Spacing.sm,
    paddingHorizontal: 12,
  },
  amountLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.primary,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  errorText: {
    fontSize: 13,
    color: Colors.danger,
    textAlign: "center",
    minHeight: 20,
    marginBottom: Spacing.sm,
    paddingHorizontal: 8,
  },
  loadingBox: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 36,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textMuted,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 16,
    marginVertical: Spacing.lg,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  dotFilled: { backgroundColor: Colors.primary },
  dotEmpty: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  numpad: {
    gap: 10,
    marginTop: Spacing.md,
    width: "100%",
    alignItems: "center",
  },
  numpadRow: {
    flexDirection: "row",
    gap: 16,
  },
  key: {
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.08)" } as any,
    }),
  },
  keyText: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.text,
  },
  bioBtn: {
    marginTop: Spacing.lg,
    minHeight: MIN_TOUCH,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
  },
  bioBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.primaryDark,
  },
  cancelBtn: {
    marginTop: Spacing.lg,
    minHeight: MIN_TOUCH,
    paddingVertical: 12,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textMuted,
    textAlign: "center",
  },
});
