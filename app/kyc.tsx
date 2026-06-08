import { useCallback, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, ShieldCheck, CheckCircle, Clock, XCircle } from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { Button, Card } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";

interface KycStatus { kyc_status: string; submitted_at?: string }

const STATUS_MAP: Record<string, { label: string; color: string; icon: any; desc: string }> = {
  not_submitted: { label: "Non soumis", color: Colors.textMuted, icon: ShieldCheck, desc: "Vérifiez votre identité pour accéder aux fonctionnalités premium." },
  pending_review: { label: "En cours d'examen", color: Colors.warning, icon: Clock, desc: "Votre dossier est en cours de vérification par notre équipe." },
  approved: { label: "Approuvé", color: Colors.accent, icon: CheckCircle, desc: "Votre identité a été vérifiée avec succès !" },
  rejected: { label: "Rejeté", color: Colors.danger, icon: XCircle, desc: "Votre dossier a été rejeté. Vous pouvez le soumettre à nouveau." },
};

export default function KycScreen() {
  const router = useRouter();
  const { show } = useToast();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(useCallback(() => {
    api.get<KycStatus>("/users/me/kyc").then(setStatus).catch(() => {});
  }, []));

  const handleSubmit = async () => {
    const doSubmit = async () => {
      setSubmitting(true);
      try {
        await api.post("/kyc/submit");
        show("Dossier KYC soumis avec succès !", "success");
        setStatus({ kyc_status: "pending_review" });
      } catch (e) {
        show(e instanceof ApiError ? e.detail : "Erreur lors de la soumission", "error");
      } finally {
        setSubmitting(false);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Soumettre votre dossier KYC ?")) doSubmit();
    } else {
      Alert.alert("Soumettre KYC", "Confirmer la soumission de votre dossier de vérification ?", [
        { text: "Annuler", style: "cancel" },
        { text: "Soumettre", onPress: doSubmit },
      ]);
    }
  };

  const info = STATUS_MAP[status?.kyc_status ?? "not_submitted"] ?? STATUS_MAP.not_submitted;
  const Icon = info.icon;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vérification KYC</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: 20 }}>
        <Card style={{ padding: 24, alignItems: "center", gap: 16 }}>
          <View style={[styles.iconBox, { backgroundColor: `${info.color}20` }]}>
            <Icon color={info.color} size={40} />
          </View>
          <Text style={[styles.statusLabel, { color: info.color }]}>{info.label}</Text>
          <Text style={styles.statusDesc}>{info.desc}</Text>
        </Card>

        <Card style={{ padding: 20, gap: 12 }}>
          <Text style={styles.sectionTitle}>Niveaux de vérification</Text>
          {[
            { level: "Niveau 1", desc: "Email vérifié — automatique à l'inscription", done: true },
            { level: "Niveau 2", desc: "Pièce d'identité + selfie — accès aux virements", done: status?.kyc_status === "approved" },
          ].map((item) => (
            <View key={item.level} style={styles.levelRow}>
              <CheckCircle color={item.done ? Colors.accent : Colors.textMuted} size={18} />
              <View style={{ flex: 1 }}>
                <Text style={styles.levelTitle}>{item.level}</Text>
                <Text style={styles.levelDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </Card>

        {(status?.kyc_status === "not_submitted" || status?.kyc_status === "rejected") && (
          <Button
            label="Soumettre mon dossier KYC"
            onPress={handleSubmit}
            loading={submitting}
            testID="kyc-submit"
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  iconBox: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  statusLabel: { fontSize: 20, fontWeight: "900" },
  statusDesc: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 20 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.primary, marginBottom: 4 },
  levelRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  levelTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  levelDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
