/**
 * HODIX — Landing page premium. Vision émotionnelle, storytelling fort.
 * Aucune logique métier modifiée. Uniquement visuel & UX.
 */
import React, { useEffect, useRef, useMemo, useState } from "react";
import {
  Animated,
  Easing,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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
import { CAROUSEL_SLIDES, LANDING_I18N, WELCOME_I18N } from "@/src/welcome-content";
import { AuctionHighlight, SecurityFeesSection } from "@/src/landing-visuals";
import { APP_MAX_WIDTH } from "@/src/hooks/use-responsive";
import {
  formatRatePct,
  formatSavingsVolumeXaf,
  formatStatCount,
  getPublicPlatformStats,
  type PublicPlatformStats,
} from "@/src/db/platform-stats";
import { TrustBenefitsPanel } from "@/src/trust-benefits-panel";

const NAVY    = "#0B1F3A";
const EMERALD = "#10B981";
const GOLD    = "#C9A227";
const SLATE   = "#64748B";
const LIGHT   = "#F8FAFC";

function detectLang(): "fr" | "en" {
  try {
    const locale = Platform.OS === "web"
      ? (typeof navigator !== "undefined" ? navigator.language : "fr")
      : "fr";
    return locale.toLowerCase().startsWith("en") ? "en" : "fr";
  } catch { return "fr"; }
}

// ── Animated fade-in wrapper ────────────────────────────────────────
function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim,  { toValue: 1, duration: 600, delay, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 600, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: slide }] }}>
      {children}
    </Animated.View>
  );
}

// ── Stats strip ─────────────────────────────────────────────────────
function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <View style={ss.statPill}>
      <Text style={ss.statValue}>{value}</Text>
      <Text style={ss.statLabel}>{label}</Text>
    </View>
  );
}

// ── Persona card ────────────────────────────────────────────────────
const PERSONA_ICONS = ["👨‍👩‍👧‍👦", "🏪", "🚀", "🤝", "🎓", "🌍"];
function PersonaCard({ icon, title, desc, accent }: { icon: string; title: string; desc: string; accent: string }) {
  return (
    <View style={[ss.personaCard, { borderTopColor: accent }]}>
      <Text style={ss.personaIcon}>{icon}</Text>
      <Text style={ss.personaTitle}>{title}</Text>
      <Text style={ss.personaDesc}>{desc}</Text>
    </View>
  );
}

// ── Trust journey step ──────────────────────────────────────────────
function JourneyStep({ num, icon, title, desc, accent, last }: {
  num: number; icon: string; title: string; desc: string; accent: string; last?: boolean;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 1400 + num * 200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 1400 + num * 200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={ss.stepRow}>
      <View style={ss.stepLeft}>
        <Animated.View style={[ss.stepCircle, { backgroundColor: accent, transform: [{ scale: pulse }] }]}>
          <Text style={ss.stepIcon}>{icon}</Text>
        </Animated.View>
        {!last && <View style={[ss.stepLine, { backgroundColor: accent + "44" }]} />}
      </View>
      <View style={ss.stepContent}>
        <Text style={ss.stepNum}>Étape {num}</Text>
        <Text style={ss.stepTitle}>{title}</Text>
        <Text style={ss.stepDesc}>{desc}</Text>
      </View>
    </View>
  );
}

// ── Feature card ────────────────────────────────────────────────────
function FeatureCard({ icon, title, body, accent }: { icon: string; title: string; body: string; accent: string }) {
  return (
    <View style={[ss.featureCard, { borderTopColor: accent }]}>
      <View style={[ss.featureIconBox, { backgroundColor: accent + "18" }]}>
        <Text style={ss.featureIcon}>{icon}</Text>
      </View>
      <Text style={ss.featureTitle}>{title}</Text>
      <Text style={ss.featureBody}>{body}</Text>
    </View>
  );
}

