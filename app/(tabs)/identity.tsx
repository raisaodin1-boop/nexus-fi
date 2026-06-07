// IDENTITY — Trust Score, Identity Engine, Certificates
import { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  FileText, Award, ShieldCheck, Share2, TrendingUp,
  Crown, Sparkles, Lock, CheckCircle2, Zap, Users,
  PiggyBank, Star, AlertCircle, ChevronRight,
} from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { Card, SectionTitle } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { TrustGauge } from "@/src/trust-gauge";
import { useAuth } from "@/src/auth-context";
import { sharePdfCertificate } from "@/src/share";

/* ─── Default empty data so the page always renders ─── */
const EMPTY_IDENTITY = {
  user: { full_name: "", email: "", phone: null, country: null, city: null, occupation: null, created_at: new Date().toISOString() },
  trust_score: {
    score: 0,
    score_max: 1000,
    level: "Débutant",
    risk: "Faible",
    color: Colors.textMuted,
    components: { regularity: 0, longevity: 0, participation: 0, engagement: 0, signup_bonus: 0, transaction_points: 0, yearly_bonus: 0 },
    tips: [],
    stats: { total_saved: 0, tontines: 0, associations: 0, cooperatives: 0, account_age_days: 0 },
  },
  totals: { total_savings: 0, deposits_count: 0, tontine_contributions: 0, groups: 0, tontines: 0, associations: 0, cooperatives: 0 },
  currency: "XAF",
};

const EMPTY_PROFILE = {
  profile: {
    points: 0, display_points: 0, level: "Bronze", level_key: "bronze" as const,
    level_color: "#CD7F32", next_level: "Silver", points_to_next: 100,
    progress_within_level_pct: 0, events_recorded: 0,
  },
  recent_events: [] as { event_type: string; points_delta: number; created_at: string }[],
};

