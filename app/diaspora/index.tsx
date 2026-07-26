import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Clock, MapPin, RefreshCw } from "lucide-react-native";

import { api } from "@/src/api";
import { Button } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { DIASPORA_DISCLAIMER } from "@/src/diaspora-config";
import { DIASPORA_GATE_COPY, type DiasporaAccess } from "@/src/diaspora-enrollment-config";
import { DiasporaJourneySteps } from "@/src/diaspora-ui";
import {
  DiasporaBrandMark,
  DiasporaFadeIn,
  DiasporaPanel,
  DiasporaScreenShell,
  DiasporaSection,
} from "@/src/diaspora-shell";

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
      <DiasporaScreenShell variant="hero" showBack scroll={false} contentStyle={styles.center}>
        <ActivityIndicator size="large" color="#fff" />
      </DiasporaScreenShell>
    );
  }

  const pending = access?.status === "pending_review";
  const needsWork = access?.status === "rejected" || access?.status === "needs_info";

  return (
    <DiasporaScreenShell variant="hero">
      <DiasporaFadeIn>
        <View style={styles.heroBlock}>
          <DiasporaBrandMark size="lg" />
          <Text style={styles.headline}>{DIASPORA_GATE_COPY.question}</Text>
          <Text style={styles.support}>{DIASPORA_GATE_COPY.subtitle}</Text>
        </View>
      </DiasporaFadeIn>

      {pending ? (
        <DiasporaFadeIn delay={80}>
          <DiasporaPanel accent>
            <View style={styles.statusIcon}>
              <Clock color={Colors.info} size={28} />
            </View>
            <Text style={styles.statusTitle}>{DIASPORA_GATE_COPY.pendingTitle}</Text>
            <Text style={styles.statusBody}>{DIASPORA_GATE_COPY.pendingBody}</Text>
            {access?.submitted_at ? (
              <Text style={styles.meta}>
                Soumis le {new Date(access.submitted_at).toLocaleDateString("fr-FR", {
                  day: "numeric", month: "long", year: "numeric",
                })}
              </Text>
            ) : null}
            <TouchableOpacity style={styles.refreshRow} onPress={load}>
              <RefreshCw color={Colors.primary} size={14} />
              <Text style={styles.refreshText}>Actualiser le statut</Text>
            </TouchableOpacity>
          </DiasporaPanel>
        </DiasporaFadeIn>
      ) : needsWork ? (
        <DiasporaFadeIn delay={80}>
          <DiasporaPanel accent>
            <Text style={styles.statusTitle}>{DIASPORA_GATE_COPY.rejectedTitle}</Text>
            {access?.rejection_reason ? (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonLabel}>Message de l'équipe</Text>
                <Text style={styles.reasonText}>{access.rejection_reason}</Text>
              </View>
            ) : null}
            <Button
              label={DIASPORA_GATE_COPY.reapply}
              onPress={() => router.push("/diaspora/enroll" as any)}
            />
          </DiasporaPanel>
        </DiasporaFadeIn>
      ) : (
        <>
          <DiasporaFadeIn delay={60}>
            <TouchableOpacity
              style={styles.cta}
              activeOpacity={0.9}
              onPress={() => router.push("/diaspora/enroll" as any)}
              testID="diaspora-gate-enter"
            >
              <Text style={styles.ctaText}>{DIASPORA_GATE_COPY.cta}</Text>
              <Text style={styles.ctaHint}>Passeport, ID ou titre de séjour · hors Cameroun</Text>
            </TouchableOpacity>
          </DiasporaFadeIn>

          <DiasporaFadeIn delay={120}>
            <DiasporaPanel>
              <DiasporaSection
                title="Comment ça marche"
                body="Trois étapes nettes avant d'accéder à votre espace."
              />
              <DiasporaJourneySteps />
            </DiasporaPanel>
          </DiasporaFadeIn>

          <DiasporaFadeIn delay={180}>
            <View style={styles.footNote}>
              <MapPin color="rgba(255,255,255,0.55)" size={14} />
              <Text style={styles.footText}>{DIASPORA_DISCLAIMER}</Text>
            </View>
          </DiasporaFadeIn>
        </>
      )}
    </DiasporaScreenShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroBlock: { paddingTop: Spacing.md, paddingBottom: Spacing.sm, gap: 12 },
  headline: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 32,
    maxWidth: 340,
  },
  support: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
    maxWidth: 360,
  },
  cta: {
    backgroundColor: "#fff",
    borderRadius: Radius.xl,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 6,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "900",
    color: Colors.brandNavy,
    letterSpacing: -0.2,
  },
  ctaHint: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  statusIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.infoLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  statusTitle: { fontSize: 20, fontWeight: "900", color: Colors.text, letterSpacing: -0.3 },
  statusBody: { fontSize: 14, color: Colors.textMuted, lineHeight: 21, marginTop: 6, marginBottom: 8 },
  meta: { fontSize: 12, color: Colors.textSubtle, fontWeight: "600", marginBottom: 8 },
  refreshRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  refreshText: { fontSize: 13, fontWeight: "800", color: Colors.primary },
  reasonBox: {
    backgroundColor: Colors.dangerLight,
    borderRadius: Radius.md,
    padding: 12,
    marginVertical: 10,
    gap: 4,
  },
  reasonLabel: { fontSize: 11, fontWeight: "800", color: Colors.danger },
  reasonText: { fontSize: 13, color: Colors.text, lineHeight: 19, fontWeight: "600" },
  footNote: { flexDirection: "row", gap: 8, alignItems: "flex-start", paddingHorizontal: 4 },
  footText: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 17 },
});
