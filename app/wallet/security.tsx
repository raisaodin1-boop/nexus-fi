import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import {
  Shield,
  ShieldOff,
  Lock,
  Key,
  AlertTriangle,
  Clock,
  CheckCircle,
  Eye,
} from "lucide-react-native";
import { api } from "@/src/api";
import { Card, Button } from "@/src/ui";
import { Colors, Spacing } from "@/src/theme";
import { detectSuspiciousEnvironment } from "@/src/security";

// ─── Event label map ──────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  pin_set: { label: "PIN configuré", icon: "🔐", color: "#10B981" },
  pin_ok: { label: "PIN vérifié", icon: "✓", color: "#10B981" },
  pin_fail: { label: "PIN incorrect", icon: "⚠️", color: "#F59E0B" },
  otp_generated: { label: "Code OTP généré", icon: "📱", color: Colors.secondary },
  otp_ok: { label: "OTP vérifié", icon: "✓", color: "#10B981" },
  otp_fail: { label: "OTP incorrect", icon: "⚠️", color: "#F59E0B" },
  wallet_frozen: { label: "Wallet gelé", icon: "🧊", color: "#EF4444" },
  wallet_unfrozen: { label: "Wallet dégelé", icon: "✓", color: "#10B981" },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface FreezeStatus {
  frozen: boolean;
  reason?: string;
}

interface PinStatus {
  has_pin: boolean;
}