// ── Main component ──────────────────────────────────────────────────
export default function LandingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const lang  = useMemo(() => detectLang(), []);
  const copy  = LANDING_I18N[lang];
  const welcome = WELCOME_I18N[lang];
  const trustCopy = TRUST_BLOCK_COPY[lang];
  const isWide = width >= 768;
  const [stats, setStats] = useState<PublicPlatformStats | null>(null);

  useEffect(() => {
    getPublicPlatformStats().then(setStats).catch(() => setStats(null));
  }, []);

  const statsDisplay = useMemo(() => {
    const s = stats;
    return {
      members: s ? formatStatCount(s.users_count) : "12k+",
      groups: s ? formatStatCount(s.groups_count) : "2.4k+",
      collected: s ? formatSavingsVolumeXaf(s.savings_volume_xaf) : "850M+ XAF",
      participation: s ? formatRatePct(s.participation_rate_pct) : "87%",
      repayment: s ? formatRatePct(s.repayment_rate_pct) : "96%",
      countries: "12",
    };
  }, [stats]);

  const JOURNEY_STEPS = [
    { icon: "📈", title: copy.journey_step1_title, desc: copy.journey_step1_desc, accent: EMERALD },
    { icon: "⭐", title: copy.journey_step2_title, desc: copy.journey_step2_desc, accent: GOLD },
    { icon: "🤝", title: copy.journey_step3_title, desc: copy.journey_step3_desc, accent: "#3B82F6" },
    { icon: "🚀", title: copy.journey_step4_title, desc: copy.journey_step4_desc, accent: "#8B5CF6" },
  ];

  const PERSONA_DATA = [
    { icon: PERSONA_ICONS[0], title: copy.persona_family,       desc: copy.persona_family_desc,       accent: EMERALD },
    { icon: PERSONA_ICONS[1], title: copy.persona_merchant,     desc: copy.persona_merchant_desc,     accent: GOLD },
    { icon: PERSONA_ICONS[2], title: copy.persona_entrepreneur, desc: copy.persona_entrepreneur_desc, accent: "#3B82F6" },
    { icon: PERSONA_ICONS[3], title: copy.persona_association,  desc: copy.persona_association_desc,  accent: "#8B5CF6" },
    { icon: PERSONA_ICONS[4], title: copy.persona_youth,        desc: copy.persona_youth_desc,        accent: "#F59E0B" },
    { icon: PERSONA_ICONS[5], title: copy.persona_diaspora,     desc: copy.persona_diaspora_desc,     accent: "#EF4444" },
  ];

  return (
    <SafeAreaView style={ss.safe} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={ss.scroll} showsVerticalScrollIndicator={false}>
        <View style={[ss.container, { maxWidth: APP_MAX_WIDTH }]}>

          {/* ── Nav ───────────────────────────────────────────── */}
          <View style={ss.nav}>
            <View style={ss.navBrand}>
              <Text style={ss.logo}>HODIX</Text>
              <View style={ss.navDot} />
            </View>
            <View style={ss.navActions}>
              <TouchableOpacity onPress={() => router.push("/login")}>
                <Text style={ss.navLink}>Connexion</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ss.navCta} onPress={() => router.push("/register")}>
                <Text style={ss.navCtaText}>{copy.nav_cta}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Hero ──────────────────────────────────────────── */}
          <LinearGradient
            colors={[NAVY, "#0D2340", "#0F4A3C"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={ss.hero}
          >
            {/* Ambient glows */}
            <View style={ss.glowE} pointerEvents="none" />
            <View style={ss.glowG} pointerEvents="none" />
            <View style={ss.glowB} pointerEvents="none" />

            <View style={[ss.heroInner, isWide && ss.heroInnerWide]}>
              <View style={ss.heroCopy}>
                <FadeIn delay={0}>
                  <View style={ss.chip}>
                    <Text style={ss.chipText}>{copy.hero_badge}</Text>
                  </View>
                </FadeIn>

                <FadeIn delay={100}>
                  <Text style={[ss.heroTitle, isWide && ss.heroTitleWide]}>
                    {copy.hero_title}
                  </Text>
                </FadeIn>

                <FadeIn delay={200}>
                  <Text style={ss.heroSub}>{copy.hero_sub}</Text>
                </FadeIn>

                <FadeIn delay={280}>
                  <Text style={ss.heroVision}>{copy.hero_vision_line}</Text>
                </FadeIn>

                <FadeIn delay={320}>
                  <Text style={ss.heroTagline}>{copy.hero_tagline}</Text>
                </FadeIn>

                <FadeIn delay={360}>
                  <View style={ss.heroCtas}>
                    <TouchableOpacity style={ss.ctaPrimary} onPress={() => router.push("/register")}>
                      <Text style={ss.ctaPrimaryText}>{copy.hero_cta}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={ss.ctaGhost} onPress={() => router.push("/onboarding")}>
                      <Text style={ss.ctaGhostText}>{copy.hero_secondary}</Text>
                    </TouchableOpacity>
                  </View>
                </FadeIn>

                <FadeIn delay={440}>
                  <View style={ss.socialProofRow}>
                    <CommunityAvatars width={isWide ? 180 : 160} />
                    <Text style={ss.socialProofText}>{copy.hero_social}</Text>
                  </View>
                </FadeIn>
              </View>

              <FadeIn delay={200}>
                <View style={ss.heroVisual}>
                  <PremiumVisualStack />
                </View>
              </FadeIn>
            </View>
          </LinearGradient>

          {/* ── Stats strip (live when available) ─────────────── */}
          <FadeIn delay={0}>
            <View style={[ss.statsStrip, isWide && ss.statsStripWide]}>
              <StatPill value={statsDisplay.members} label={copy.stats_members_label} />
              <View style={ss.statDivider} />
              <StatPill value={statsDisplay.groups} label={copy.stats_groups_label} />
              <View style={ss.statDivider} />
              <StatPill value={statsDisplay.collected} label={copy.stats_collected_label} />
              <View style={ss.statDivider} />
              <StatPill value={statsDisplay.participation} label={copy.stats_participation_label} />
              <View style={ss.statDivider} />
              <StatPill value={statsDisplay.repayment} label={copy.stats_repayment_label} />
              <View style={ss.statDivider} />
              <StatPill value={statsDisplay.countries} label={copy.stats_countries_label} />
            </View>
          </FadeIn>

          {/* ── Network effect ──────────────────────────────── */}
          <FadeIn delay={20}>
            <View style={ss.section}>
              <View style={ss.sectionHeader}>
                <View style={ss.sectionBadge}>
                  <Text style={ss.sectionBadgeText}>RÉSEAU</Text>
                </View>
                <Text style={ss.sectionHeading}>{copy.network_heading}</Text>
                <Text style={ss.sectionSub}>{copy.network_sub}</Text>
              </View>
              <View style={[ss.networkGrid, isWide && ss.networkGridWide]}>
                {(copy.network_points ?? []).map((p, i) => (
                  <View key={p.title} style={ss.networkCard}>
                    <Text style={ss.networkEmoji}>{p.emoji}</Text>
                    <Text style={ss.networkTitle}>{p.title}</Text>
                    <Text style={ss.networkBody}>{p.body}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={ss.networkCta} onPress={() => router.push("/register")}>
                <Text style={ss.networkCtaText}>{copy.network_cta}</Text>
              </TouchableOpacity>
            </View>
          </FadeIn>

          {/* ── Diaspora acquisition ──────────────────────────── */}
          <FadeIn delay={40}>
            <LinearGradient colors={["#0B1F3A", "#1E3A5F", "#0F766E"]} style={ss.diasporaSection}>
              <View style={ss.diasporaInner}>
                <View style={[ss.sectionBadge, { borderColor: "rgba(201,162,39,0.5)", backgroundColor: "rgba(201,162,39,0.12)" }]}>
                  <Text style={[ss.sectionBadgeText, { color: GOLD }]}>{copy.diaspora_badge}</Text>
                </View>
                <Text style={[ss.sectionHeading, { color: LIGHT, textAlign: "left" }]}>{copy.diaspora_title}</Text>
                <Text style={[ss.sectionSub, { color: "rgba(226,232,240,0.8)", textAlign: "left" }]}>{copy.diaspora_sub}</Text>
                {(copy.diaspora_points ?? []).map((point: string, i: number) => (
                  <View key={i} style={ss.diasporaPointRow}>
                    <Text style={ss.diasporaBullet}>✓</Text>
                    <Text style={ss.diasporaPointText}>{point}</Text>
                  </View>
                ))}
                <View style={ss.diasporaCtas}>
                  <TouchableOpacity style={ss.ctaPrimary} onPress={() => router.push("/register")}>
                    <Text style={ss.ctaPrimaryText}>{copy.diaspora_cta}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={ss.diasporaVideoBtn}
                    onPress={() => Linking.openURL("https://www.hodix.app/register").catch(() => router.push("/register"))}
                  >
                    <Text style={ss.diasporaVideoText}>▶ {copy.diaspora_video_label}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
          </FadeIn>

          {/* ── Security & fees ───────────────────────────────── */}
          <FadeIn delay={60}>
            <View style={ss.section}>
              <SecurityFeesSection
                securityEyebrow={copy.security_eyebrow}
                feesEyebrow={copy.fees_eyebrow}
                securityTitle={copy.security_section_title}
                securitySub={copy.security_section_sub}
                securityItems={copy.security_items}
                feesTitle={copy.fees_section_title}
                feesSub={copy.fees_section_sub}
                feesRows={copy.fees_rows}
                feesNote={copy.fees_note}
                isWide={isWide}
              />
            </View>
          </FadeIn>

          {/* ── Tontine auctions ──────────────────────────────── */}
          <FadeIn delay={80}>
            <View style={ss.section}>
              <AuctionHighlight
                title={copy.auction_section_title}
                subtitle={copy.auction_section_sub}
                steps={copy.auction_steps}
                ctaLabel={copy.auction_cta}
                onCta={() => router.push("/register")}
              />
            </View>
          </FadeIn>

          {/* ── Personas ──────────────────────────────────────── */}
          <View style={ss.section}>
            <FadeIn>
              <View style={ss.sectionHeader}>
                <View style={ss.sectionBadge}>
                  <Text style={ss.sectionBadgeText}>POUR VOUS</Text>
                </View>
                <Text style={ss.sectionHeading}>{copy.personas_heading}</Text>
                <Text style={ss.sectionSub}>{copy.personas_sub}</Text>
              </View>
            </FadeIn>
            <View style={[ss.personaGrid, isWide && ss.personaGridWide]}>
              {PERSONA_DATA.map((p, i) => (
                <FadeIn key={i} delay={i * 60}>
                  <PersonaCard {...p} />
                </FadeIn>
              ))}
            </View>
          </View>

          {/* ── App showcase ──────────────────────────────────── */}
          <LinearGradient colors={[NAVY, "#0D2340"]} style={ss.showcaseSection}>
            <View style={ss.glowE2} pointerEvents="none" />
            <FadeIn>
              <View style={ss.sectionHeader}>
                <View style={[ss.sectionBadge, { borderColor: "rgba(16,185,129,0.4)", backgroundColor: "rgba(16,185,129,0.1)" }]}>
                  <Text style={[ss.sectionBadgeText, { color: EMERALD }]}>L'APPLICATION</Text>
                </View>
                <Text style={[ss.sectionHeading, { color: LIGHT }]}>{copy.showcase_heading}</Text>
                <Text style={[ss.sectionSub, { color: "rgba(226,232,240,0.7)" }]}>{copy.showcase_sub}</Text>
              </View>
            </FadeIn>
            <FadeIn delay={100}>
              <View style={[ss.showcaseRow, isWide && ss.showcaseRowWide]}>
                <PremiumVisualStack />
                <View style={ss.showcaseFeatures}>
                  {[
                    { icon: "💰", label: "Wallet multi-devises", sub: "XAF · XOF · NGN · GHS · EUR · USD" },
                    { icon: "📊", label: "Trust Score en temps réel", sub: "Votre réputation financière visible" },
                    { icon: "👥", label: "Gestion de groupes", sub: "Tontines, associations, coopératives" },
                    { icon: "📈", label: "Statistiques détaillées", sub: "Historique et évolution de vos cotisations" },
                    { icon: "🔔", label: "Alertes & notifications", sub: "Rappels de paiement et événements du groupe" },
                    { icon: "🔒", label: "Sécurité KYC intégrée", sub: "Vérification d'identité et transactions protégées" },
                  ].map((f, i) => (
                    <View key={i} style={ss.showcaseFeatureRow}>
                      <View style={ss.showcaseFeatureIcon}>
                        <Text style={{ fontSize: 18 }}>{f.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={ss.showcaseFeatureLabel}>{f.label}</Text>
                        <Text style={ss.showcaseFeatureSub}>{f.sub}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </FadeIn>
          </LinearGradient>

          {/* ── Trust Score Journey ───────────────────────────── */}
          <View style={[ss.section, ss.journeySection]}>
            <FadeIn>
              <View style={ss.sectionHeader}>
                <View style={ss.sectionBadge}>
                  <Text style={ss.sectionBadgeText}>TRUST SCORE</Text>
                </View>
                <Text style={ss.sectionHeading}>{copy.journey_heading}</Text>
                <Text style={ss.sectionSub}>{copy.journey_sub}</Text>
              </View>
            </FadeIn>
            <View style={[ss.journeyInner, isWide && ss.journeyInnerWide]}>
              <View style={ss.journeySteps}>
                {JOURNEY_STEPS.map((s, i) => (
                  <FadeIn key={i} delay={i * 100}>
                    <JourneyStep
                      num={i + 1}
                      icon={s.icon}
                      title={s.title}
                      desc={s.desc}
                      accent={s.accent}
                      last={i === JOURNEY_STEPS.length - 1}
                    />
                  </FadeIn>
                ))}
              </View>
              <FadeIn delay={200}>
                <View style={ss.journeyVisual}>
                  <TrustScoreHeroBlock lang={lang} />
                  <View style={ss.trustDescBox}>
                    <Text style={ss.trustDescTitle}>{trustCopy.title}</Text>
                    <Text style={ss.trustDescSub}>{trustCopy.sub}</Text>
                  </View>
                </View>
              </FadeIn>
            </View>
          </View>

          {/* ── Trust Score benefits ──────────────────────────── */}
          <View style={[ss.section, { paddingHorizontal: 0 }]}>
            <FadeIn>
              <View style={[ss.sectionHeader, { paddingHorizontal: 20 }]}>
                <View style={ss.sectionBadge}>
                  <Text style={ss.sectionBadgeText}>TRUST SCORE</Text>
                </View>
                <Text style={ss.sectionHeading}>{copy.trust_benefits_heading}</Text>
                <Text style={ss.sectionSub}>{copy.trust_benefits_sub}</Text>
              </View>
              <View style={{ paddingHorizontal: 20 }}>
                <TrustBenefitsPanel lang={lang} compact />
              </View>
            </FadeIn>
          </View>

          {/* ── Features ──────────────────────────────────────── */}
          <View style={ss.section}>
            <FadeIn>
              <View style={ss.sectionHeader}>
                <View style={ss.sectionBadge}>
                  <Text style={ss.sectionBadgeText}>POURQUOI HODIX</Text>
                </View>
                <Text style={ss.sectionHeading}>Une infrastructure financière complète</Text>
              </View>
            </FadeIn>
            <View style={[ss.featureGrid, isWide && ss.featureGridWide]}>
              <FadeIn delay={0}>
                <FeatureCard icon="🌍" title={copy.section_community_title} body={copy.section_community_body} accent={EMERALD} />
              </FadeIn>
              <FadeIn delay={80}>
                <FeatureCard icon="💳" title={copy.section_wallet_title} body={copy.section_wallet_body} accent={GOLD} />
              </FadeIn>
              <FadeIn delay={160}>
                <FeatureCard icon="⭐" title={copy.section_trust_title} body={copy.section_trust_body} accent="#3B82F6" />
              </FadeIn>
              <FadeIn delay={240}>
                <FeatureCard icon="🔒" title={copy.section_security_title} body={copy.section_security_body} accent="#8B5CF6" />
              </FadeIn>
            </View>
          </View>

          {/* ── Vision / roadmap ──────────────────────────────── */}
          <View style={ss.section}>
            <FadeIn>
              <View style={ss.sectionHeader}>
                <View style={ss.sectionBadge}>
                  <Text style={ss.sectionBadgeText}>VISION</Text>
                </View>
                <Text style={ss.sectionHeading}>{copy.vision_heading}</Text>
                <Text style={ss.sectionSub}>{copy.vision_sub}</Text>
              </View>
              <View style={[ss.visionGrid, isWide && ss.visionGridWide]}>
                {(copy.vision_pillars ?? []).map((p) => (
                  <View key={p.title} style={ss.visionCard}>
                    <View style={[ss.visionBadge, p.label === "Bientôt" || p.label === "Soon"
                      ? { backgroundColor: "rgba(100,116,139,0.15)" }
                      : { backgroundColor: "rgba(16,185,129,0.15)" }]}>
                      <Text style={[ss.visionBadgeText, p.label === "Bientôt" || p.label === "Soon"
                        ? { color: SLATE } : { color: EMERALD }]}>{p.label}</Text>
                    </View>
                    <Text style={ss.visionTitle}>{p.title}</Text>
                    <Text style={ss.visionBody}>{p.body}</Text>
                  </View>
                ))}
              </View>
            </FadeIn>
          </View>

          {/* ── Countries ─────────────────────────────────────── */}
          <View style={ss.section}>
            <FadeIn>
              <View style={ss.sectionHeader}>
                <View style={ss.sectionBadge}>
                  <Text style={ss.sectionBadgeText}>AFRIQUE</Text>
                </View>
                <Text style={ss.sectionHeading}>{welcome.unity_title}</Text>
                <Text style={ss.sectionSub}>{welcome.unity_sub1} · {welcome.unity_sub2}</Text>
                <Text style={ss.unityBrand}>{welcome.unity_brand}</Text>
              </View>
            </FadeIn>
            <View style={ss.countryRow}>
              {CAROUSEL_SLIDES.map((slide, i) => (
                <FadeIn key={slide.id} delay={i * 60}>
                  <View style={ss.countryChip}>
                    <Text style={ss.countryFlag}>{slide.flag}</Text>
                    <Text style={ss.countryName}>{lang === "en" ? slide.country_en : slide.country_fr}</Text>
                    <Text style={ss.tontineName}>{slide.tontine_name}</Text>
                  </View>
                </FadeIn>
              ))}
            </View>
          </View>

          {/* ── Final CTA ─────────────────────────────────────── */}
          <LinearGradient colors={[NAVY, "#0A2E24", "#0F2847"]} style={ss.finalSection}>
            <View style={ss.finalGlow} pointerEvents="none" />
            <FadeIn>
              <Text style={ss.finalEyebrow}>Cotisez aujourd'hui. Construisez votre avenir demain.</Text>
              <Text style={ss.finalTitle}>{copy.final_title}</Text>
              <Text style={ss.finalSub}>{copy.final_sub}</Text>
              <TouchableOpacity style={ss.finalCta} onPress={() => router.push("/register")}>
                <Text style={ss.finalCtaText}>{copy.final_cta}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/login")} style={{ marginTop: 14 }}>
                <Text style={ss.finalLogin}>J'ai déjà un compte → Connexion</Text>
              </TouchableOpacity>
            </FadeIn>
          </LinearGradient>

          <Text style={ss.footer}>{copy.footer}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: LIGHT },
  scroll: { alignItems: "center", paddingBottom: 48 },
  container: { width: "100%", maxWidth: 1100, alignSelf: "center", paddingHorizontal: 20 },

  // Nav
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 18 },
  navBrand: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { fontSize: 22, fontWeight: "900", color: NAVY, letterSpacing: 2 },
  navDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: EMERALD },
  navActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  navLink: { color: NAVY, fontWeight: "600", fontSize: 14 },
  navCta: { backgroundColor: EMERALD, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 },
  navCtaText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  // Hero
  hero: { borderRadius: 28, padding: 28, overflow: "hidden", marginBottom: 0 },
  glowE: { position: "absolute", width: 320, height: 320, borderRadius: 160, backgroundColor: EMERALD, opacity: 0.09, top: -100, right: -80 },
  glowG: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: GOLD, opacity: 0.07, bottom: -60, left: -40 },
  glowB: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "#3B82F6", opacity: 0.06, top: 40, left: -60 },
  heroInner: { gap: 28, width: "100%" },
  heroInnerWide: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroCopy: { flex: 1, minWidth: 0 },
  heroVisual: { alignItems: "center", width: 300, flexShrink: 0 },
  chip: { alignSelf: "flex-start", backgroundColor: "rgba(16,185,129,0.14)", borderWidth: 1, borderColor: "rgba(16,185,129,0.3)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 18 },
  chipText: { color: EMERALD, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  heroTitle: { fontSize: 30, fontWeight: "900", color: "#F8FAFC", lineHeight: 38, letterSpacing: -0.8, marginBottom: 14 },
  heroTitleWide: { fontSize: 38, lineHeight: 46 },
  heroSub: { fontSize: 15, color: "rgba(226,232,240,0.88)", lineHeight: 24, marginBottom: 10 },
  heroVision: { fontSize: 14, color: "rgba(226,232,240,0.92)", lineHeight: 21, marginBottom: 10, fontWeight: "600" },
  heroTagline: { fontSize: 13, color: GOLD, fontWeight: "700", fontStyle: "italic", marginBottom: 22, letterSpacing: 0.3 },
  heroCtas: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 22 },
  ctaPrimary: { backgroundColor: EMERALD, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 12 },
  ctaPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  ctaGhost: { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.28)", paddingHorizontal: 22, paddingVertical: 14, borderRadius: 12 },
  ctaGhostText: { color: "#E2E8F0", fontWeight: "600", fontSize: 15 },
  socialProofRow: { gap: 10 },
  socialProofText: { color: "rgba(226,232,240,0.6)", fontSize: 12, fontWeight: "500", marginTop: 4 },

  // Stats
  statsStrip: { flexDirection: "row", flexWrap: "wrap", backgroundColor: "#fff", borderRadius: 18, padding: 20, marginTop: -1, marginBottom: 32, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4, justifyContent: "space-around" },
  statsStripWide: { flexWrap: "nowrap" },
  statPill: { alignItems: "center", flex: 1, minWidth: 80, paddingVertical: 4 },
  statValue: { fontSize: 20, fontWeight: "900", color: NAVY, marginBottom: 2 },
  statLabel: { fontSize: 11, color: SLATE, fontWeight: "500", textAlign: "center" },
  statDivider: { width: 1, backgroundColor: "#E2E8F0", marginHorizontal: 4 },

  // Sections
  section: { marginBottom: 40 },
  sectionHeader: { marginBottom: 24, alignItems: "center" },
  sectionBadge: { alignSelf: "center", borderWidth: 1, borderColor: "rgba(11,31,58,0.18)", backgroundColor: "rgba(11,31,58,0.05)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginBottom: 12 },
  sectionBadgeText: { fontSize: 10, fontWeight: "800", color: NAVY, letterSpacing: 1.5 },
  sectionHeading: { fontSize: 24, fontWeight: "900", color: NAVY, textAlign: "center", marginBottom: 10, lineHeight: 32 },
  sectionSub: { fontSize: 15, color: SLATE, textAlign: "center", lineHeight: 22, maxWidth: 520 },
  unityBrand: { fontSize: 16, fontWeight: "700", color: EMERALD, textAlign: "center", marginTop: 6, marginBottom: 16 },

  // Personas
  personaGrid: { gap: 14 },
  personaGridWide: { flexDirection: "row", flexWrap: "wrap" },
  personaCard: { flex: 1, minWidth: 150, backgroundColor: "#fff", borderRadius: 18, padding: 20, borderWidth: 1, borderColor: "#E8EEF4", borderTopWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  personaIcon: { fontSize: 28, marginBottom: 10 },
  personaTitle: { fontSize: 15, fontWeight: "800", color: NAVY, marginBottom: 6 },
  personaDesc: { fontSize: 13, color: SLATE, lineHeight: 19 },

  // App showcase
  showcaseSection: { borderRadius: 28, padding: 28, marginBottom: 40, overflow: "hidden" },
  glowE2: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: EMERALD, opacity: 0.07, bottom: -60, right: -40 },
  showcaseRow: { gap: 24, alignItems: "center" },
  showcaseRowWide: { flexDirection: "row", justifyContent: "space-between" },
  showcaseFeatures: { flex: 1, gap: 16 },
  showcaseFeatureRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  showcaseFeatureIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  showcaseFeatureLabel: { color: "#F8FAFC", fontSize: 14, fontWeight: "700", marginBottom: 2 },
  showcaseFeatureSub: { color: "rgba(226,232,240,0.6)", fontSize: 12 },

  // Trust Journey
  journeySection: { backgroundColor: "#fff", borderRadius: 24, padding: 28, borderWidth: 1, borderColor: "#E2E8F0" },
  journeyInner: { gap: 24 },
  journeyInnerWide: { flexDirection: "row", alignItems: "flex-start" },
  journeySteps: { flex: 1, gap: 0 },
  journeyVisual: { alignItems: "center", gap: 20, paddingTop: 8 },
  trustDescBox: { maxWidth: 260, alignItems: "center" },
  trustDescTitle: { fontSize: 15, fontWeight: "700", color: NAVY, textAlign: "center", marginBottom: 6 },
  trustDescSub: { fontSize: 13, color: SLATE, textAlign: "center", lineHeight: 19 },
  stepRow: { flexDirection: "row", gap: 16, marginBottom: 0 },
  stepLeft: { alignItems: "center", width: 48 },
  stepCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  stepIcon: { fontSize: 20 },
  stepLine: { width: 2, flex: 1, minHeight: 24, marginBottom: 4 },
  stepContent: { flex: 1, paddingTop: 4, paddingBottom: 20 },
  stepNum: { fontSize: 10, fontWeight: "700", color: SLATE, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  stepTitle: { fontSize: 15, fontWeight: "800", color: NAVY, marginBottom: 4 },
  stepDesc: { fontSize: 13, color: SLATE, lineHeight: 19 },

  // Features
  featureGrid: { gap: 14 },
  featureGridWide: { flexDirection: "row", flexWrap: "wrap" },
  featureCard: { flex: 1, minWidth: 220, backgroundColor: "#fff", borderRadius: 18, padding: 22, borderWidth: 1, borderColor: "#E8EEF4", borderTopWidth: 4 },
  featureIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  featureIcon: { fontSize: 22 },
  featureTitle: { fontSize: 15, fontWeight: "800", color: NAVY, marginBottom: 8 },
  featureBody: { fontSize: 13, color: SLATE, lineHeight: 20 },

  // Countries
  countryRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  countryChip: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", minWidth: 110 },
  countryFlag: { fontSize: 22, marginBottom: 6 },
  countryName: { fontSize: 12, fontWeight: "700", color: NAVY },
  tontineName: { fontSize: 11, color: EMERALD, fontWeight: "600", marginTop: 2 },

  // Final CTA
  finalSection: { borderRadius: 28, padding: 36, alignItems: "center", marginBottom: 28, overflow: "hidden" },
  finalGlow: { position: "absolute", width: 300, height: 300, borderRadius: 150, backgroundColor: EMERALD, opacity: 0.06, top: -80 },
  finalEyebrow: { color: GOLD, fontSize: 13, fontWeight: "700", fontStyle: "italic", textAlign: "center", marginBottom: 16, letterSpacing: 0.3 },
  finalTitle: { fontSize: 30, fontWeight: "900", color: "#F8FAFC", textAlign: "center", lineHeight: 40, marginBottom: 14 },
  finalSub: { fontSize: 15, color: "rgba(226,232,240,0.8)", textAlign: "center", marginBottom: 28, maxWidth: 420, lineHeight: 22 },
  finalCta: { backgroundColor: EMERALD, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14 },
  finalCtaText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  finalLogin: { color: "rgba(226,232,240,0.55)", fontSize: 13, textDecorationLine: "underline" },

  diasporaSection: { marginHorizontal: 20, marginBottom: 40, borderRadius: 24, overflow: "hidden" },
  diasporaInner: { padding: 28, gap: 10 },
  diasporaPointRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 4 },
  diasporaBullet: { color: EMERALD, fontWeight: "900", fontSize: 14 },
  diasporaPointText: { color: "rgba(248,250,252,0.9)", fontSize: 14, flex: 1, lineHeight: 20 },
  diasporaCtas: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 },
  diasporaVideoBtn: { borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, justifyContent: "center" },
  diasporaVideoText: { color: LIGHT, fontWeight: "700", fontSize: 14 },

  networkGrid: { gap: 12 },
  networkGridWide: { flexDirection: "row", flexWrap: "wrap" },
  networkCard: {
    flex: 1, minWidth: 220, backgroundColor: "#fff", borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  networkEmoji: { fontSize: 24, marginBottom: 8 },
  networkTitle: { fontSize: 15, fontWeight: "800", color: NAVY, marginBottom: 6 },
  networkBody: { fontSize: 13, color: SLATE, lineHeight: 19 },
  networkCta: {
    alignSelf: "flex-start", marginTop: 16, backgroundColor: NAVY,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12,
  },
  networkCtaText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  visionGrid: { gap: 12 },
  visionGridWide: { flexDirection: "row", flexWrap: "wrap" },
  visionCard: {
    flex: 1, minWidth: 240, backgroundColor: "#fff", borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  visionBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 10 },
  visionBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  visionTitle: { fontSize: 15, fontWeight: "800", color: NAVY, marginBottom: 6 },
  visionBody: { fontSize: 13, color: SLATE, lineHeight: 19 },

  footer: { textAlign: "center", color: "#94A3B8", fontSize: 12, paddingBottom: 16, lineHeight: 18 },
});
