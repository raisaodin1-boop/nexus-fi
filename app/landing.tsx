/**
 * Marketing landing — web-first, premium fintech storytelling.
 */
import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";

import {
  PremiumVisualStack,
  CommunityAvatars,
} from "@/src/welcome-visuals";
import {
  AppShowcase,
  CommunityEmotionalVisual,
  LandingFadeIn,
  PersonaStrip,
  ScoreEvolutionIllustration,
  TrustScoreTimeline,
} from "@/src/landing-visuals";
import {
  CAROUSEL_SLIDES,
  LANDING_I18N,
  WELCOME_I18N,
} from "@/src/welcome-content";
import { APP_MAX_WIDTH } from "@/src/hooks/use-responsive";

const NAVY = "#0B1F3A";
const EMERALD = "#10B981";
const GOLD = "#C9A227";

function detectLang(): "fr" | "en" {
  try {
    const locale =
      Platform.OS === "web"
        ? (typeof navigator !== "undefined" ? navigator.language : "fr")
        : "fr";
    return locale.toLowerCase().startsWith("en") ? "en" : "fr";
  } catch {
    return "fr";
  }
}

export default function LandingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const lang = useMemo(() => detectLang(), []);
  const copy = LANDING_I18N[lang];
  const welcome = WELCOME_I18N[lang];
  const isWide = width >= 768;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.container, { maxWidth: APP_MAX_WIDTH }]}>
          {/* Nav */}
          <View style={styles.nav}>
            <Text style={styles.logo}>HODIX</Text>
            <View style={styles.navActions}>
              <TouchableOpacity onPress={() => router.push("/login")}>
                <Text style={styles.navLink}>
                  {lang === "en" ? "Sign in" : "Connexion"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.navCta}
                onPress={() => router.push("/register")}
              >
                <Text style={styles.navCtaText}>{copy.nav_cta}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Hero */}
          <LinearGradient
            colors={[NAVY, "#0F2847", "#134E4A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroGlowE} pointerEvents="none" />
            <View style={styles.heroGlowG} pointerEvents="none" />

            <View style={[styles.heroInner, isWide && styles.heroInnerWide]}>
              <View style={styles.heroCopy}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{copy.hero_chip}</Text>
                </View>
                <Text style={[styles.heroTitle, isWide && styles.heroTitleWide]}>
                  {copy.hero_title}
                </Text>
                <Text style={styles.heroSub}>{copy.hero_sub}</Text>
                <Text style={styles.slogan}>{copy.slogan}</Text>

                <View style={styles.heroCtas}>
                  <TouchableOpacity
                    style={styles.ctaPrimary}
                    onPress={() => router.push("/register")}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.ctaPrimaryText}>{copy.hero_cta}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.ctaGhost}
                    onPress={() => router.push("/onboarding")}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.ctaGhostText}>{copy.hero_secondary}</Text>
                  </TouchableOpacity>
                </View>

                <CommunityAvatars width={isWide ? 180 : 160} />
              </View>

              <View style={styles.heroVisual}>
                <PremiumVisualStack />
              </View>
            </View>
          </LinearGradient>

          {/* Emotional community */}
          <LandingFadeIn style={styles.emotionalSection}>
            <Text style={styles.sectionHeading}>{copy.emotional_title}</Text>
            <Text style={styles.emotionalSub}>{copy.emotional_sub}</Text>
            <View style={styles.emotionalVisualWrap}>
              <CommunityEmotionalVisual width={isWide ? 560 : Math.min(width - 40, 360)} />
            </View>
            <PersonaStrip personas={copy.personas} />
          </LandingFadeIn>

          {/* Trust Score timeline */}
          <LandingFadeIn delay={80} style={styles.section}>
            <View style={styles.trustPremium}>
              <View style={isWide ? styles.trustPremiumHeaderWide : undefined}>
                <View style={styles.trustPremiumCopy}>
                  <Text style={styles.sectionEyebrow}>Trust Score</Text>
                  <Text style={styles.trustPremiumTitle}>
                    {copy.trust_section_title}
                  </Text>
                  <Text style={styles.trustPremiumSub}>{copy.trust_section_sub}</Text>
                  <ScoreEvolutionIllustration width={isWide ? 320 : 280} />
                </View>
              </View>
              <TrustScoreTimeline steps={copy.trust_steps} />
            </View>
          </LandingFadeIn>

          {/* App showcase */}
          <LandingFadeIn delay={120} style={styles.section}>
            <View style={styles.appShowcaseSection}>
              <Text style={styles.sectionEyebrow}>HODIX App</Text>
              <Text style={styles.sectionHeading}>{copy.app_section_title}</Text>
              <Text style={styles.sectionLead}>{copy.app_section_sub}</Text>
              <AppShowcase screens={copy.app_screens} />
            </View>
          </LandingFadeIn>

          {/* Features */}
          <LandingFadeIn delay={160} style={styles.section}>
            <Text style={styles.sectionHeading}>
              {lang === "en" ? "Why HODIX" : "Pourquoi HODIX"}
            </Text>
            <View style={[styles.featureGrid, isWide && styles.featureGridWide]}>
              <FeatureCard
                title={copy.section_community_title}
                body={copy.section_community_body}
                accent={EMERALD}
              />
              <FeatureCard
                title={copy.section_wallet_title}
                body={copy.section_wallet_body}
                accent={GOLD}
              />
              <FeatureCard
                title={copy.section_trust_title}
                body={copy.section_trust_body}
                accent="#3B82F6"
              />
            </View>
          </LandingFadeIn>

          {/* Countries / tontines */}
          <LandingFadeIn delay={200} style={styles.section}>
            <Text style={styles.sectionHeading}>{welcome.unity_title}</Text>
            <Text style={styles.unitySub}>
              {welcome.unity_sub1} · {welcome.unity_sub2}
            </Text>
            <Text style={styles.unityBrand}>{welcome.unity_brand}</Text>
            <View style={styles.countryRow}>
              {CAROUSEL_SLIDES.map((slide) => (
                <View key={slide.id} style={styles.countryChip}>
                  <Text style={styles.countryFlag}>{slide.flag}</Text>
                  <Text style={styles.countryName}>
                    {lang === "en" ? slide.country_en : slide.country_fr}
                  </Text>
                  <Text style={styles.tontineName}>{slide.tontine_name}</Text>
                </View>
              ))}
            </View>
          </LandingFadeIn>

          {/* Final CTA */}
          <LandingFadeIn delay={240}>
            <LinearGradient
              colors={[NAVY, "#134E4A"]}
              style={styles.finalCta}
            >
              <Text style={styles.finalSlogan}>{copy.slogan}</Text>
              <Text style={styles.finalTitle}>{copy.final_cta_title}</Text>
              <Text style={styles.finalSub}>{copy.final_cta_sub}</Text>
              <TouchableOpacity
                style={styles.ctaPrimary}
                onPress={() => router.push("/register")}
                activeOpacity={0.85}
              >
                <Text style={styles.ctaPrimaryText}>{copy.hero_cta}</Text>
              </TouchableOpacity>
            </LinearGradient>
          </LandingFadeIn>

          <Text style={styles.footer}>{copy.footer}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureCard({
  title,
  body,
  accent,
}: {
  title: string;
  body: string;
  accent: string;
}) {
  return (
    <View style={[styles.featureCard, { borderTopColor: accent }]}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F1F5F9" },
  scroll: { alignItems: "center", paddingBottom: 56 },
  container: { width: "100%", paddingHorizontal: 20 },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
  },
  logo: {
    fontSize: 24,
    fontWeight: "900",
    color: NAVY,
    letterSpacing: 2.5,
  },
  navActions: { flexDirection: "row", alignItems: "center", gap: 18 },
  navLink: { color: NAVY, fontWeight: "600", fontSize: 14 },
  navCta: {
    backgroundColor: EMERALD,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: EMERALD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  navCtaText: { color: NAVY, fontWeight: "800", fontSize: 13 },
  hero: {
    borderRadius: 28,
    padding: 28,
    overflow: "hidden",
    marginBottom: 40,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 40,
    elevation: 12,
  },
  heroGlowE: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: EMERALD,
    opacity: 0.12,
    top: -100,
    right: -80,
  },
  heroGlowG: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: GOLD,
    opacity: 0.1,
    bottom: -60,
    left: -40,
  },
  heroInner: { gap: 32 },
  heroInnerWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroCopy: { flex: 1 },
  heroVisual: { alignItems: "center", minWidth: 280 },
  chip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(16,185,129,0.15)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 18,
  },
  chipText: { color: EMERALD, fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  heroTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#F8FAFC",
    lineHeight: 38,
    letterSpacing: -0.6,
    marginBottom: 14,
  },
  heroTitleWide: {
    fontSize: 36,
    lineHeight: 44,
  },
  heroSub: {
    fontSize: 16,
    color: "rgba(226,232,240,0.92)",
    lineHeight: 24,
    marginBottom: 12,
  },
  slogan: {
    fontSize: 14,
    color: GOLD,
    fontWeight: "700",
    lineHeight: 20,
    marginBottom: 24,
  },
  heroCtas: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  ctaPrimary: {
    backgroundColor: EMERALD,
    paddingHorizontal: 22,
    paddingVertical: 15,
    borderRadius: 12,
    shadowColor: EMERALD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaPrimaryText: { color: NAVY, fontWeight: "800", fontSize: 15 },
  ctaGhost: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    paddingHorizontal: 22,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  ctaGhostText: { color: "#E2E8F0", fontWeight: "600", fontSize: 15 },
  emotionalSection: {
    marginBottom: 44,
    gap: 12,
  },
  emotionalSub: {
    fontSize: 15,
    color: "#64748B",
    lineHeight: 22,
    marginBottom: 8,
  },
  emotionalVisualWrap: {
    alignItems: "center",
    marginVertical: 16,
  },
  section: { marginBottom: 44 },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: EMERALD,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 26,
    fontWeight: "800",
    color: NAVY,
    marginBottom: 12,
    letterSpacing: -0.4,
  },
  sectionLead: {
    fontSize: 15,
    color: "#64748B",
    lineHeight: 22,
    marginBottom: 8,
    maxWidth: 560,
  },
  trustPremium: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 28,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  trustPremiumHeaderWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  trustPremiumCopy: { marginBottom: 8 },
  trustPremiumTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: NAVY,
    lineHeight: 30,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  trustPremiumSub: {
    fontSize: 15,
    color: "#64748B",
    lineHeight: 22,
    marginBottom: 16,
    maxWidth: 520,
  },
  appShowcaseSection: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  featureGrid: { gap: 16 },
  featureGridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  featureCard: {
    flex: 1,
    minWidth: 240,
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderTopWidth: 4,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  featureTitle: { fontSize: 17, fontWeight: "800", color: NAVY, marginBottom: 8 },
  featureBody: { fontSize: 14, color: "#475569", lineHeight: 21 },
  unitySub: { fontSize: 15, color: "#475569", marginBottom: 4 },
  unityBrand: {
    fontSize: 16,
    fontWeight: "700",
    color: EMERALD,
    marginBottom: 18,
  },
  countryRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  countryChip: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minWidth: 124,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  countryFlag: { fontSize: 22, marginBottom: 6 },
  countryName: { fontSize: 12, fontWeight: "700", color: NAVY },
  tontineName: { fontSize: 11, color: EMERALD, fontWeight: "600", marginTop: 2 },
  finalCta: {
    borderRadius: 24,
    padding: 36,
    alignItems: "center",
    marginBottom: 28,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 8,
  },
  finalSlogan: {
    fontSize: 15,
    fontWeight: "700",
    color: GOLD,
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  finalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#F8FAFC",
    textAlign: "center",
    marginBottom: 10,
    lineHeight: 32,
    maxWidth: 560,
  },
  finalSub: {
    fontSize: 15,
    color: "rgba(226,232,240,0.9)",
    textAlign: "center",
    marginBottom: 24,
    maxWidth: 480,
    lineHeight: 22,
  },
  footer: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 13,
    paddingBottom: 20,
    lineHeight: 20,
  },
});
