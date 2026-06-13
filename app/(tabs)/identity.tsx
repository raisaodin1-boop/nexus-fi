// IDENTITY - Trust Score detail, components, financial identity profile + PDF certificates
// + IDENTITY ENGINE (Bronze / Silver / Gold / Platinum) + KYC entry
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { FileText, Award, ShieldCheck, Share2, TrendingUp, Crown, Sparkles, Lock, CheckCircle2 } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { Card, SectionTitle } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { TrustGauge } from "@/src/trust-gauge";
import { useAuth } from "@/src/auth-context";
import { sharePdfCertificate } from "@/src/share";
import { downloadOrSharePdf } from "@/src/pdf-download";

interface TS {
  score: number; level: string; risk: string; color: string;
  components: { regularity: number; longevity: number; participation: number; engagement: number };
  tips: string[];
  stats: { total_saved: number; tontines: number; associations: number; cooperatives: number; account_age_days: number };
}
interface Identity {
  user: { full_name: string; email: string; phone?: string | null; country?: string | null; city?: string | null; occupation?: string | null; created_at: string };
  trust_score: TS;
  totals: { total_savings: number; deposits_count: number; tontine_contributions: number; groups: number; tontines: number; associations: number; cooperatives: number };
  currency: string;
}

interface IdentityProfile {
  profile: {
    points: number;
    display_points: number;
    level: string;
    level_key: "bronze" | "silver" | "gold" | "platinum";
    level_color: string;
    next_level: string | null;
    points_to_next: number;
    progress_within_level_pct: number;
    events_recorded: number;
  };
  recent_events: { event_type: string; points_delta: number; created_at: string }[];
}

