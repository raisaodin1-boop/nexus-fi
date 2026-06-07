import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ShieldCheck, Upload, CheckCircle, Clock, XCircle } from "lucide-react-native";
import { Colors, Spacing } from "@/src/theme";
import { Card, Button } from "@/src/ui";
import { api, ApiError } from "@/src/api";

type KycStatus = "approved" | "pending" | "rejected" | "not_submitted";

const STATUS_META: Record<KycStatus, { label: string; color: string; icon: React.ReactNode }> = {
  approved: { label: "Approuvé", color: Colors.success, icon: <CheckCircle color={Colors.success} size={20} /> },
  pending: { label: "En attente", color: Colors.warning, icon: <Clock color={Colors.warning} size={20} /> },
  rejected: { label: "Rejeté", color: Colors.danger, icon: <XCircle color={Colors.danger} size={20} /> },
  not_submitted: { label: "Non soumis", color: Colors.textMuted, icon: <Upload color={Colors.textMuted} size={20} /> },
};

const STATUS_DESC: Record<KycStatus, string> = {
  approved: "Votre identité a été vérifiée avec succès. Vous avez accès à toutes les fonctionnalités.",
  pending: "Votre dossier KYC est en cours de vérification. Vous serez notifié sous 24-48h.",
  rejected: "Votre dossier KYC a été rejeté. Veuillez soumettre à nouveau avec des documents valides.",
  not_submitted: "Vous n'avez pas encore soumis votre dossier KYC. Soumettez-le pour accéder à toutes les fonctionnalités.",
};

export default function KycScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<any>("/users/me/kyc");
      setStatus(d.status ?? "not_submitted");
    } catch {
      setStatus("not_submitted");
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    setError(null); setSubmitting(true);
    try {
      await api.post("/kyc/submit");
      Alert.alert("KYC soumis", "Votre dossier a été soumis. Vous serez notifié sous 24-48h.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur lors de la soumission");
    } finally { setSubmitting(false); }
  };

  const meta = status ? STATUS_META[status] : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>

        <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={styles.hero}>
          <ShieldCheck color="#fff" size={36} />
          <Text style={styles.heroTitle}>Vérification KYC</Text>
          <Text style={styles.heroSub}>Know Your Customer — identité vérifiée</Text>
        </LinearGradient>

        {!loading && meta && (
          <Card style={{ marginTop: 20, gap: 12 }}>
            <View style={styles.statusRow}>
              {meta.icon}
              <View style={[styles.statusBadge, { borderColor: meta.color }]}>
                <Text testID="kyc-status" style={[styles.statusText, { color: meta.color }]}>
                  {meta.label}
                </Text>
              </View>
            </View>
            <Text style={styles.statusDesc}>{STATUS_DESC[status!]}</Text>
          </Card>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && (status === "not_submitted" || status === "rejected") ? (
          <View style={{ marginTop: 20 }}>
            <Button
              testID="kyc-submit"
              label="Soumettre KYC"
              icon={<Upload color="#fff" size={18} />}
              onPress={submit}
              loading={submitting}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.xl, paddingBottom: 60 },
  backBtn: { marginBottom: 12 },
  back: { color: Colors.textMuted, fontWeight: "600" },
  hero: { borderRadius: 20, padding: 28, alignItems: "center", gap: 10 },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  heroSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "600" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5 },
  statusText: { fontWeight: "800", fontSize: 14 },
  statusDesc: { fontSize: 13, color: Colors.textMuted, lineHeight: 20 },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: "600", marginTop: 12 },
});
