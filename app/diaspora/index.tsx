import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Clock, Globe, ShieldCheck, XCircle } from "lucide-react-native";

import { api } from "@/src/api";
import { Button, Card } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { DIASPORA_DISCLAIMER } from "@/src/diaspora-config";
import { DIASPORA_GATE_COPY, type DiasporaAccess } from "@/src/diaspora-enrollment-config";
import { DiasporaManualBanner } from "@/src/diaspora-ui";

export default function DiasporaGateScreen() {
  const router = useRouter();
  const [access, setAccess] = useState<DiasporaAccess | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const a = await api.get<DiasporaAccess>("/diaspora/access");
      setAccess(a);
      if (a.has_access) {
        router.replace("/(tabs)" as any);
      }
    } catch {
      setAccess({ status: "not_submitted", has_access: false });
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const pending = access?.status === "pending_review";
  const rejected = access?.status === "rejected" || access?.status === "needs_info";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <LinearGradient colors={[Colors.gradStart, Colors.gradMid]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Globe color="#fff" size={20} />
            <Text style={styles.headerTitle}>{DIASPORA_GATE_COPY.title}</Text>
          </View>
          <Text style={styles.headerSub}>{DIASPORA_DISCLAIMER}</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scroll}>
        <DiasporaManualBanner />

        {pending ? (
          <Card style={styles.statusCard}>
            <Clock color={Colors.info} size={36} />
            <Text style={styles.statusTitle}>{DIASPORA_GATE_COPY.pendingTitle}</Text>
            <Text style={styles.statusBody}>{DIASPORA_GATE_COPY.pendingBody}</Text>
            {access?.submitted_at ? (
              <Text style={styles.meta}>Soumis le {new Date(access.submitted_at).toLocaleDateString("fr-FR")}</Text>
            ) : null}
          </Card>
        ) : rejected ? (
          <Card style={styles.statusCard}>
            <XCircle color={Colors.danger} size={36} />
            <Text style={styles.statusTitle}>{DIASPORA_GATE_COPY.rejectedTitle}</Text>
            {access?.rejection_reason ? (
              <Text style={styles.rejectReason}>{access.rejection_reason}</Text>
            ) : null}
            <Button label={DIASPORA_GATE_COPY.reapply} onPress={() => router.push("/diaspora/enroll" as any)} />
          </Card>
        ) : (
          <>
            <View style={styles.hero}>
              <Globe color={Colors.primary} size={48} />
              <Text style={styles.question}>{DIASPORA_GATE_COPY.question}</Text>
              <Text style={styles.subtitle}>{DIASPORA_GATE_COPY.subtitle}</Text>
            </View>

            <Card>
              <View style={styles.stepRow}>
                <ShieldCheck color={Colors.primary} size={20} />
                <Text style={styles.stepText}>1. Vérifiez votre identité et votre résidence à l'étranger</Text>
              </View>
              <View style={styles.stepRow}>
                <Clock color={Colors.secondary} size={20} />
                <Text style={styles.stepText}>2. Validation manuelle par l'équipe HODIX (24–48 h)</Text>
              </View>
              <View style={styles.stepRow}>
                <Globe color={Colors.accent} size={20} />
                <Text style={styles.stepText}>3. Accès à votre dashboard Diaspora (devise locale)</Text>
              </View>
            </Card>

            <Button
              label={DIASPORA_GATE_COPY.cta}
              onPress={() => router.push("/diaspora/enroll" as any)}
              testID="diaspora-gate-enter"
            />
            <Text style={styles.note}>
              Réservé aux membres résidant hors du Cameroun. Passeport, carte d'identité étrangère ou titre de séjour requis.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: Spacing.lg, flexDirection: "row", gap: 12, alignItems: "flex-start" },
  backBtn: { marginTop: 4 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 6, lineHeight: 16 },
  scroll: { padding: Spacing.lg, gap: 16, paddingBottom: 48 },
  hero: { alignItems: "center", paddingVertical: 24, gap: 12 },
  question: { fontSize: 24, fontWeight: "900", color: Colors.text, textAlign: "center" },
  subtitle: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 22, paddingHorizontal: 8 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  stepText: { flex: 1, fontSize: 13, color: Colors.text, fontWeight: "600", lineHeight: 20 },
  note: { fontSize: 11, color: Colors.textSubtle, textAlign: "center", lineHeight: 17 },
  statusCard: { alignItems: "center", gap: 12, paddingVertical: 28 },
  statusTitle: { fontSize: 18, fontWeight: "900", color: Colors.text, textAlign: "center" },
  statusBody: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
  meta: { fontSize: 12, color: Colors.textSubtle },
  rejectReason: { fontSize: 13, color: Colors.danger, textAlign: "center", fontWeight: "600" },
});
