// Member promotion request screen
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles, Clock, CheckCircle2, XCircle } from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

export default function PromotionRequest() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<any>("/promotion-requests/me");
      setExisting(r?.id ? r : null);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); refresh(); }, [load]));

  const submit = async () => {
    setError(null); setSubmitting(true);
    try {
      const r = await api.post<any>("/promotion-requests", { reason });
      setExisting(r);
      setReason("");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally { setSubmitting(false); }
  };

  if (user?.role !== "member") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Retour</Text></TouchableOpacity>
          <Card style={{ alignItems: "center", padding: 32, marginTop: 32 }}>
            <CheckCircle2 color={Colors.accent} size={48} />
            <Text style={{ color: Colors.text, fontSize: 17, fontWeight: "900", marginTop: 16 }}>Déjà un rôle élevé</Text>
            <Text style={{ color: Colors.textMuted, fontSize: 13, marginTop: 8, textAlign: "center" }}>
              Vous êtes actuellement {user?.role === "tontine_manager" ? "Tontine Manager" : "Super Admin"}. Aucune promotion supplémentaire requise.
            </Text>
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} testID="promo-back"><Text style={styles.back}>← Retour</Text></TouchableOpacity>

          <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={[styles.hero, Shadow.cardDark]}>
            <Sparkles color="#fff" size={28} />
            <Text style={styles.heroTitle}>Devenir Tontine Manager</Text>
            <Text style={styles.heroDesc}>
              En tant que Manager, vous pourrez créer des tontines de plus de 5 membres, des associations, coopératives et fonds communautaires.
            </Text>
            <View style={styles.benefits}>
              <Benefit text="Tontines illimitées en nombre de membres" />
              <Benefit text="Tableau de bord communautaire avancé" />
              <Benefit text="Analyse de conformité et health score" />
              <Benefit text="Gestion centralisée des contributions" />
            </View>
          </LinearGradient>

          {existing ? (
            <Card style={{ marginTop: 20, padding: 18 }}>
              <View style={styles.statusRow}>
                <StatusIcon status={existing.status} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusTitle}>{statusLabel(existing.status)}</Text>
                  <Text style={styles.statusDate}>Envoyée le {new Date(existing.created_at).toLocaleDateString("fr-FR")}</Text>
                </View>
              </View>
              <Text style={styles.reasonLabel}>Votre motivation</Text>
              <Text style={styles.reasonText}>{existing.reason}</Text>
              {existing.decision_note ? (
                <>
                  <Text style={styles.reasonLabel}>Note de l'admin</Text>
                  <Text style={styles.reasonText}>{existing.decision_note}</Text>
                </>
              ) : null}
              {existing.status === "pending" ? (
                <Text style={styles.pendingHint}>Un super admin examinera votre demande sous peu.</Text>
              ) : existing.status === "rejected" ? (
                <View style={{ marginTop: 16 }}>
                  <Button label="Refaire une demande" variant="accent" onPress={() => setExisting(null)} testID="promo-resubmit" />
                </View>
              ) : null}
            </Card>
          ) : (
            <Card style={{ marginTop: 20 }}>
              <Text style={styles.formLabel}>Pourquoi devenir Tontine Manager ?</Text>
              <Field
                testID="promo-reason"
                placeholder="Décrivez votre projet, votre communauté, le nombre de membres prévus..."
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={5}
                style={{ minHeight: 120, textAlignVertical: "top" }}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                testID="promo-submit"
                label="Envoyer ma demande"
                onPress={submit}
                loading={submitting}
                disabled={reason.trim().length < 10}
              />
              <Text style={styles.hint}>Min. 10 caractères. Un super admin examinera votre demande.</Text>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Benefit({ text }: { text: string }) {
  return (
    <View style={styles.benefitRow}>
      <CheckCircle2 color="#fff" size={14} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle2 color={Colors.accent} size={28} />;
  if (status === "rejected") return <XCircle color={Colors.danger} size={28} />;
  return <Clock color={Colors.warning} size={28} />;
}
function statusLabel(s: string) {
  return s === "approved" ? "Demande approuvée" : s === "rejected" ? "Demande refusée" : "Demande en cours d'examen";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  back: { color: Colors.textMuted, fontWeight: "600", marginBottom: 12 },
  hero: { borderRadius: Radius.xxl, padding: 24, gap: 12 },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  heroDesc: { color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 19, fontWeight: "500" },
  benefits: { marginTop: 8, gap: 8 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  benefitText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  statusTitle: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  statusDate: { color: Colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: "600" },
  reasonLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 12 },
  reasonText: { color: Colors.text, fontSize: 13, marginTop: 4, lineHeight: 18 },
  pendingHint: { color: Colors.textMuted, fontSize: 12, fontStyle: "italic", marginTop: 16, textAlign: "center" },
  formLabel: { color: Colors.text, fontSize: 14, fontWeight: "800", marginBottom: 10 },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: "600", marginBottom: 12 },
  hint: { color: Colors.textSubtle, fontSize: 11, marginTop: 8, textAlign: "center" },
});
