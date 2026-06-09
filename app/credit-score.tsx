import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, Platform,
  ScrollView, Share, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Award, CheckCircle2, ChevronLeft, Download, Share2,
  TrendingUp, Users, Clock, Wallet, ShieldCheck,
} from "lucide-react-native";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Polyline, Line, Text as SvgText } from "react-native-svg";

import { api } from "@/src/api";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { SkeletonBox } from "@/src/ui";
import { getTier, getTierGradient, TIERS, type CreditScoreResult, type MonthlySnapshot, type ScoreTier } from "@/src/credit-score";
import { generateCreditReportHtml } from "@/src/credit-report-html";

// ─── Mini sparkline chart ──────────────────────────────────────────────────────

function ScoreChart({ data }: { data: MonthlySnapshot[] }) {
  if (data.length < 2) return null;
  const W = 280, H = 90, PAD = 16;
  const scores = data.map(d => d.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores) || 1;
  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (d.score - min) / (max - min)) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const last = pts[pts.length - 1].split(",");

  return (
    <View style={styles.chartWrap}>
      <Svg width={W} height={H}>
        <Line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke={Colors.border} strokeWidth={1} />
        <Line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={Colors.border} strokeWidth={1} />
        <Polyline points={pts.join(" ")} fill="none" stroke={Colors.secondary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={Number(last[0])} cy={Number(last[1])} r={5} fill={Colors.secondary} />
        <SvgText x={PAD} y={PAD - 4} fontSize={9} fill={Colors.textMuted}>{max}</SvgText>
        <SvgText x={PAD} y={H - 2} fontSize={9} fill={Colors.textMuted}>{min}</SvgText>
      </Svg>
      <View style={styles.chartLabels}>
        <Text style={styles.chartLabel}>{data[0].month}</Text>
        <Text style={styles.chartLabel}>{data[data.length - 1].month}</Text>
      </View>
    </View>
  );
}

// ─── CountUp ──────────────────────────────────────────────────────────────────

function CountUp({ target, duration = 1200 }: { target: number; duration?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    anim.setValue(0);
    const listener = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(anim, { toValue: target, duration, useNativeDriver: false, delay: 300 }).start();
    return () => anim.removeListener(listener);
  }, [target]);

  return <Text style={styles.ringScore}>{display}</Text>;
}

// ─── ShimmerText ──────────────────────────────────────────────────────────────

function ShimmerText({ text, color }: { text: string; color: string }) {
  const shimmer = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 2000, useNativeDriver: true, delay: 800 })
    ).start();
  }, []);

  const translateX = shimmer.interpolate({ inputRange: [-1, 1], outputRange: [-80, 80] });
  return (
    <View style={{ overflow: "hidden" }}>
      <Text style={[styles.tierLabel, { color }]}>{text}</Text>
      <Animated.View style={[StyleSheet.absoluteFill, {
        transform: [{ translateX }],
        backgroundColor: "rgba(255,255,255,0.25)",
        width: 60,
      }]} />
    </View>
  );
}

// ─── BreathingScoreCard ───────────────────────────────────────────────────────

