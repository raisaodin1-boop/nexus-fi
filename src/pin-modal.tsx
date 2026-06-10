/**
 * PIN modals — setup and confirmation.
 * PinSetupModal: first-time 4-digit PIN creation (enter + confirm).
 * PinConfirmModal: transaction confirmation with lockout logic.
 */
import React, { useRef, useState } from "react";
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { Colors, Radius, Spacing } from "@/src/theme";
import { api, formatXAF } from "@/src/api";
import {
  hashPin,
  hashPinLegacy,
  storePinHash,
  getStoredPinHash,
  checkPinLocked,
  recordPinAttempt,
  getRemainingAttempts,
} from "@/src/security";

// ─── Numpad ──────────────────────────────────────────────────────────────────

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "⌫"],
];

function Numpad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <View style={styles.numpad}>
      {KEYS.map((row, ri) => (
        <View key={ri} style={styles.numpadRow}>
          {row.map((key, ki) => {
            if (key === "") {
              return <View key={ki} style={styles.keyPlaceholder} />;
            }
            return (
              <TouchableOpacity
                key={ki}
                style={styles.key}
                onPress={() => onKey(key)}
                activeOpacity={0.7}
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

// ─── PIN Dots ─────────────────────────────────────────────────────────────────

function PinDots({ count, shake }: { count: number; shake: Animated.Value }) {
  return (
    <Animated.View
      style={[styles.dotsRow, { transform: [{ translateX: shake }] }]}
    >
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < count ? styles.dotFilled : styles.dotEmpty,
          ]}
        />
      ))}
    </Animated.View>
  );
}

// ─── Shake animation helper ───────────────────────────────────────────────────

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

// ─── PinSetupModal ────────────────────────────────────────────────────────────

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
      } else {
        // Confirm step
        if (next !== firstPin) {
          triggerShake();
          setError("Les PINs ne correspondent pas");
          setPin("");
        } else {
          setLoading(true);
          try {
            const h = await hashPin(next, userId);
            await storePinHash(h);
            await api.post("/wallet/pin/set", { pin_hash: h });
            reset();
            onSuccess();
          } catch {
            setError("Erreur lors de la sauvegarde du PIN.");
          } finally {
            setLoading(false);
          }
        }
      }
    }
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>
            {step === "enter" ? "Choisissez votre PIN à 4 chiffres" : "Confirmez votre PIN"}
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : <View style={{ height: 20 }} />}

          <PinDots count={pin.length} shake={shake} />

          <Numpad onKey={handleKey} />

          <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── PinConfirmModal ──────────────────────────────────────────────────────────

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
  const { shake, triggerShake } = usePinShake();

  const reset = () => {
    setPin("");
    setError(null);
  };

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
      setLoading(true);
      try {
        const lockStatus = await checkPinLocked();
        if (lockStatus.locked) {
          setError(`PIN bloqué — réessayez dans ${lockStatus.minutesLeft} minute${lockStatus.minutesLeft > 1 ? "s" : ""}`);
          setPin("");
          setLoading(false);
          return;
        }

        const stored = await getStoredPinHash();
        const h = await hashPin(next, userId);

        // PINs created before the SHA-256 upgrade were stored with the
        // legacy hash — accept once, then transparently re-store as v2.
        let valid = h === stored;
        if (!valid && stored && stored === hashPinLegacy(next, userId)) {
          valid = true;
          await storePinHash(h);
          api.post("/wallet/pin/set", { pin_hash: h }).catch(() => {});
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
            setError(`PIN incorrect (${remaining} essai${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""})`);
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

  const handleCancel = () => {
    reset();
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>Entrez votre PIN</Text>
          {amount !== undefined && (
            <Text style={styles.amountLabel}>
              Confirmer {formatXAF(amount)}
            </Text>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : <View style={{ height: 20 }} />}

          <PinDots count={pin.length} shake={shake} />

          <Numpad onKey={handleKey} />

          <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    marginBottom: Spacing.sm,
  },
  errorText: {
    fontSize: 13,
    color: Colors.danger,
    textAlign: "center",
    height: 20,
    marginBottom: Spacing.sm,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 16,
    marginVertical: Spacing.xl,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dotFilled: {
    backgroundColor: Colors.primary,
  },
  dotEmpty: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  numpad: {
    gap: 12,
    marginTop: Spacing.lg,
    width: "100%",
    alignItems: "center",
  },
  numpadRow: {
    flexDirection: "row",
    gap: 20,
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
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
  keyPlaceholder: {
    width: 72,
    height: 72,
  },
  cancelBtn: {
    marginTop: Spacing.xl,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textMuted,
  },
});
