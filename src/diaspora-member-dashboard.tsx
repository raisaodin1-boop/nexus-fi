import { useCallback, useState } from "react";
import { RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ChevronRight, HeartHandshake, List, MapPin, PlusCircle, Shield, Upload, Users,
} from "lucide-react-native";

import { useAuth } from "@/src/auth-context";
import { api } from "@/src/api";
import type { DiasporaHome } from "@/src/db/diaspora";
import { SkeletonCard } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import {
  DiasporaStatusBadge, SecurityNotice,
} from "@/src/diaspora-ui";
import { isDiasporaMember } from "@/src/diaspora-enrollment-config";
import { CURRENCY_META, type Currency } from "@/src/exchange-rates";
import { DiasporaAmount, formatDiasporaPrimary, useDiasporaRates } from "@/src/diaspora-amount";
import { formatXAFAmount } from "@/src/exchange-rates";
import { TrustGauge } from "@/src/trust-gauge";
import { trustLevelFromScore } from "@/src/identity-progression";
import { DiasporaGuardSpinner } from "@/src/use-diaspora-guard";
import { useLiveDashboardSync } from "@/src/hooks/use-live-dashboard";
import {
  DiasporaBrandMark,
  DiasporaFadeIn,
  DiasporaPanel,
  DiasporaScreenShell,
  DiasporaSection,
} from "@/src/diaspora-shell";

type Props = {
  embeddedInTabs?: boolean;
  skipGuard?: boolean;
};