interface SecurityEvent {
  type: string;
  at: string;
  meta?: Record<string, unknown>;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WalletSecurityScreen() {
  const router = useRouter();

  const [freezeStatus, setFreezeStatus] = useState<FreezeStatus | null>(null);
  const [pinStatus, setPinStatus] = useState<PinStatus | null>(null);
  const [securityLog, setSecurityLog] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [unfreezing, setUnfreezing] = useState(false);

  const deviceSecurity = detectSuspiciousEnvironment();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [freeze, pin, log] = await Promise.all([
        api.get<FreezeStatus>("/wallet/freeze-status"),
        api.get<PinStatus>("/wallet/pin/status"),
        api.get<SecurityEvent[]>("/wallet/security-log"),
      ]);
      setFreezeStatus(freeze);
      setPinStatus(pin);
      setSecurityLog(Array.isArray(log) ? log.slice(0, 10) : []);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleUnfreeze = async () => {
    setUnfreezing(true);
    try {
      await api.post("/wallet/unfreeze", {});
      await load();
      Alert.alert("Wallet débloqué", "Votre wallet est de nouveau actif.");
    } catch {
      Alert.alert("Erreur", "Impossible de débloquer le wallet. Réessayez.");
    }
    setUnfreezing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sécurité Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={Colors.secondary} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* B. Freeze status banner */}
          {freezeStatus?.frozen ? (
            <View style={styles.bannerFrozen}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerFrozenText}>
                  ⚠️ Wallet Gelé{freezeStatus.reason ? ` — ${freezeStatus.reason}` : ""}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.unfreezeBtn}
                onPress={handleUnfreeze}
                disabled={unfreezing}
              >
                {unfreezing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.unfreezeBtnText}>Débloquer</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.bannerActive}>
              <CheckCircle size={16} color="#10B981" />
              <Text style={styles.bannerActiveText}>Wallet actif et sécurisé</Text>
            </View>
          )}

          {/* C. PIN card */}
          <Card style={styles.card}>
            <View style={styles.pinRow}>
              <Lock size={20} color={Colors.secondary} />
              <Text style={styles.cardTitle}>PIN de transaction</Text>
              <View
                style={[
                  styles.statusChip,
                  { backgroundColor: pinStatus?.has_pin ? "#ECFDF5" : "#FFFBEB" },
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    { color: pinStatus?.has_pin ? "#10B981" : "#F59E0B" },
                  ]}
                >
                  {pinStatus?.has_pin ? "Activé" : "Non configuré"}
                </Text>
              </View>
            </View>
            <Button
              label={pinStatus?.has_pin ? "Modifier le PIN" : "Configurer le PIN"}
              onPress={() => router.push("/wallet/pin-setup" as any)}
              variant="secondary"
              style={{ marginTop: Spacing.md }}
            />
            <Text style={styles.pinHint}>Requis pour toute transaction ≥ 5 000 XAF</Text>
          </Card>

          {/* D. Protection levels card */}
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>Niveaux de protection</Text>
            {[
              {
                icon: "🔐",
                label: "Chiffrement AES-256 des données",
                active: true,
              },
              {
                icon: "🔒",
                label: "PIN de transaction",
                active: !!pinStatus?.has_pin,
              },
              {
                icon: "🕐",
                label: "Plafonds journaliers (1 000 000 XAF/jour)",
                active: true,
              },
              {
                icon: "⏳",
                label: "Délai bénéficiaire (2h nouveaux)",
                active: true,
              },
              {
                icon: "🔍",
                label: "Détection d'anomalies en temps réel",
                active: true,
              },
            ].map((item, i) => (
              <View key={i} style={styles.protectionRow}>
                <Text style={styles.protectionIcon}>{item.icon}</Text>
                <Text style={styles.protectionLabel}>{item.label}</Text>
                <Text style={{ color: item.active ? "#10B981" : "#F59E0B", fontWeight: "700" }}>
                  {item.active ? "✓" : "⚠️"}
                </Text>
              </View>
            ))}
          </Card>

          {/* E. Device security card */}
          <Card style={styles.card}>
            <View style={styles.pinRow}>
              <Shield size={20} color={Colors.secondary} />
              <Text style={styles.cardTitle}>Sécurité de l'appareil</Text>
            </View>
            {deviceSecurity.suspicious ? (
              <View style={styles.deviceWarning}>
                <Text style={styles.deviceWarningTitle}>⚠️ Environnement suspect détecté</Text>
                {deviceSecurity.reasons.map((r, i) => (
                  <Text key={i} style={styles.deviceWarningReason}>• {r}</Text>
                ))}
              </View>
            ) : (
              <View style={styles.deviceOk}>
                <CheckCircle size={14} color="#10B981" />
                <Text style={styles.deviceOkText}>Appareil sécurisé</Text>
              </View>
            )}
          </Card>

          {/* F. Security log */}
          <Card style={styles.card}>
            <View style={styles.pinRow}>
              <Eye size={20} color={Colors.secondary} />
              <Text style={styles.cardTitle}>Journal de sécurité</Text>
            </View>
            {securityLog.length === 0 ? (
              <Text style={styles.emptyLog}>Aucun événement enregistré.</Text>
            ) : (
              securityLog.map((event, i) => {
                const meta = EVENT_LABELS[event.type] ?? {
                  label: event.type,
                  icon: "•",
                  color: Colors.textMuted,
                };
                const date = new Date(event.at).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <View
                    key={i}
                    style={[styles.logRow, i > 0 && styles.logRowBorder]}
                  >
                    <Text style={styles.logIcon}>{meta.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.logLabel, { color: meta.color }]}>{meta.label}</Text>
                      <Text style={styles.logDate}>{date}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  backText: { fontSize: 22, color: Colors.secondary },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: Colors.text },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  content: { padding: Spacing.xl, gap: Spacing.lg, paddingBottom: 60 },

  // Banner
  bannerFrozen: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#EF4444",
    gap: Spacing.md,
  },
  bannerFrozenText: { color: "#EF4444", fontWeight: "700", fontSize: 13 },
  unfreezeBtn: {
    backgroundColor: "#EF4444",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  unfreezeBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  bannerActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#10B981",
  },
  bannerActiveText: { color: "#10B981", fontWeight: "700", fontSize: 13 },

  // Cards
  card: { gap: Spacing.sm },
  sectionLabel: { fontSize: 14, fontWeight: "700", color: Colors.text, marginBottom: Spacing.xs },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: Colors.text },

  // PIN
  pinRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  statusChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  statusChipText: { fontSize: 11, fontWeight: "700" },
  pinHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },

  // Protection
  protectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  protectionIcon: { fontSize: 16, width: 24, textAlign: "center" },
  protectionLabel: { flex: 1, fontSize: 13, color: Colors.text },

  // Device security
  deviceWarning: {
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#F59E0B",
    marginTop: Spacing.sm,
    gap: 4,
  },
  deviceWarningTitle: { color: "#F59E0B", fontWeight: "700", fontSize: 13 },
  deviceWarningReason: { color: "#92400E", fontSize: 12 },
  deviceOk: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
  },
  deviceOkText: { color: "#10B981", fontWeight: "600", fontSize: 13 },

  // Log
  emptyLog: { color: Colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: Spacing.md },
  logRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm, paddingVertical: 8 },
  logRowBorder: { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  logIcon: { fontSize: 15, width: 24, textAlign: "center", marginTop: 1 },
  logLabel: { fontSize: 13, fontWeight: "600" },
  logDate: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});