export default function Identity() {
  const router = useRouter();
  const { user } = useAuth();
  const [identity, setIdentity] = useState(EMPTY_IDENTITY);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiError, setApiError] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [id, prof] = await Promise.all([
        api.get<typeof EMPTY_IDENTITY>("/identity"),
        api.get<typeof EMPTY_PROFILE>("/identity-profile/me").catch(() => null),
      ]);
      setIdentity(id ?? EMPTY_IDENTITY);
      setProfile(prof ?? EMPTY_PROFILE);
      setApiError(false);
    } catch {
      setApiError(true);
      // keep previous or default data — page always renders
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(true); };

  const openPDF = async (kind: "identity" | "trust-score" | "savings") => {
    try { await sharePdfCertificate(kind); }
    catch (e: any) { Alert.alert("Partage indisponible", e?.message ?? "Une erreur est survenue."); }
  };

  const downloadCertified = async (kind: "identity" | "trust-score" | "savings") => {
    try {
      const resp = await api.get<{ filename: string; base64: string }>(`/reports/certified/${kind}`);
      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${resp.base64}`;
        link.download = resp.filename;
        link.click();
        return;
      }
      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
      const uri = `${dir}${resp.filename}`;
      await FileSystem.writeAsStringAsync(uri, resp.base64, { encoding: FileSystem.EncodingType.Base64 });
      if (!(await Sharing.isAvailableAsync())) throw new Error("Partage non disponible.");
      await Sharing.shareAsync(uri, { dialogTitle: "Partager le certificat Hodix", mimeType: "application/pdf", UTI: "com.adobe.pdf" });
    } catch (e: any) {
      if (e?.status === 402) {
        Alert.alert("Certificat Authentifié", "Ce certificat nécessite un paiement de 10 000 FCFA. Voulez-vous continuer ?", [
          { text: "Annuler", style: "cancel" },
          { text: "Payer 10 000 FCFA", onPress: () => router.push({ pathname: "/payments/pay", params: { amount: "10000", reason: `Certificat authentifié - ${kind}`, kind } } as any) },
        ]);
      } else {
        Alert.alert("Erreur", e?.message ?? "Une erreur est survenue.");
      }
    }
  };

  const ts = identity.trust_score;
  const tier = profile.profile;
  const totals = identity.totals;
  const displayName = user?.full_name || identity.user.full_name || "—";
  const displayEmail = user?.email || identity.user.email || "—";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <LinearGradient colors={[Colors.primary, Colors.gradMid, Colors.gradEnd]} style={styles.heroBanner}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroTitle}>Identité Financière</Text>
              <Text style={styles.heroSubtitle}>Votre réputation vérifiable</Text>
            </View>
            {loading && <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />}
          </View>

          {/* Main score ring */}
          <View style={styles.scoreRingWrap}>
            <View style={styles.scoreRing}>
              <Text style={styles.scoreNumber}>{ts.score.toFixed(0)}</Text>
              <Text style={styles.scoreMax}>/ {(ts as any).score_max ?? 1000}</Text>
              <Text style={[styles.scoreLevel, { color: ts.color !== Colors.textMuted ? ts.color : Colors.accent }]}>{ts.level}</Text>
            </View>
          </View>

          {/* Quick stats row */}
          <View style={styles.heroStats}>
            <HeroStat label="Groupes" value={String(totals.groups)} icon={<Users color="rgba(255,255,255,0.9)" size={14} />} />
            <View style={styles.heroStatDivider} />
            <HeroStat label="Épargne" value={formatXAF(totals.total_savings, identity.currency)} icon={<PiggyBank color="rgba(255,255,255,0.9)" size={14} />} />
            <View style={styles.heroStatDivider} />
            <HeroStat label="Risque" value={ts.risk} icon={<Zap color="rgba(255,255,255,0.9)" size={14} />} />
          </View>
        </LinearGradient>

        {/* Offline notice */}
        {apiError ? (
          <View style={styles.offlineBanner}>
            <AlertCircle color={Colors.danger} size={14} />
            <Text style={styles.offlineText}>Données hors-ligne · Tirez pour actualiser</Text>
            <TouchableOpacity onPress={() => load()}>
              <Text style={styles.offlineRetry}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── IDENTITY CARD ── */}
        <View style={{ paddingHorizontal: Spacing.xl, marginTop: -24 }}>
          <LinearGradient
            colors={["#1A0A3D", "#2D1B69", "#1A0A3D"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.certCard, Shadow.cardDark]}
          >
            <View style={styles.verifiedStamp}>
              <Text style={styles.verifiedText}>HODIX</Text>
            </View>
            <View style={styles.certHeader}>
              <View style={styles.certBadge}><Award color={Colors.gold} size={22} /></View>
              <View>
                <Text style={styles.certBrand}>Certificat d'Identité</Text>
                <Text style={styles.certTagline}>Financière & Communautaire</Text>
              </View>
            </View>
            <View style={styles.certDivider} />
            <Text style={styles.certName}>{displayName}</Text>
            <Text style={styles.certMeta}>{displayEmail}</Text>
            {(identity.user.city || identity.user.country) ? (
              <Text style={styles.certMeta}>{[identity.user.city, identity.user.country].filter(Boolean).join(", ")}</Text>
            ) : null}
            {identity.user.occupation ? <Text style={styles.certMeta}>{identity.user.occupation}</Text> : null}

            {/* Stats grid */}
            <View style={styles.certGrid}>
              <CertStat label="Score" value={`${ts.score.toFixed(0)}/1000`} />
              <CertStat label="Tontines" value={String(totals.tontines)} />
              <CertStat label="Associations" value={String(totals.associations)} />
              <CertStat label="Coopératives" value={String(totals.cooperatives)} />
              <CertStat label="Dépôts" value={String(totals.deposits_count)} />
              <CertStat label="Groupes" value={String(totals.groups)} />
            </View>

            <Text style={styles.certIssued}>
              Membre depuis {new Date(identity.user.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </Text>
          </LinearGradient>
        </View>

        {/* ── IDENTITY ENGINE TIER ── */}
        <SectionTitle>Niveau d'identité</SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <Card>
            <View style={styles.tierRow}>
              <LinearGradient
                colors={[tier.level_color, tier.level_color + "99"]}
                style={styles.tierMedal}
              >
                {tier.level_key === "platinum" || tier.level_key === "gold"
                  ? <Crown color="#fff" size={26} />
                  : <Sparkles color="#fff" size={22} />}
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tierLabel, { color: tier.level_color }]}>{tier.level}</Text>
                <Text style={styles.tierPoints}>{tier.points} pts · {tier.events_recorded} action{tier.events_recorded !== 1 ? "s" : ""}</Text>
                {tier.next_level ? (
                  <Text style={styles.tierNext}>+{tier.points_to_next} pts → {tier.next_level}</Text>
                ) : (
                  <Text style={[styles.tierNext, { color: Colors.gold }]}>🏆 Niveau maximal</Text>
                )}
              </View>
              <View style={[styles.tierBadge, { backgroundColor: tier.level_color + "22", borderColor: tier.level_color + "55" }]}>
                <Star color={tier.level_color} size={14} fill={tier.level_color} />
              </View>
            </View>

            {/* Progress bar */}
            <View style={styles.tierBar}>
              <View style={[styles.tierFill, { width: `${Math.max(2, tier.progress_within_level_pct)}%`, backgroundColor: tier.level_color }]} />
            </View>
            <Text style={styles.tierPct}>{tier.progress_within_level_pct.toFixed(0)}% vers {tier.next_level ?? "Max"}</Text>

            {/* Tier legend */}
            <View style={styles.tierLegend}>
              {([
                { k: "bronze", lbl: "Bronze", c: "#CD7F32", r: "0–30" },
                { k: "silver", lbl: "Argent", c: "#8B9EB0", r: "31–60" },
                { k: "gold", lbl: "Or", c: "#D4AF37", r: "61–80" },
                { k: "platinum", lbl: "Platine", c: "#8B5CF6", r: "81+" },
              ] as const).map((t) => (
                <View key={t.k} style={styles.tierLegendCol}>
                  <View style={[styles.tierLegendDot, { backgroundColor: t.c, opacity: tier.level_key === t.k ? 1 : 0.35 }]} />
                  <Text style={[styles.tierLegendLbl, { color: tier.level_key === t.k ? Colors.text : Colors.textMuted }]}>{t.lbl}</Text>
                  <Text style={styles.tierLegendRange}>{t.r}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* ── TRUST SCORE GAUGE ── */}
        <SectionTitle>Score de confiance</SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <Card style={{ alignItems: "center", paddingVertical: 28 }}>
            <TrustGauge score={ts.score} level={ts.level} color={ts.color !== Colors.textMuted ? ts.color : Colors.primary} size={240} scoreMax={(ts as any).score_max ?? 1000} />
            <View style={styles.riskRow}>
              <View style={[styles.riskDot, { backgroundColor: ts.color !== Colors.textMuted ? ts.color : Colors.primary }]} />
              <Text style={styles.riskLabel}>Niveau de risque : <Text style={{ color: ts.color !== Colors.textMuted ? ts.color : Colors.primary, fontWeight: "800" }}>{ts.risk}</Text></Text>
            </View>
          </Card>
        </View>

        {/* ── SCORE COMPONENTS ── */}
        <SectionTitle>Composantes du score</SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl, gap: 10 }}>
          <ScoreBar
            label="Bonus inscription"
            value={(ts.components as any).signup_bonus ?? 0}
            max={5}
            color={Colors.accent}
            hint="Offert à l'inscription"
            icon={<Zap color={Colors.accent} size={14} />}
          />
          <ScoreBar
            label="Points transactions"
            value={(ts.components as any).transaction_points ?? 0}
            max={990}
            color={Colors.secondary}
            hint="0,5 pt (1k–50k XAF) · 1 pt (50k+ XAF)"
            icon={<TrendingUp color={Colors.secondary} size={14} />}
          />
          <ScoreBar
            label="Bonus annuel"
            value={(ts.components as any).yearly_bonus ?? 0}
            max={50}
            color={Colors.primary}
            hint="5 pts par an d'activité"
            icon={<Star color={Colors.primary} size={14} />}
          />
          <ScoreBar
            label="Régularité"
            value={ts.components.regularity ?? 0}
            max={100}
            color="#10B981"
            hint="Contributions dans les délais"
            icon={<CheckCircle2 color="#10B981" size={14} />}
          />
          <ScoreBar
            label="Longévité"
            value={ts.components.longevity ?? 0}
            max={100}
            color={Colors.primary}
            hint={`${ts.stats?.account_age_days ?? 0} jour(s) de présence`}
            icon={<Award color={Colors.primary} size={14} />}
          />
          <ScoreBar
            label="Participation"
            value={ts.components.participation ?? 0}
            max={100}
            color={Colors.gradMid}
            hint={`${totals.groups} groupe(s) actif(s)`}
            icon={<Users color={Colors.gradMid} size={14} />}
          />
          <ScoreBar
            label="Engagement"
            value={ts.components.engagement ?? 0}
            max={100}
            color={Colors.gradEnd}
            hint="Interactions et actions"
            icon={<Sparkles color={Colors.gradEnd} size={14} />}
          />
        </View>

        {/* ── ACTIVITY STATS ── */}
        <SectionTitle>Statistiques d'activité</SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <Card>
            <View style={styles.statsGrid}>
              <StatCell label="Total épargné" value={formatXAF(totals.total_savings, identity.currency)} accent={Colors.primary} />
              <StatCell label="Dépôts" value={String(totals.deposits_count)} accent={Colors.secondary} />
              <StatCell label="Contrib. tontines" value={formatXAF(totals.tontine_contributions, identity.currency)} accent={Colors.accent} />
              <StatCell label="Tontines" value={String(totals.tontines)} accent="#10B981" />
              <StatCell label="Associations" value={String(totals.associations)} accent={Colors.gradMid} />
              <StatCell label="Coopératives" value={String(totals.cooperatives)} accent={Colors.gradEnd} />
              <StatCell label="Total groupes" value={String(totals.groups)} accent={Colors.accentDark} />
              <StatCell label="Ancienneté" value={`${ts.stats?.account_age_days ?? 0}j`} accent={Colors.primary} />
            </View>
          </Card>
        </View>

        {/* ── KYC ── */}
        <SectionTitle>Vérification d'identité (KYC)</SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <TouchableOpacity onPress={() => router.push("/kyc")} activeOpacity={0.85} testID="identity-go-kyc">
            <LinearGradient
              colors={[Colors.accent + "15", Colors.accent + "05"]}
              style={[styles.kycCard, { borderColor: Colors.accent + "40" }]}
            >
              <View style={styles.kycIcon}>
                <ShieldCheck color={Colors.accent} size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.kycTitle}>Compléter votre KYC</Text>
                <Text style={styles.kycSub}>Niveau 1 : infos · Niveau 2 : CNI + selfie</Text>
              </View>
              <ChevronRight color={Colors.accent} size={18} />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── TIPS ── */}
        {ts.tips.length > 0 ? (
          <>
            <SectionTitle>Recommandations</SectionTitle>
            <View style={{ paddingHorizontal: Spacing.xl, gap: 8 }}>
              {ts.tips.map((t, i) => (
                <Card key={i} style={{ flexDirection: "row", gap: 12, padding: 14 }}>
                  <TrendingUp color={Colors.accent} size={18} style={{ marginTop: 2 }} />
                  <Text style={styles.tip}>{t}</Text>
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {/* ── FREE CERTIFICATES ── */}
        <SectionTitle>Documents gratuits</SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl, gap: 10 }}>
          <PDFButton testID="pdf-identity" icon={<ShieldCheck color={Colors.accent} size={20} />} title="Identité Financière" subtitle="Profil complet et vérifié" onPress={() => openPDF("identity")} />
          <PDFButton testID="pdf-savings" icon={<FileText color={Colors.primary} size={20} />} title="Résumé d'épargne" subtitle="Total et engagement" onPress={() => openPDF("savings")} />
          <Text style={styles.shareHint}>📱 Partagez via WhatsApp, Email, ou enregistrez sur votre appareil.</Text>
        </View>

        {/* ── VIP CERTIFIED CERTIFICATES ── */}
        <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.xl }}>
          <View style={styles.vipSectionHeader}>
            <Text style={styles.vipSectionTitle}>Certificats Authentifiés</Text>
            <LinearGradient colors={[Colors.gold, Colors.accentDark]} style={styles.vipPill}>
              <Crown color="#fff" size={10} />
              <Text style={styles.vipPillText}>VIP PREMIUM</Text>
            </LinearGradient>
          </View>

          <LinearGradient
            colors={["#1A0A3D", "#3B1F8C", "#1A0A3D"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.premiumCard}
          >
            <View style={styles.premiumCardTop}>
              <View style={styles.premiumCrownRow}>
                <Crown color={Colors.gold} size={26} />
                <Text style={styles.premiumCardTitle}>Certifié Hodix</Text>
              </View>
              <View style={styles.premiumPriceBadge}>
                <Text style={styles.premiumPrice}>10 000 FCFA</Text>
              </View>
            </View>

            <Text style={styles.premiumCardSubtitle}>
              Version officielle avec tampon numérique et code de vérification unique
            </Text>

            <View style={styles.premiumFeatures}>
              {["Tampon officiel Hodix", "Code QR de vérification", "Valide pour usage bancaire"].map((f) => (
                <View key={f} style={styles.premiumFeatureRow}>
                  <CheckCircle2 color={Colors.gold} size={14} />
                  <Text style={styles.premiumFeatureTxt}>{f}</Text>
                </View>
              ))}
            </View>

            <View style={styles.premiumDivider} />

            <TouchableOpacity testID="cert-identity" style={styles.certBtn} activeOpacity={0.8} onPress={() => downloadCertified("identity")}>
              <Lock color="#1A0A3D" size={15} />
              <Text style={styles.certBtnText}>Identité Certifiée</Text>
              <ChevronRight color="#1A0A3D" size={15} />
            </TouchableOpacity>

            <TouchableOpacity testID="cert-trust" style={[styles.certBtn, { marginTop: 8 }]} activeOpacity={0.8} onPress={() => downloadCertified("trust-score")}>
              <CheckCircle2 color="#1A0A3D" size={15} />
              <Text style={styles.certBtnText}>Trust Score Certifié</Text>
              <ChevronRight color="#1A0A3D" size={15} />
            </TouchableOpacity>

            <TouchableOpacity testID="cert-savings" style={[styles.certBtn, { marginTop: 8 }]} activeOpacity={0.8} onPress={() => downloadCertified("savings")}>
              <Award color="#1A0A3D" size={15} />
              <Text style={styles.certBtnText}>Épargne Certifiée</Text>
              <ChevronRight color="#1A0A3D" size={15} />
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─── Sub-components ─── */

function HeroStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {icon}
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }} numberOfLines={1}>{value}</Text>
      </View>
      <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, marginTop: 2, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function CertStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.certStatCell}>
      <Text style={styles.certStatVal}>{value}</Text>
      <Text style={styles.certStatLbl}>{label}</Text>
    </View>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ScoreBar({ label, value, max, color, hint, icon }: {
  label: string; value: number; max: number; color: string; hint?: string; icon?: React.ReactNode;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <Card style={{ padding: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {icon}
          <Text style={{ color: Colors.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
        </View>
        <Text style={{ color: color, fontWeight: "800", fontSize: 13 }}>{value.toFixed(1)}<Text style={{ color: Colors.textMuted, fontWeight: "600", fontSize: 11 }}>/{max}</Text></Text>
      </View>
      {hint ? <Text style={{ color: Colors.textSubtle, fontSize: 11, marginBottom: 6, fontWeight: "500" }}>{hint}</Text> : null}
      <View style={{ height: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 4, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color, borderRadius: 4 }} />
      </View>
    </Card>
  );
}

function PDFButton({ icon, title, subtitle, onPress, testID }: {
  icon: React.ReactNode; title: string; subtitle: string; onPress: () => void; testID?: string;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} testID={testID}>
      <Card style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontWeight: "800", fontSize: 14 }}>{title}</Text>
          <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
        </View>
        <Share2 color={Colors.textMuted} size={18} />
      </Card>
    </TouchableOpacity>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  // Hero banner
  heroBanner: { paddingTop: 24, paddingBottom: 56, paddingHorizontal: Spacing.xl },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  heroTitle: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  heroSubtitle: { color: "rgba(255,255,255,0.65)", fontSize: 13, marginTop: 2, fontWeight: "500" },
  scoreRingWrap: { alignItems: "center", marginBottom: 24 },
  scoreRing: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 3, borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  scoreNumber: { color: "#fff", fontSize: 44, fontWeight: "900", letterSpacing: -1 },
  scoreMax: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "600", marginTop: -4 },
  scoreLevel: { fontSize: 12, fontWeight: "800", marginTop: 4, letterSpacing: 0.5 },
  heroStats: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 16, padding: 14 },
  heroStatDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 8 },

  // Offline banner
  offlineBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dangerLight, paddingHorizontal: Spacing.xl, paddingVertical: 10,
  },
  offlineText: { flex: 1, color: Colors.danger, fontSize: 12, fontWeight: "600" },
  offlineRetry: { color: Colors.primary, fontWeight: "800", fontSize: 12 },

  // Identity card
  certCard: { borderRadius: 24, padding: 24, overflow: "hidden", marginBottom: 4 },
  verifiedStamp: {
    position: "absolute", top: 18, right: 18,
    borderWidth: 1.5, borderColor: Colors.gold,
    borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3,
    transform: [{ rotate: "12deg" }],
  },
  verifiedText: { color: Colors.gold, fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  certHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  certBadge: { width: 46, height: 46, borderRadius: 12, backgroundColor: "rgba(245,200,66,0.15)", alignItems: "center", justifyContent: "center" },
  certBrand: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 1 },
  certTagline: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  certDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.12)", marginVertical: 14 },
  certName: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  certMeta: { color: "rgba(255,255,255,0.65)", fontSize: 13, marginTop: 3, fontWeight: "500" },
  certGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 18, gap: 1 },
  certStatCell: { width: "33.33%", paddingVertical: 10, paddingHorizontal: 4, alignItems: "center" },
  certStatVal: { color: Colors.gold, fontSize: 15, fontWeight: "900" },
  certStatLbl: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "600", marginTop: 2, letterSpacing: 0.3, textAlign: "center" },
  certIssued: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 14, fontWeight: "600", letterSpacing: 0.3, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 12 },

  // Tier
  tierRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  tierMedal: { width: 60, height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  tierLabel: { fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  tierPoints: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  tierNext: { color: Colors.text, fontSize: 13, fontWeight: "700", marginTop: 4 },
  tierBadge: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tierBar: { height: 10, backgroundColor: Colors.surfaceAlt, borderRadius: 5, overflow: "hidden" },
  tierFill: { height: "100%", borderRadius: 5 },
  tierPct: { color: Colors.textSubtle, fontSize: 11, fontWeight: "600", marginTop: 6, textAlign: "right" },
  tierLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, gap: 6 },
  tierLegendCol: { alignItems: "center", flex: 1 },
  tierLegendDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 4 },
  tierLegendLbl: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  tierLegendRange: { color: Colors.textSubtle, fontSize: 9, fontWeight: "600", marginTop: 1 },

  // Risk
  riskRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  riskDot: { width: 10, height: 10, borderRadius: 5 },
  riskLabel: { color: Colors.textMuted, fontSize: 13 },

  // Stats grid
  statsGrid: { flexDirection: "row", flexWrap: "wrap" },
  statCell: { width: "50%", paddingVertical: 12, paddingHorizontal: 4, alignItems: "center" },
  statValue: { fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
  statLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 },

  // KYC
  kycCard: {
    flexDirection: "row", alignItems: "center", padding: 16, gap: 12,
    borderRadius: Radius.xl, borderWidth: 1,
  },
  kycIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: Colors.accent + "20", alignItems: "center", justifyContent: "center" },
  kycTitle: { color: Colors.text, fontWeight: "800", fontSize: 14 },
  kycSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },

  // Tips
  tip: { color: Colors.text, fontSize: 13, lineHeight: 19, flex: 1, fontWeight: "500" },
  shareHint: { color: Colors.textSubtle, fontSize: 12, textAlign: "center", marginTop: 4, fontWeight: "500" },

  // VIP section
  vipSectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: Spacing.md },
  vipSectionTitle: { fontSize: 18, fontWeight: "900", color: Colors.text, letterSpacing: -0.3 },
  vipPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  vipPillText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },

  // Premium card
  premiumCard: { borderRadius: 24, padding: 22, marginBottom: Spacing.xl },
  premiumCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  premiumCrownRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  premiumCardTitle: { color: Colors.gold, fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  premiumCardSubtitle: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "600", lineHeight: 17, marginBottom: 14 },
  premiumPriceBadge: { backgroundColor: "rgba(245,200,66,0.15)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.gold + "44" },
  premiumPrice: { color: Colors.gold, fontSize: 13, fontWeight: "900" },
  premiumFeatures: { gap: 6, marginBottom: 6 },
  premiumFeatureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  premiumFeatureTxt: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
  premiumDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: 16 },
  certBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: 13, paddingHorizontal: 16,
  },
  certBtnText: { color: "#1A0A3D", fontSize: 14, fontWeight: "900", flex: 1 },
});
