/**
 * Marketing landing — web-first, same premium visuals as welcome/onboarding.
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
  TrustScoreHeroBlock,
  TRUST_BLOCK_COPY,
  CommunityAvatars,
} from "@/src/welcome-visuals";
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
  const trustCopy = TRUST_BLOCK_COPY[lang];
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
                <Text style={styles.navLink}>Connexion</Text>
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
                  <Text style={styles.chipText}>
                    {welcome.unity_line1}
                  </Text>
                </View>
                <Text style={styles.heroTitle}>{copy.hero_title}</Text>
                <Text style={styles.heroSub}>{copy.hero_sub}</Text>
                <Text style={styles.tagline}>{welcome.tagline}</Text>

                <View style={styles.heroCtas}>
                  <TouchableOpacity
                    style={styles.ctaPrimary}
                    onPress={() => router.push("/register")}
                  >
                    <Text style={styles.ctaPrimaryText}>{copy.hero_cta}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.ctaGhost}
                    onPress={() => router.push("/onboarding")}
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

          {/* Trust Score section */}
          <View style={[styles.section, styles.trustSection]}>
            <View style={isWide ? styles.trustRow : undefined}>
              <TrustScoreHeroBlock lang={lang} />
              <View style={styles.trustText}>
                <Text style={styles.sectionTitle}>{copy.section_trust_title}</Text>
                <Text style={styles.sectionBody}>{trustCopy.title}</Text>
                <Text style={styles.sectionMuted}>{trustCopy.sub}</Text>
              </View>
            </View>
          </View>

          {/* Features */}
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Pourquoi Hodix</Text>
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
          </View>

          {/* Countries / tontines */}
          <View style={styles.section}>
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
          </View>

          {/* Final CTA */}
          <LinearGradient
            colors={[NAVY, "#134E4A"]}
            style={styles.finalCta}
          >
            <Text style={styles.finalTitle}>
              {welcome.hero_line1}{"\n"}{welcome.hero_line2}
            </Text>
            <Text style={styles.finalSub}>{welcome.hero_sub}</Text>
            <TouchableOpacity
              style={styles.ctaPrimary}
              onPress={() => router.push("/register")}
            >
              <Text style={styles.ctaPrimaryText}>{welcome.cta}</Text>
            </TouchableOpacity>
          </LinearGradient>

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
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { alignItems: "center", paddingBottom: 48 },
  container: { width: "100%", paddingHorizontal: 20 },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  logo: {
    fontSize: 22,
    fontWeight: "900",
    color: NAVY,
    letterSpacing: 2,
  },
  navActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  navLink: { color: NAVY, fontWeight: "600", fontSize: 14 },
  navCta: {
    backgroundColor: EMERALD,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navCtaText: { color: NAVY, fontWeight: "700", fontSize: 13 },
  hero: {
    borderRadius: 24,
    padding: 24,
    overflow: "hidden",
    marginBottom: 32,
  },
  heroGlowE: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: EMERALD,
    opacity: 0.1,
    top: -80,
    right: -60,
  },
  heroGlowG: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: GOLD,
    opacity: 0.08,
    bottom: -40,
    left: -30,
  },
  heroInner: { gap: 24 },
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  chipText: { color: EMERALD, fontSize: 11, fontWeight: "600" },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F8FAFC",
    lineHeight: 34,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  heroSub: {
    fontSize: 15,
    color: "rgba(226,232,240,0.9)",
    lineHeight: 22,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 13,
    color: GOLD,
    fontWeight: "600",
    fontStyle: "italic",
    marginBottom: 20,
  },
  heroCtas: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  ctaPrimary: {
    backgroundColor: EMERALD,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctaPrimaryText: { color: NAVY, fontWeight: "800", fontSize: 15 },
  ctaGhost: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctaGhostText: { color: "#E2E8F0", fontWeight: "600", fontSize: 15 },
  section: { marginBottom: 36 },
  sectionHeading: {
    fontSize: 22,
    fontWeight: "800",
    color: NAVY,
    marginBottom: 16,
  },
  trustSection: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 32,
  },
  trustText: { flex: 1 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: GOLD,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 18,
    fontWeight: "700",
    color: NAVY,
    lineHeight: 24,
    marginBottom: 8,
  },
  sectionMuted: { fontSize: 14, color: "#64748B", lineHeight: 20 },
  featureGrid: { gap: 16 },
  featureGridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  featureCard: {
    flex: 1,
    minWidth: 240,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderTopWidth: 4,
  },
  featureTitle: { fontSize: 16, fontWeight: "800", color: NAVY, marginBottom: 8 },
  featureBody: { fontSize: 14, color: "#475569", lineHeight: 20 },
  unitySub: { fontSize: 15, color: "#475569", marginBottom: 4 },
  unityBrand: {
    fontSize: 16,
    fontWeight: "700",
    color: EMERALD,
    marginBottom: 16,
  },
  countryRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  countryChip: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minWidth: 120,
  },
  countryFlag: { fontSize: 20, marginBottom: 4 },
  countryName: { fontSize: 12, fontWeight: "700", color: NAVY },
  tontineName: { fontSize: 11, color: EMERALD, fontWeight: "600", marginTop: 2 },
  finalCta: {
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    marginBottom: 24,
  },
  finalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#F8FAFC",
    textAlign: "center",
    marginBottom: 8,
  },
  finalSub: {
    fontSize: 14,
    color: "rgba(226,232,240,0.85)",
    textAlign: "center",
    marginBottom: 20,
    maxWidth: 480,
  },
  footer: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 13,
    paddingBottom: 16,
  },
});