/** Full diaspora member experience — primary home after enrollment approval. */
export function DiasporaMemberDashboard({ embeddedInTabs, skipGuard }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [home, setHome] = useState<DiasporaHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [showTrust, setShowTrust] = useState(false);

  const profileCur = (user?.diaspora_currency ?? "EUR") as Currency;
  const profileCountry = user?.diaspora_country ?? user?.country;

  const load = useCallback(async () => {
    try {
      const data = await api.get<DiasporaHome>("/diaspora/home");
      setHome(data);
      setAccessDenied(false);
    } catch {
      setHome(null);
      if (!skipGuard && !isDiasporaMember(user)) setAccessDenied(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [skipGuard, user]);

  const canLoad = skipGuard || isDiasporaMember(user);
  useLiveDashboardSync(canLoad ? user?.id : undefined, { mode: "diaspora", reload: load });
  const rates = useDiasporaRates();

  useFocusEffect(useCallback(() => {
    if (!canLoad) setAccessDenied(true);
  }, [canLoad]));

  if (!skipGuard && !isDiasporaMember(user) && accessDenied) {
    router.replace("/diaspora" as any);
    return <DiasporaGuardSpinner checking />;
  }

  const level = home ? trustLevelFromScore(home.trust_score, false) : trustLevelFromScore(0, false);
  const next = home?.next_contribution;
  const cur = (home?.display_currency ?? profileCur) as Currency;
  const curMeta = CURRENCY_META[cur];
  const residence = home?.country_of_residence ?? profileCountry;
  const cotisePrimary = formatDiasporaPrimary(home?.total_validated_12m ?? 0, cur, rates);
  const firstName = (user?.full_name ?? "").split(" ")[0] || "Membre";

  return (
    <DiasporaScreenShell
      variant="hero"
      showBack={!embeddedInTabs}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          tintColor="#fff"
        />
      }
      contentStyle={styles.content}
    >
      <DiasporaFadeIn>
        <View style={styles.topIdentity}>
          <DiasporaBrandMark size="sm" />
          {residence ? (
            <View style={styles.placeRow}>
              <MapPin color="rgba(255,255,255,0.75)" size={13} />
              <Text style={styles.placeText}>
                {residence}
                {curMeta ? ` · ${curMeta.symbol} ${cur}` : ""}
              </Text>
            </View>
          ) : null}
          <Text style={styles.greeting}>Bonjour {firstName}</Text>
          <Text style={styles.greetingSub}>Votre épargne familiale, suivie depuis l'étranger.</Text>
        </View>
      </DiasporaFadeIn>

      {loading ? (
        <SkeletonCard />
      ) : (
        <>
          <DiasporaFadeIn delay={70}>
            <DiasporaPanel accent style={styles.focusPanel}>
              {next ? (
                <>
                  <Text style={styles.focusEyeline}>Prochaine action</Text>
                  <Text style={styles.focusTitle}>{next.tontine_name}</Text>
                  <DiasporaAmount amountXaf={next.amount_expected} currency={cur} size="lg" />
                  {next.due_date ? (
                    <Text style={styles.focusDue}>
                      Échéance{" "}
                      {new Date(next.due_date).toLocaleDateString("fr-FR", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </Text>
                  ) : null}
                  <View style={styles.focusMeta}>
                    <DiasporaStatusBadge status={next.status} />
                    <Text style={styles.ref}>Réf. {next.reference_code}</Text>
                  </View>
                  <Text style={styles.pendingNote}>
                    Non considérée comme payée tant que HODIX n'a pas validé la preuve.
                  </Text>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => router.push(`/diaspora/pay/${next.id}` as any)}
                    activeOpacity={0.9}
                  >
                    <PlusCircle color="#fff" size={18} />
                    <Text style={styles.primaryBtnText}>Payer cette cotisation</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.focusEyeline}>Espace prêt</Text>
                  <Text style={styles.focusTitle}>Aucune cotisation en attente</Text>
                  <Text style={styles.focusDue}>
                    Rejoignez une tontine ou parrainez un proche pour commencer.
                  </Text>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => router.push("/diaspora/join" as any)}
                    activeOpacity={0.9}
                  >
                    <Users color="#fff" size={18} />
                    <Text style={styles.primaryBtnText}>Rejoindre une tontine</Text>
                  </TouchableOpacity>
                </>
              )}
            </DiasporaPanel>
          </DiasporaFadeIn>

          <DiasporaFadeIn delay={120}>
            <View style={styles.metrics}>
              <Metric label="Tontines" value={String(home?.active_tontines ?? 0)} />
              <Metric
                label="Cotisé 12 mois"
                value={rates || cur === "XAF" ? cotisePrimary : "…"}
                hint={cur !== "XAF" ? `≈ ${formatXAFAmount(home?.total_validated_12m ?? 0)}` : undefined}
              />
              <Metric label="Devise" value={curMeta?.symbol ?? cur} hint={cur} />
            </View>
          </DiasporaFadeIn>

          <DiasporaFadeIn delay={160}>
            <View style={styles.grid}>
              <QuickAction
                icon={List}
                label="Mes cotisations"
                onPress={() => router.push("/diaspora/contributions" as any)}
              />
              <QuickAction
                icon={HeartHandshake}
                label="Payer pour un proche"
                onPress={() => router.push("/diaspora/sponsor" as any)}
              />
              <QuickAction
                icon={Upload}
                label="Ajouter une preuve"
                onPress={() => {
                  const r = home?.upcoming?.find((u) =>
                    ["proof_submitted", "pending_payment", "rejected", "needs_info"].includes(u.status),
                  );
                  if (r) router.push(`/diaspora/proof/${r.id}` as any);
                  else router.push("/diaspora/contributions" as any);
                }}
              />
              <QuickAction
                icon={Users}
                label="Rejoindre"
                onPress={() => router.push("/diaspora/join" as any)}
              />
            </View>
          </DiasporaFadeIn>

          {home?.todo?.length ? (
            <DiasporaFadeIn delay={200}>
              <DiasporaPanel>
                <DiasporaSection title="À traiter" body="Actions en attente sur vos dossiers." />
                {home.todo.map((t) => (
                  <TouchableOpacity
                    key={t.text}
                    style={styles.todoRow}
                    onPress={() => t.route && router.push(t.route as any)}
                  >
                    <Text style={styles.todoText}>{t.text}</Text>
                    {t.route ? <ChevronRight color={Colors.textMuted} size={16} /> : null}
                  </TouchableOpacity>
                ))}
              </DiasporaPanel>
            </DiasporaFadeIn>
          ) : null}

          <DiasporaFadeIn delay={220}>
            <TouchableOpacity
              style={styles.trustToggle}
              onPress={() => setShowTrust((v) => !v)}
              activeOpacity={0.85}
            >
              <Text style={styles.trustToggleText}>
                Réputation financière · {home?.trust_score ?? 0}
                {home?.top_pct ? ` · Top ${home.top_pct}%` : ""}
              </Text>
              <ChevronRight
                color="rgba(255,255,255,0.55)"
                size={16}
                style={{ transform: [{ rotate: showTrust ? "90deg" : "0deg" }] }}
              />
            </TouchableOpacity>
            {showTrust ? (
              <DiasporaPanel style={{ alignItems: "center" }}>
                <TrustGauge
                  score={home?.trust_score ?? 0}
                  level={level.level}
                  color={level.color}
                  size={160}
                  hideOutOf
                  percentileLine={home?.top_pct ? `Top ${home.top_pct}% des membres actifs` : undefined}
                />
                <Text style={styles.trustHint}>
                  Score de confiance HODIX — pas un score de crédit bancaire officiel.
                </Text>
              </DiasporaPanel>
            ) : null}
          </DiasporaFadeIn>

          <SecurityNotice compact />
          <TouchableOpacity style={styles.fraudBtn} onPress={() => router.push("/messages" as any)}>
            <Shield color="#FCA5A5" size={15} />
            <Text style={styles.fraudText}>Signaler une fraude ou un problème</Text>
          </TouchableOpacity>
        </>
      )}
    </DiasporaScreenShell>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue} numberOfLines={2}>{value}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof List;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.quick} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.quickIcon}>
        <Icon color={Colors.primary} size={18} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  topIdentity: { gap: 8, paddingTop: Spacing.xs, paddingBottom: Spacing.sm },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  placeText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "700" },
  greeting: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
    marginTop: 4,
  },
  greetingSub: { color: "rgba(255,255,255,0.65)", fontSize: 14, lineHeight: 20 },
  focusPanel: { gap: 8 },
  focusEyeline: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  focusTitle: { fontSize: 20, fontWeight: "900", color: Colors.text, letterSpacing: -0.3 },
  focusDue: { fontSize: 13, color: Colors.textMuted, marginBottom: 4 },
  focusMeta: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  ref: { fontSize: 12, color: Colors.secondary, fontWeight: "700" },
  pendingNote: { fontSize: 12, color: Colors.warning, lineHeight: 17, fontWeight: "600" },
  primaryBtn: {
    marginTop: 6,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  metrics: { flexDirection: "row", gap: 8 },
  metric: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: Radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  metricValue: { fontSize: 14, fontWeight: "900", color: "#fff" },
  metricHint: { fontSize: 9, color: "rgba(255,255,255,0.55)", marginTop: 2, fontWeight: "600" },
  metricLabel: { fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 6, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quick: {
    width: "48%",
    flexGrow: 1,
    minWidth: "46%",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: Radius.lg,
    padding: 14,
    gap: 10,
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { fontSize: 13, fontWeight: "800", color: Colors.text },
  todoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  todoText: { flex: 1, fontSize: 13, color: Colors.text, fontWeight: "600" },
  trustToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  trustToggleText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "700" },
  trustHint: { fontSize: 11, color: Colors.textSubtle, textAlign: "center", marginTop: 8 },
  fraudBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 8,
  },
  fraudText: { color: "#FCA5A5", fontWeight: "700", fontSize: 13 },
});