export default function Identity() {
  const router = useRouter();
  const { user } = useAuth();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [profile, setProfile] = useState<IdentityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [id, prof] = await Promise.all([
        api.get<Identity>("/identity"),
        api.get<IdentityProfile>("/identity-profile/me").catch(() => null),
      ]);
      setIdentity(id);
      setProfile(prof);
      setError(null);
    } catch (e) {
      setError("Impossible de charger votre identité. Réessayez.");
    }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openPDF = async (kind: "identity" | "trust-score" | "savings") => {
    setPdfLoading(true);
    try {
      await sharePdfCertificate(kind);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Impossible de générer le document. Réessayez.");
    } finally {
      setPdfLoading(false);
    }
  };

  const downloadCertified = async (kind: "identity" | "trust-score" | "savings") => {
    // Payment gate — always confirm before attempting download
    Alert.alert(
      "Certificat Authentifié VIP",
      "Ce certificat officiel nécessite un paiement de 10 000 FCFA. Voulez-vous continuer vers le paiement ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Payer 10 000 FCFA →",
          onPress: () =>
            router.push({
              pathname: "/pay",
              params: {
                amount: "10000",
                label: `Certificat authentifié - ${kind}`,
                kind: "certified_report",
                cert_kind: kind,
              },
            } as any),
        },
      ],
    );
  };

  if (loading || !identity) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={Colors.secondary} size="large" />
          ) : (
            <>
              <Text style={{ color: Colors.text, fontWeight: "800", fontSize: 16, marginBottom: 8 }}>Identité indisponible</Text>
              <Text style={{ color: Colors.textMuted, fontSize: 13, textAlign: "center", marginBottom: 16 }}>{error ?? "Une erreur est survenue."}</Text>
              <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.secondary }}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Réessayer</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const ts = identity.trust_score;
  const tier = profile?.profile;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.h1}>Identité Financière</Text>
          <Text style={styles.subtitle}>Votre histoire vérifiable</Text>
        </View>

        {/* Certificate-style identity card */}
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <LinearGradient
            colors={[Colors.primary, Colors.gradMid]}
            style={[styles.certCard, Shadow.cardDark, { borderWidth: 1.5, borderColor: Colors.gold + "55" }]}
          >
            {/* VÉRIFIÉ stamp */}
            <View style={styles.verifiedStamp}>
              <Text style={styles.verifiedText}>VÉRIFIÉ</Text>
            </View>
            <View style={styles.certHeader}>
              <View style={styles.certBadge}><Award color={Colors.accent} size={20} /></View>
              <View>
                <Text style={styles.certBrand}>HODIX</Text>
                <Text style={styles.certTagline}>Certificat d'Identité Financière</Text>
              </View>
            </View>
            <View style={styles.certDivider} />
            <Text style={styles.certName}>{identity.user.full_name}</Text>
            <Text style={styles.certMeta}>{identity.user.email}</Text>
            <Text style={styles.certMeta}>
              {[identity.user.city, identity.user.country].filter(Boolean).join(", ") || "—"}
            </Text>
            <View style={styles.certStats}>
              <View style={styles.certStat}>
                <Text style={styles.certStatVal}>{ts.score.toFixed(0)}<Text style={{ fontSize: 12, fontWeight: "600", color: Colors.textMuted }}>/1000</Text></Text>
                <Text style={styles.certStatLbl}>Score Identité</Text>
              </View>
              <View style={styles.certStat}>
                <Text style={styles.certStatVal}>{formatXAF(identity.totals.total_savings, identity.currency)}</Text>
                <Text style={styles.certStatLbl}>Total épargné</Text>
              </View>
              <View style={styles.certStat}>
                <Text style={styles.certStatVal}>{identity.totals.groups}</Text>
                <Text style={styles.certStatLbl}>Groupes</Text>
              </View>
            </View>
            <Text style={styles.certIssued}>Membre depuis {new Date(identity.user.created_at).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}</Text>
          </LinearGradient>
        </View>

        {/* === IDENTITY ENGINE: Bronze / Silver / Gold / Platinum === */}
        {tier ? (
          <>
            <SectionTitle>Niveau d'identité</SectionTitle>
            <View style={{ paddingHorizontal: Spacing.xl }}>
              <Card>
                <View style={styles.tierRow}>
                  <View style={[styles.tierMedal, { backgroundColor: tier.level_color }]}>
                    {tier.level_key === "platinum" ? <Crown color="#fff" size={26} /> :
                     tier.level_key === "gold" ? <Crown color="#fff" size={24} /> :
                     <Sparkles color="#fff" size={22} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tierLabel, { color: tier.level_color }]}>{tier.level}</Text>
                    <Text style={styles.tierPoints}>{tier.points} points · {tier.events_recorded} action{tier.events_recorded > 1 ? "s" : ""}</Text>
                    {tier.next_level ? (
                      <Text style={styles.tierNext}>+{tier.points_to_next} points pour atteindre {tier.next_level}</Text>
                    ) : (
                      <Text style={styles.tierNext}>🏆 Niveau maximal atteint</Text>
                    )}
                  </View>
                </View>
                <View style={styles.tierBar}>
                  <View style={[styles.tierFill, { width: `${tier.progress_within_level_pct}%`, backgroundColor: tier.level_color }]} />
                </View>
                <View style={styles.tierLegend}>
                  {[
                    { k: "bronze", lbl: "Bronze", c: "#CD7F32", r: "0-30" },
                    { k: "silver", lbl: "Silver", c: "#C0C0C0", r: "31-60" },
                    { k: "gold", lbl: "Gold", c: "#D4AF37", r: "61-80" },
                    { k: "platinum", lbl: "Platinum", c: "#8B5CF6", r: "81+" },
                  ].map((t) => (
                    <View key={t.k} style={styles.tierLegendCol}>
                      <View style={[styles.tierLegendDot, { backgroundColor: t.c, opacity: tier.level_key === t.k ? 1 : 0.4 }]} />
                      <Text style={[styles.tierLegendLbl, { color: tier.level_key === t.k ? Colors.text : Colors.textMuted }]}>{t.lbl}</Text>
                      <Text style={styles.tierLegendRange}>{t.r}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          </>
        ) : null}

        {/* Trust Score gauge */}
        <SectionTitle>Score de confiance</SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <Card style={{ alignItems: "center", paddingVertical: 24 }}>
            <TrustGauge score={ts.score} level={ts.level} color={ts.color} size={240} scoreMax={(ts as any).score_max ?? 1000} />
            <Text style={styles.riskLabel}>Niveau de risque : <Text style={{ color: ts.color, fontWeight: "800" }}>{ts.risk}</Text></Text>
          </Card>
        </View>

        {/* Credit Score CTA */}
        <View style={{ paddingHorizontal: Spacing.xl, marginTop: 4 }}>
          <TouchableOpacity
            onPress={() => router.push("/credit-score")}
            activeOpacity={0.85}
            style={creditStyles.cta}
          >
            <LinearGradient colors={["#0B1F3A", "#1D4ED8"]} style={creditStyles.ctaGrad}>
              <View style={creditStyles.ctaLeft}>
                <Award color="#D4AF37" size={22} />
                <View>
                  <Text style={creditStyles.ctaTitle}>Score de crédit détaillé</Text>
                  <Text style={creditStyles.ctaSub}>Régularité · Épargne · Réseau · KYC · Ancienneté</Text>
                </View>
              </View>
              <Text style={creditStyles.ctaArrow}>›</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Streaks CTA */}
        <TouchableOpacity onPress={() => router.push("/streaks" as any)} activeOpacity={0.85} style={{ marginHorizontal: Spacing.xl, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border }}>
            <Text style={{ fontSize: 24 }}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.text, fontWeight: "800", fontSize: 13 }}>Mes Streaks</Text>
              <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 1 }}>Séries de cotisations · Badges · Récompenses</Text>
            </View>
            <Text style={{ color: Colors.textMuted, fontSize: 20 }}>›</Text>
          </View>
        </TouchableOpacity>

        {/* QR Payment CTA */}
        <TouchableOpacity onPress={() => router.push("/qr-payment" as any)} activeOpacity={0.85} style={{ marginHorizontal: Spacing.xl, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border }}>
            <Text style={{ fontSize: 24 }}>📲</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.text, fontWeight: "800", fontSize: 13 }}>Mon QR de paiement</Text>
              <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 1 }}>Recevoir de l'argent · Partager sur WhatsApp</Text>
            </View>
            <Text style={{ color: Colors.textMuted, fontSize: 20 }}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Components — /1000 system */}
        <SectionTitle>Composantes du score</SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl, gap: 10 }}>
          <Component label="Bonus inscription" value={(ts.components as any).signup_bonus ?? 5} max={5} color={Colors.accent} hint="5 pts offerts à l'inscription" />
          <Component label="Points transactions" value={(ts.components as any).transaction_points ?? 0} max={990} color={Colors.secondary} hint="0,5 pt (1k–50k XAF) · 1 pt (50k+ XAF)" />
          <Component label="Bonus annuel" value={(ts.components as any).yearly_bonus ?? 0} max={50} color={Colors.primary} hint="5 pts/an d'activité régulière" />
        </View>

        {/* KYC card */}
        <SectionTitle>Vérification d'identité</SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl }}>
          <TouchableOpacity onPress={() => router.push("/kyc")} activeOpacity={0.85} testID="identity-go-kyc">
            <Card style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }}>
              <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: Colors.accent + "20", alignItems: "center", justifyContent: "center" }}>
                <ShieldCheck color={Colors.accent} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.text, fontWeight: "800", fontSize: 14 }}>Compléter votre KYC</Text>
                <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 2 }}>Niveau 1 : infos de base · Niveau 2 : CNI + selfie</Text>
              </View>
              <Text style={{ color: Colors.accent, fontWeight: "900", fontSize: 18 }}>›</Text>
            </Card>
          </TouchableOpacity>
        </View>

        {/* Tips */}
        {ts.tips.length > 0 ? (
          <>
            <SectionTitle>Recommandations pour vous</SectionTitle>
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

        {/* FREE certificates */}
        <SectionTitle>Documents gratuits</SectionTitle>
        <View style={{ paddingHorizontal: Spacing.xl, gap: 10 }}>
          <PDFButton testID="pdf-identity" icon={<ShieldCheck color={Colors.accent} size={20} />} title="Identité Financière" subtitle="Profil complet et vérifié" onPress={() => openPDF("identity")} loading={pdfLoading} />
          <PDFButton testID="pdf-savings" icon={<FileText color={Colors.primary} size={20} />} title="Résumé d'épargne" subtitle="Total et engagement" onPress={() => openPDF("savings")} loading={pdfLoading} />
          <Text style={styles.shareHint}>📱 Partagez par WhatsApp, Email, ou enregistrez-les directement.</Text>
        </View>

        {/* PREMIUM certified certificates */}
        <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.xl }}>
          {/* Section header row */}
          <View style={styles.premiumSectionHeader}>
            <Text style={styles.premiumSectionTitle}>Certificats Authentifiés</Text>
            <View style={styles.vipPill}>
              <Crown color={Colors.gold} size={11} />
              <Text style={styles.vipPillText}>VIP</Text>
            </View>
          </View>

          {/* Premium gradient card */}
          <LinearGradient
            colors={[Colors.gradGold1, Colors.gradGold3, Colors.gradGold2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.premiumCard}
          >
            {/* Crown + VIP */}
            <View style={styles.premiumCardTop}>
              <View style={styles.premiumCrownRow}>
                <Crown color="#fff" size={22} />
                <View style={styles.premiumVipBadge}>
                  <Text style={styles.premiumVipText}>VIP</Text>
                </View>
              </View>
              <View style={styles.premiumPriceBadge}>
                <Text style={styles.premiumPrice}>10 000 FCFA</Text>
              </View>
            </View>

            <Text style={styles.premiumCardTitle}>Certificat Authentifié Hodix</Text>
            <Text style={styles.premiumCardSubtitle}>
              Version officielle avec tampon et code de vérification
            </Text>

            <View style={styles.premiumDivider} />

            {/* Buttons */}
            <TouchableOpacity
              testID="cert-identity"
              style={styles.certBtn}
              activeOpacity={0.8}
              onPress={() => downloadCertified("identity")}
            >
              <Lock color={Colors.gradGold1} size={15} />
              <Text style={styles.certBtnText}>Identité Certifiée</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="cert-trust"
              style={[styles.certBtn, { marginTop: 8 }]}
              activeOpacity={0.8}
              onPress={() => downloadCertified("trust-score")}
            >
              <CheckCircle2 color={Colors.gradGold1} size={15} />
              <Text style={styles.certBtnText}>Trust Score Certifié</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="cert-savings"
              style={[styles.certBtn, { marginTop: 8 }]}
              activeOpacity={0.8}
              onPress={() => downloadCertified("savings")}
            >
              <Award color={Colors.gradGold1} size={15} />
              <Text style={styles.certBtnText}>Épargne Certifiée</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Component({ label, value, max, color, hint }: { label: string; value: number; max: number; color: string; hint?: string }) {
  const pct = (value / max) * 100;
  return (
    <Card style={{ padding: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ color: Colors.text, fontWeight: "700", fontSize: 14 }}>{label}</Text>
        <Text style={{ color: Colors.textMuted, fontWeight: "700", fontSize: 12 }}>
          {value.toFixed(1)} / {max}
        </Text>
      </View>
      {hint ? <Text style={{ color: Colors.textSubtle, fontSize: 11, marginBottom: 6, fontWeight: "500" }}>{hint}</Text> : null}
      <View style={{ height: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 4, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${Math.min(100, pct)}%`, backgroundColor: color, borderRadius: 4 }} />
      </View>
    </Card>
  );
}

function PDFButton({
  icon, title, subtitle, onPress, testID, loading,
}: { icon: React.ReactNode; title: string; subtitle: string; onPress: () => void; testID?: string; loading?: boolean }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} testID={testID} disabled={loading}>
      <Card style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12, opacity: loading ? 0.7 : 1 }}>
        <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
          {loading ? <ActivityIndicator size={18} color={Colors.secondary} /> : icon}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontWeight: "800", fontSize: 14 }}>{loading ? "Génération en cours…" : title}</Text>
          <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 2 }}>{loading ? "Veuillez patienter" : subtitle}</Text>
        </View>
        {!loading && <Share2 color={Colors.textMuted} size={18} />}
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  h1: { color: Colors.primary, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  certCard: { borderRadius: Radius.xxl, padding: 24, overflow: "hidden" },
  certHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  certBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(16,185,129,0.15)", alignItems: "center", justifyContent: "center" },
  certBrand: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 4 },
  certTagline: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600", letterSpacing: 1 },
  certDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: 16 },
  certName: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  certMeta: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 4, fontWeight: "500" },
  certStats: { flexDirection: "row", gap: 12, marginTop: 18, paddingTop: 18, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  certStat: { flex: 1 },
  certStatVal: { color: Colors.accent, fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  certStatLbl: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2, fontWeight: "600", letterSpacing: 0.3 },
  certIssued: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 16, fontWeight: "600", letterSpacing: 0.3 },
  riskLabel: { color: Colors.textMuted, fontSize: 13, marginTop: 12 },
  tip: { color: Colors.text, fontSize: 13, lineHeight: 19, flex: 1, fontWeight: "500" },
  shareHint: { color: Colors.textSubtle, fontSize: 12, textAlign: "center", marginTop: 4, fontWeight: "500" },
  tierRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  tierMedal: {
    width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center",
  },
  tierLabel: { fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  tierPoints: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  tierNext: { color: Colors.text, fontSize: 13, fontWeight: "700", marginTop: 4 },
  tierBar: { height: 10, backgroundColor: Colors.surfaceAlt, borderRadius: 5, overflow: "hidden" },
  tierFill: { height: "100%", borderRadius: 5 },
  tierLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, gap: 6 },
  tierLegendCol: { alignItems: "center", flex: 1 },
  tierLegendDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 4 },
  tierLegendLbl: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  tierLegendRange: { color: Colors.textSubtle, fontSize: 9, fontWeight: "600", marginTop: 1 },
  // VÉRIFIÉ stamp on cert card
  verifiedStamp: {
    position: "absolute",
    top: 16,
    right: 16,
    borderWidth: 1.5,
    borderColor: Colors.gold,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    transform: [{ rotate: "10deg" }],
  },
  verifiedText: {
    color: Colors.gold,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  // Premium section
  premiumSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: Spacing.md,
  },
  premiumSectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  vipPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.gold + "22",
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.gold + "55",
  },
  vipPillText: {
    color: Colors.gold,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  premiumCard: {
    borderRadius: Radius.xxl,
    padding: 22,
    marginBottom: Spacing.xl,
  },
  premiumCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  premiumCrownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  premiumVipBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumVipText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  premiumPriceBadge: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  premiumPrice: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  premiumCardTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  premiumCardSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
    lineHeight: 17,
  },
  premiumDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginVertical: 16,
  },
  certBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: Radius.lg,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  certBtnText: {
    color: Colors.gradGold1,
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },
});

const creditStyles = StyleSheet.create({
  cta: { borderRadius: Radius.xl, overflow: "hidden", marginBottom: 4 },
  ctaGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, gap: 12,
  },
  ctaLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  ctaTitle: { fontSize: 14, fontWeight: "800", color: "#fff" },
  ctaSub: { fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  ctaArrow: { fontSize: 24, color: "#fff", fontWeight: "300" },
});
