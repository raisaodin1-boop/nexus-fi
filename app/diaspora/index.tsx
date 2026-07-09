import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, ChevronRight, Globe, List, PlusCircle, Shield, Upload } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import type { DiasporaHome } from "@/src/db/diaspora";
import { Button, Card, SkeletonCard } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import {
  ComingSoonRoadmap, DiasporaHeroStrip, DiasporaManualBanner,
  DiasporaStatusBadge, SecurityNotice,
} from "@/src/diaspora-ui";
import { DIASPORA_DISCLAIMER } from "@/src/diaspora-config";
import { TrustGauge } from "@/src/trust-gauge";
import { trustLevelFromScore } from "@/src/identity-progression";

export default function DiasporaHomeScreen() {
  const router = useRouter();
  const [home, setHome] = useState<DiasporaHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<DiasporaHome>("/diaspora/home");
      setHome(data);
    } catch {
      setHome(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const level = home ? trustLevelFromScore(home.trust_score) : trustLevelFromScore(0);
  const next = home?.next_contribution;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <LinearGradient colors={[Colors.gradStart, Colors.gradMid]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Globe color="#fff" size={18} />
            <Text style={styles.headerTitle}>HODIX Diaspora</Text>
          </View>
          <Text style={styles.headerSub}>{DIASPORA_DISCLAIMER}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <DiasporaManualBanner />

        {loading ? (
          <SkeletonCard />
        ) : (
          <>
            <Text style={styles.h1}>Votre épargne africaine, où que vous soyez.</Text>

            <Card style={styles.trustCard}>
              <Text style={styles.sectionLabel}>Votre réputation financière Diaspora</Text>
              <TrustGauge
                score={home?.trust_score ?? 0}
                level={level.level}
                color={level.color}
                size={180}
                hideOutOf
                percentileLine={home?.top_pct ? `Top ${home.top_pct}% des membres actifs` : undefined}
              />
              <Text style={styles.trustHint}>
                Score de confiance HODIX — non un score de crédit bancaire officiel.
              </Text>
            </Card>

            <View style={styles.statsRow}>
              <StatBox label="Tontines actives" value={String(home?.active_tontines ?? 0)} />
              <StatBox label="Cotisé (12 mois)" value={formatXAF(home?.total_validated_12m ?? 0)} />
              <StatBox label="Épargne" value={`${home?.savings_progress_pct ?? 0}%`} />
            </View>

            {next ? (
              <Card style={{ marginBottom: Spacing.md }}>
                <Text style={styles.sectionLabel}>Prochaine cotisation</Text>
                <Text style={styles.tontineName}>{next.tontine_name}</Text>
                <Text style={styles.amount}>{formatXAF(next.amount_expected)}</Text>
                {next.due_date ? (
                  <Text style={styles.due}>
                    Échéance : {new Date(next.due_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </Text>
                ) : null}
                <DiasporaStatusBadge status={next.status} />
                <Text style={styles.ref}>Réf. {next.reference_code}</Text>
                <Text style={styles.pendingNote}>
                  ⚠️ Cette cotisation n'est pas considérée comme payée avant validation par l'équipe HODIX.
                </Text>
              </Card>
            ) : null}

            <View style={styles.actionsRow}>
              <ActionBtn icon={List} label="Voir mes cotisations" onPress={() => router.push("/diaspora/contributions" as any)} />
              <ActionBtn icon={PlusCircle} label="Payer une cotisation" onPress={() => {
                if (next) router.push(`/diaspora/pay/${next.id}` as any);
                else router.push("/diaspora/contributions" as any);
              }} primary />
              <ActionBtn icon={Upload} label="Ajouter une preuve" onPress={() => {
                const r = home?.upcoming?.find((u) => ["proof_submitted", "pending_payment", "rejected", "needs_info"].includes(u.status));
                if (r) router.push(`/diaspora/proof/${r.id}` as any);
                else router.push("/diaspora/contributions" as any);
              }} />
            </View>

            {home?.todo?.length ? (
              <Card>
                <Text style={styles.sectionLabel}>À faire</Text>
                {home.todo.map((t) => (
                  <TouchableOpacity key={t.text} style={styles.todoRow} onPress={() => t.route && router.push(t.route as any)}>
                    <Text style={styles.todoText}>{t.text}</Text>
                    {t.route ? <ChevronRight color={Colors.textMuted} size={16} /> : null}
                  </TouchableOpacity>
                ))}
              </Card>
            ) : null}

            <SecurityNotice />
            <View style={{ height: 12 }} />
            <TouchableOpacity style={styles.fraudBtn} onPress={() => router.push("/messages" as any)}>
              <Shield color={Colors.danger} size={16} />
              <Text style={styles.fraudText}>Signaler une fraude ou un problème</Text>
            </TouchableOpacity>
            <ComingSoonRoadmap />
            <Button label="Rejoindre une tontine" variant="outline" onPress={() => router.push("/diaspora/join" as any)} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionBtn({ icon: Icon, label, onPress, primary }: { icon: any; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <TouchableOpacity style={[styles.actionBtn, primary && styles.actionBtnPrimary]} onPress={onPress} activeOpacity={0.85}>
      <Icon color={primary ? "#fff" : Colors.primary} size={18} />
      <Text style={[styles.actionLabel, primary && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, paddingTop: Spacing.sm, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  backBtn: { padding: 8, marginTop: 4 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 4, lineHeight: 16 },
  scroll: { padding: Spacing.lg, paddingBottom: 48 },
  h1: { fontSize: 22, fontWeight: "900", color: Colors.text, marginBottom: Spacing.md, letterSpacing: -0.5 },
  trustCard: { alignItems: "center", paddingVertical: 20, marginBottom: Spacing.md },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  trustHint: { fontSize: 11, color: Colors.textSubtle, textAlign: "center", marginTop: 8, paddingHorizontal: 16 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: Spacing.md },
  statBox: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 12, borderWidth: 1, borderColor: Colors.borderLight },
  statValue: { fontSize: 14, fontWeight: "900", color: Colors.text },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 4 },
  tontineName: { fontSize: 16, fontWeight: "800", color: Colors.text },
  amount: { fontSize: 28, fontWeight: "900", color: Colors.primary, marginVertical: 4 },
  due: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  ref: { fontSize: 12, color: Colors.secondary, fontWeight: "700", marginTop: 8 },
  pendingNote: { fontSize: 11, color: Colors.warning, marginTop: 10, lineHeight: 16, fontWeight: "600" },
  actionsRow: { gap: 8, marginBottom: Spacing.md },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, borderRadius: Radius.lg, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  actionBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionLabel: { fontSize: 14, fontWeight: "800", color: Colors.text, flex: 1 },
  todoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  todoText: { flex: 1, fontSize: 13, color: Colors.text, fontWeight: "600" },
  fraudBtn: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", padding: 12, marginBottom: Spacing.md },
  fraudText: { color: Colors.danger, fontWeight: "700", fontSize: 13 },
});
