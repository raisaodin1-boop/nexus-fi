import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Download, Share2, QrCode } from "lucide-react-native";
import { api } from "@/src/api";
import { Card, Button } from "@/src/ui";
import { Colors, Spacing } from "@/src/theme";
import { encodeQR } from "@/src/qr-payment";
import QRCode from "react-native-qrcode-svg";

interface UserMe {
  id: string;
  full_name: string;
}

export default function QRPaymentScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>("/users/me")
      .then((u) => setUser({ id: u.id, full_name: u.full_name }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const qrValue = user ? encodeQR({ to: user.id, name: user.full_name, currency: "XAF" }) : "";

  const handleShare = async () => {
    try {
      await Share.share({ message: qrValue, title: "Mon QR HODIX" });
    } catch (e: any) {
      Alert.alert("Partage", e?.message ?? "Une erreur est survenue.");
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.h1}>
          {mode === "scan" ? "Scanner un QR" : "Mon QR de paiement"}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {mode === "scan" ? (
        <View style={styles.center}>
          <Card style={styles.scanCard}>
            <QrCode color={Colors.textMuted} size={56} />
            <Text style={styles.scanTitle}>Scanner disponible bientôt</Text>
            <Text style={styles.scanSub}>
              Utilisez la caméra de votre téléphone pour scanner un QR HODIX.
            </Text>
          </Card>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <View style={styles.content}>
          <Card style={styles.qrCard}>
            {/* Name */}
            <Text style={styles.userName}>{user?.full_name ?? "—"}</Text>
            <Text style={styles.userSub}>Envoyez-moi de l'argent</Text>

            {/* QR Code */}
            <View style={styles.qrWrap}>
              <QRCode value={qrValue || "hodix://pay"} size={200} color={Colors.primary} />
            </View>

            {/* QR value hint */}
            <Text style={styles.qrHint} numberOfLines={2} ellipsizeMode="middle">
              {qrValue}
            </Text>
          </Card>

          {/* Share button */}
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
            <Share2 color="#fff" size={18} />
            <Text style={styles.shareBtnText}>Partager</Text>
          </TouchableOpacity>

          {/* Caption */}
          <Text style={styles.caption}>
            Scannez ce code pour m'envoyer de l'argent directement
          </Text>

          {/* How-to steps */}
          <Card style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>Comment ça marche</Text>
            {[
              "1. Scanner le QR",
              "2. Entrer le montant",
              "3. Confirmer",
            ].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepDot} />
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </Card>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backBtn: { width: 36, alignItems: "flex-start" },
  backText: { color: Colors.primary, fontSize: 28, fontWeight: "300", lineHeight: 32 },
  h1: { color: Colors.text, fontSize: 18, fontWeight: "900", letterSpacing: -0.2 },
  content: { flex: 1, paddingHorizontal: Spacing.xl, paddingBottom: 40, alignItems: "center" },
  qrCard: { width: "100%", alignItems: "center", paddingVertical: 28, paddingHorizontal: 20, marginBottom: 16 },
  userName: { color: Colors.text, fontSize: 20, fontWeight: "900", marginBottom: 4 },
  userSub: { color: Colors.textMuted, fontSize: 13, marginBottom: 20 },
  qrWrap: {
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  qrHint: {
    color: Colors.textSubtle,
    fontSize: 9,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    textAlign: "center",
    maxWidth: 260,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginBottom: 12,
  },
  shareBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  caption: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 18,
  },
  stepsCard: { width: "100%", padding: 16 },
  stepsTitle: { color: Colors.text, fontWeight: "800", fontSize: 13, marginBottom: 10 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  stepText: { color: Colors.textMuted, fontSize: 13 },
  // Scan mode
  scanCard: { alignItems: "center", padding: 32, gap: 12 },
  scanTitle: { color: Colors.text, fontSize: 18, fontWeight: "900", textAlign: "center" },
  scanSub: { color: Colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },
});