function BreathingScoreCard({ score, tier }: { score: number; tier: ScoreTier }) {
  const breathe = useRef(new Animated.Value(1)).current;
  const CIRCUMFERENCE = 2 * Math.PI * 70;
  const strokeDashoffset = CIRCUMFERENCE * (1 - Math.min(score / 1000, 1));

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.025, duration: 2000, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[{ alignItems: "center" }, { transform: [{ scale: breathe }] }]}>
      <LinearGradient colors={tier.gradientColors as any} style={styles.heroCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={{ alignItems: "center", justifyContent: "center", height: 180 }}>
          {/* SVG Ring */}
          <View style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%" viewBox="0 0 160 160" style={{ position: "absolute", top: 10, alignSelf: "center" }}>
              <Defs>
                <SvgLinearGradient id="rg" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0%" stopColor={tier.color} />
                  <Stop offset="100%" stopColor="#ffffff" stopOpacity="0.7" />
                </SvgLinearGradient>
              </Defs>
              <Circle cx={80} cy={80} r={70} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={10} />
              <Circle
                cx={80} cy={80} r={70} fill="none"
                stroke="url(#rg)"
                strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={`${CIRCUMFERENCE}`}
                strokeDashoffset={strokeDashoffset}
                rotation={-90}
                origin="80,80"
              />
            </Svg>
          </View>
          {/* Centered score */}
          <View style={{ alignItems: "center" }}>
            <CountUp target={score} />
            <Text style={styles.ringMax}>/1000</Text>
          </View>
        </View>
        <ShimmerText text={tier.label} color={tier.color} />
        <Text style={styles.heroSubtitle}>Score de crédit HODIX</Text>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Component bar ─────────────────────────────────────────────────────────────

function ComponentBar({
  label, value, max, color, icon: Icon,
}: {
  label: string; value: number; max: number; color: string; icon: any;
}) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: value / max, duration: 800, delay: 300, useNativeDriver: false }).start();
  }, [value, max]);

  return (
    <View style={styles.barRow}>
      <View style={styles.barIcon}>
        <Icon size={15} color={color} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.barHeader}>
          <Text style={styles.barLabel}>{label}</Text>
          <Text style={[styles.barValue, { color }]}>{value}<Text style={styles.barMax}>/{max}</Text></Text>
        </View>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { backgroundColor: color, width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function CreditScoreScreen() {
  const router = useRouter();
  const [data, setData] = useState<(CreditScoreResult & { tips: string[] }) | null>(null);
  const [history, setHistory] = useState<MonthlySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<any>("/credit-score"),
      api.get<MonthlySnapshot[]>("/credit-score/history").catch(() => []),
    ]).then(([score, hist]) => {
      setData(score);
      setHistory(Array.isArray(hist) ? hist : []);
    }).finally(() => setLoading(false));
  }, []);

  const handleExportPdf = useCallback(async () => {
    if (!data) return;
    setPdfBusy(true);
    try {
      if (Platform.OS === "web") {
        Alert.alert("Export", "Le téléchargement PDF est disponible sur l'app mobile.");
        return;
      }
      const Print = await import("expo-print");
      const Sharing = await import("expo-sharing");
      const html = generateCreditReportHtml(data);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Rapport de crédit Hodix", UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("PDF généré", uri);
      }
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Impossible de générer le PDF.");
    } finally {
      setPdfBusy(false);
    }
  }, [data]);

  const handleShare = useCallback(async () => {
    if (!data) return;
    const tier = getTier(data.score);
    try {
      await Share.share({
        message: `Mon score de crédit Hodix : ${data.score}/1000 (${tier.label})${data.is_loan_eligible ? " ✅ Éligible au financement" : ""}. Rejoignez Hodix pour bâtir votre identité financière !`,
        title: "Mon score Hodix",
      });
    } catch {}
  }, [data]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={{ padding: Spacing.xl, gap: 16 }}>
          <SkeletonBox height={200} borderRadius={Radius.xxl} />
          <SkeletonBox height={120} borderRadius={Radius.xl} />
          <SkeletonBox height={180} borderRadius={Radius.xl} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) return null;

  const tier = getTier(data.score);
  const { breakdown } = data;

  const COMPONENTS = [
    { label: "Régularité des cotisations", value: breakdown.regularity,     max: 350, color: Colors.secondary, icon: TrendingUp, pct: "35%" },
    { label: "Volume d'épargne",           value: breakdown.savings_volume, max: 250, color: Colors.accent,    icon: Wallet,    pct: "25%" },
    { label: "Ancienneté",                 value: breakdown.seniority,      max: 200, color: "#8B5CF6",        icon: Clock,     pct: "20%" },
    { label: "Réseau communautaire",       value: breakdown.network,        max: 100, color: "#F59E0B",        icon: Users,     pct: "10%" },
    { label: "Niveau KYC",                 value: breakdown.kyc,            max: 100, color: "#10B981",        icon: ShieldCheck, pct: "10%" },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* ── Hero gradient ── */}
        <LinearGradient colors={["#0B1F3A", "#1D4ED8"]} style={styles.hero}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <ChevronLeft color="#fff" size={24} />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Score de Crédit</Text>
          <Text style={styles.heroSub}>Hodix Financial Identity™</Text>

          <BreathingScoreCard score={data.score} tier={tier} />

          {data.is_loan_eligible && (
            <View style={styles.eligibleBadge}>
              <CheckCircle2 size={15} color="#10B981" />
              <Text style={styles.eligibleText}>Éligible au financement</Text>
            </View>
          )}

          {/* Tier ladder */}
          <View style={styles.tierLadder}>
            {[...TIERS].reverse().map(t => (
              <View key={t.label} style={[styles.tierDot, { backgroundColor: data.score >= t.min ? t.color : Colors.border }]} />
            ))}
          </View>
          <View style={styles.tierLadder}>
            {[...TIERS].reverse().map(t => (
              <Text key={t.label} style={styles.tierDotLabel}>{t.label}</Text>
            ))}
          </View>
        </LinearGradient>

        {/* ── Action buttons ── */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.8}>
            <Share2 size={18} color={Colors.secondary} />
            <Text style={styles.actionLabel}>Partager</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleExportPdf} disabled={pdfBusy} activeOpacity={0.8}>
            {pdfBusy ? <ActivityIndicator size={18} color={Colors.secondary} /> : <Download size={18} color={Colors.secondary} />}
            <Text style={styles.actionLabel}>Rapport PDF</Text>
          </TouchableOpacity>
        </View>

        {/* ── Breakdown ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détail du score</Text>
          <View style={[styles.card, Shadow.card]}>
            {COMPONENTS.map(c => (
              <ComponentBar key={c.label} label={`${c.label} (${c.pct})`} value={c.value} max={c.max} color={c.color} icon={c.icon} />
            ))}
          </View>
        </View>

        {/* ── Historique ── */}
        {history.length >= 2 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Évolution mensuelle</Text>
            <View style={[styles.card, Shadow.card]}>
              <ScoreChart data={history} />
              <Text style={styles.chartNote}>
                {history.length} mois d'historique · Mis à jour à chaque consultation
              </Text>
            </View>
          </View>
        )}

        {/* ── Tips ── */}
        {data.tips?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Conseils personnalisés</Text>
            <View style={[styles.card, Shadow.card, { gap: 10 }]}>
              {data.tips.map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <View style={styles.tipDot} />
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Partage partenaires ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Partager avec un partenaire</Text>
          <View style={[styles.card, Shadow.card]}>
            <Text style={styles.partnerDesc}>
              Votre rapport de crédit Hodix peut être partagé avec des banques ou institutions
              de microfinance partenaires sous forme de PDF certifié.
            </Text>
            <TouchableOpacity
              style={[styles.partnerBtn, { opacity: data.is_loan_eligible ? 1 : 0.5 }]}
              onPress={handleExportPdf}
              disabled={!data.is_loan_eligible || pdfBusy}
              activeOpacity={0.8}
            >
              <LinearGradient colors={["#0B1F3A", "#1D4ED8"]} style={styles.partnerBtnGrad}>
                <Download size={16} color="#fff" />
                <Text style={styles.partnerBtnText}>Télécharger le rapport certifié</Text>
              </LinearGradient>
            </TouchableOpacity>
            {!data.is_loan_eligible && (
              <Text style={styles.partnerHint}>Score minimum 700 requis pour le partage partenaire.</Text>
            )}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  hero: { padding: Spacing.xl, paddingTop: 12, paddingBottom: 32, alignItems: "center", gap: 10 },
  back: { alignSelf: "flex-start", marginBottom: 4 },
  heroTitle: { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  heroSub: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: -6 },
  heroCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    width: "100%",
    ...Shadow.card,
    overflow: "hidden",
  },
  ringScore: { color: "#fff", fontSize: 56, fontWeight: "900", letterSpacing: -2 },
  ringMax: { color: "rgba(255,255,255,0.6)", fontSize: 16, fontWeight: "600", marginTop: -4 },
  tierLabel: { fontSize: 22, fontWeight: "900", letterSpacing: 2, textTransform: "uppercase", marginTop: 8 },
  heroSubtitle: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "600", marginTop: 4 },
  eligibleBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(16,185,129,0.15)",
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1, borderColor: "#10B981",
  },
  eligibleText: { fontSize: 12, fontWeight: "600", color: "#10B981" },
  tierLadder: { flexDirection: "row", gap: 6, marginTop: 2 },
  tierDot: { width: 10, height: 10, borderRadius: 5 },
  tierDotLabel: { fontSize: 8, color: "rgba(255,255,255,0.4)", width: 46, textAlign: "center" },
  actions: { flexDirection: "row", padding: Spacing.xl, gap: Spacing.md },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: Colors.surface, borderRadius: Radius.xl,
    paddingVertical: 14, borderWidth: 1, borderColor: Colors.border,
  },
  actionLabel: { fontSize: 14, fontWeight: "600", color: Colors.secondary },
  section: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.xl },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: Colors.text, marginBottom: Spacing.md, letterSpacing: -0.3 },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xxl,
    padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, gap: 14,
  },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  barIcon: {
    width: 30, height: 30, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center",
  },
  barHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  barLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: "500", flex: 1 },
  barValue: { fontSize: 13, fontWeight: "700" },
  barMax: { fontSize: 11, color: Colors.textMuted, fontWeight: "400" },
  barTrack: { height: 6, backgroundColor: Colors.surfaceAlt, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  chartWrap: { alignItems: "center" },
  chartLabels: { flexDirection: "row", justifyContent: "space-between", width: 280, marginTop: 2 },
  chartLabel: { fontSize: 10, color: Colors.textMuted },
  chartNote: { fontSize: 11, color: Colors.textSubtle, textAlign: "center", marginTop: 4 },
  tipRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  tipDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.secondary, marginTop: 5 },
  tipText: { fontSize: 13, color: Colors.textMuted, lineHeight: 19, flex: 1 },
  partnerDesc: { fontSize: 13, color: Colors.textMuted, lineHeight: 19, marginBottom: 4 },
  partnerBtn: { borderRadius: Radius.xl, overflow: "hidden", marginTop: 8 },
  partnerBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  partnerBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  partnerHint: { fontSize: 11, color: Colors.textMuted, textAlign: "center", marginTop: 8 },
});
