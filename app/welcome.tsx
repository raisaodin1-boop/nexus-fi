/**
 * HODIX Welcome Screen — Écran d'accueil premium panafricain
 * S'affiche une seule fois avant l'onboarding
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, G, Path, Polygon, Rect } from "react-native-svg";

import { CAROUSEL_SLIDES, UNITY_SLIDE, WELCOME_I18N } from "@/src/welcome-content";
import { PremiumVisualStack, CommunityAvatars, TRUST_BLOCK_COPY } from "@/src/welcome-visuals";
import { useFirstLaunch } from "@/src/use-first-launch";

const { width: W, height: H } = Dimensions.get("window");

// Auto-advance duration per slide (ms)
const SLIDE_DURATION = 2800;
// Fade animation duration (ms)
const FADE_DURATION = 600;

// ── Detect language ──────────────────────────────────────────────────────────

function detectLang(): "fr" | "en" {
  try {
    const locale =
      (Platform.OS === "web"
        ? (navigator as any).language
        : undefined) ?? "fr";
    return locale.toLowerCase().startsWith("en") ? "en" : "fr";
  } catch {
    return "fr";
  }
}

// ── Pattern backgrounds (SVG geometric art) ──────────────────────────────────

function KentePattern({ color, opacity = 0.18 }: { color: string; opacity?: number }) {
  const size = 40;
  const cols = Math.ceil(W / size) + 1;
  const rows = Math.ceil(H / size) + 1;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <Rect
            key={`${r}-${c}`}
            x={c * size}
            y={r * size}
            width={size * 0.48}
            height={size * 0.48}
            fill={color}
            opacity={(r + c) % 3 === 0 ? opacity : opacity * 0.4}
            rx={2}
          />
        ))
      )}
    </Svg>
  );
}

function WavePattern({ color, opacity = 0.15 }: { color: string; opacity?: number }) {
  const paths: string[] = [];
  for (let i = 0; i < 12; i++) {
    const y = (i * H) / 12;
    const amplitude = 18;
    const freq = W / 2.5;
    let d = `M 0 ${y}`;
    for (let x = 0; x <= W; x += 8) {
      const wy = y + Math.sin((x / freq) * Math.PI * 2 + i * 0.5) * amplitude;
      d += ` L ${x} ${wy}`;
    }
    paths.push(d);
  }
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      {paths.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={1.5} fill="none" opacity={opacity} />
      ))}
    </Svg>
  );
}

function DiamondPattern({ color, opacity = 0.14 }: { color: string; opacity?: number }) {
  const size = 50;
  const cols = Math.ceil(W / size) + 1;
  const rows = Math.ceil(H / size) + 1;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const cx = c * size + (r % 2 === 0 ? 0 : size / 2);
          const cy = r * size;
          const half = size * 0.3;
          const pts = `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;
          return (
            <Polygon key={`${r}-${c}`} points={pts} fill={color} opacity={opacity} />
          );
        })
      )}
    </Svg>
  );
}

function TrianglePattern({ color, opacity = 0.13 }: { color: string; opacity?: number }) {
  const size = 60;
  const cols = Math.ceil(W / size) + 2;
  const rows = Math.ceil(H / size) + 2;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const x = c * size - size / 2;
          const y = r * size;
          const pts =
            (r + c) % 2 === 0
              ? `${x + size / 2},${y} ${x + size},${y + size} ${x},${y + size}`
              : `${x},${y} ${x + size},${y} ${x + size / 2},${y + size}`;
          return (
            <Polygon
              key={`${r}-${c}`}
              points={pts}
              fill={color}
              opacity={(r + c) % 3 === 0 ? opacity : opacity * 0.5}
            />
          );
        })
      )}
    </Svg>
  );
}

function CirclePattern({ color, opacity = 0.12 }: { color: string; opacity?: number }) {
  const spacing = 55;
  const cols = Math.ceil(W / spacing) + 1;
  const rows = Math.ceil(H / spacing) + 1;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <Circle
            key={`${r}-${c}`}
            cx={c * spacing + (r % 2 === 0 ? 0 : spacing / 2)}
            cy={r * spacing}
            r={(r + c) % 3 === 0 ? 14 : 7}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            opacity={opacity}
          />
        ))
      )}
    </Svg>
  );
}

function StripePattern({ color, opacity = 0.12 }: { color: string; opacity?: number }) {
  const count = 14;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }).map((_, i) => {
        const x = (i / count) * W * 1.4 - W * 0.2;
        return (
          <Rect
            key={i}
            x={x}
            y={-H * 0.1}
            width={W / count / 2}
            height={H * 1.2}
            fill={color}
            opacity={i % 2 === 0 ? opacity : opacity * 0.5}
            transform={`rotate(-25, ${W / 2}, ${H / 2})`}
          />
        );
      })}
    </Svg>
  );
}

function BogolonPattern({ color, opacity = 0.14 }: { color: string; opacity?: number }) {
  const size = 45;
  const cols = Math.ceil(W / size) + 1;
  const rows = Math.ceil(H / size) + 1;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const x = c * size;
          const y = r * size;
          const variant = (r * cols + c) % 4;
          if (variant === 0)
            return <Rect key={`${r}-${c}`} x={x} y={y} width={size * 0.5} height={size * 0.5} fill={color} opacity={opacity} rx={4} />;
          if (variant === 1)
            return <Circle key={`${r}-${c}`} cx={x + size * 0.5} cy={y + size * 0.5} r={size * 0.2} fill={color} opacity={opacity} />;
          if (variant === 2)
            return <Polygon key={`${r}-${c}`} points={`${x + size * 0.25},${y} ${x + size * 0.75},${y} ${x + size * 0.5},${y + size * 0.6}`} fill={color} opacity={opacity} />;
          return <Rect key={`${r}-${c}`} x={x + size * 0.1} y={y + size * 0.1} width={size * 0.8} height={size * 0.8} fill="none" stroke={color} strokeWidth={1} opacity={opacity * 0.7} rx={6} />;
        })
      )}
    </Svg>
  );
}

function AnkaraPattern({ color, opacity = 0.15 }: { color: string; opacity?: number }) {
  const size = 64;
  const cols = Math.ceil(W / size) + 1;
  const rows = Math.ceil(H / size) + 1;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const cx = c * size + size / 2;
          const cy = r * size + size / 2;
          return (
            <G key={`${r}-${c}`}>
              <Circle cx={cx} cy={cy} r={size * 0.35} fill="none" stroke={color} strokeWidth={1.5} opacity={opacity} />
              <Circle cx={cx} cy={cy} r={size * 0.15} fill={color} opacity={opacity * 0.7} />
              <Rect x={cx - 1} y={cy - size * 0.35} width={2} height={size * 0.7} fill={color} opacity={opacity * 0.5} />
              <Rect x={cx - size * 0.35} y={cy - 1} width={size * 0.7} height={2} fill={color} opacity={opacity * 0.5} />
            </G>
          );
        })
      )}
    </Svg>
  );
}

function PatternRenderer({ pattern, color }: { pattern: string; color: string }) {
  switch (pattern) {
    case "kente": return <KentePattern color={color} />;
    case "waves": return <WavePattern color={color} />;
    case "diamonds": return <DiamondPattern color={color} />;
    case "triangles": return <TrianglePattern color={color} />;
    case "circles": return <CirclePattern color={color} />;
    case "stripes": return <StripePattern color={color} />;
    case "bogolan": return <BogolonPattern color={color} />;
    case "ankara": return <AnkaraPattern color={color} />;
    default: return <KentePattern color={color} />;
  }
}

// ── Star particles in the background ────────────────────────────────────────

function StarField() {
  const stars = useRef(
    Array.from({ length: 40 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.8 + 0.5,
      opacity: Math.random() * 0.4 + 0.1,
    }))
  ).current;

  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.opacity} />
      ))}
    </Svg>
  );
}

// ── Animated gradient background ─────────────────────────────────────────────

function AnimatedBackground({
  gradient,
  children,
}: {
  gradient: [string, string, string];
  children: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={StyleSheet.absoluteFill}
    >
      {children}
    </LinearGradient>
  );
}

// ── Hodix Logo mark ──────────────────────────────────────────────────────────

function HodixMark({ size = 56, color = "#C9A227" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      {/* Outer hexagon ring — pan-African motif */}
      <Polygon
        points="28,2 52,14 52,42 28,54 4,42 4,14"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        opacity={0.9}
      />
      {/* Inner diamond */}
      <Polygon
        points="28,10 44,28 28,46 12,28"
        fill={color}
        opacity={0.15}
      />
      {/* H letterform */}
      <Rect x="17" y="18" width="4" height="20" fill={color} rx={2} />
      <Rect x="35" y="18" width="4" height="20" fill={color} rx={2} />
      <Rect x="17" y="26" width="22" height="4" fill={color} rx={2} />
    </Svg>
  );
}

// ── Carousel slide content ───────────────────────────────────────────────────

function SlideContent({
  slide,
  lang,
  fadeAnim,
  slideAnim,
}: {
  slide: typeof CAROUSEL_SLIDES[0];
  lang: "fr" | "en";
  fadeAnim: Animated.Value;
  slideAnim: Animated.Value;
}) {
  const greeting = lang === "fr" ? slide.greeting_fr : slide.greeting_en;

  return (
    <Animated.View
      style={[
        styles.slideContent,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* Country badge */}
      <View style={styles.countryBadge}>
        <Text style={styles.flagEmoji}>{slide.flag}</Text>
        <Text style={styles.countryName}>
          {lang === "fr" ? slide.country_fr : slide.country_en}
        </Text>
      </View>

      {/* Tontine name */}
      <Text style={styles.tontineName}>{slide.tontine_name}</Text>

      {/* Greeting */}
      <Text style={styles.greeting}>{greeting}</Text>

      {/* Decorative line */}
      <View style={[styles.decorLine, { backgroundColor: slide.accent }]} />
    </Animated.View>
  );
}

// ── Unity (final) slide ──────────────────────────────────────────────────────

function UnitySlide({
  lang,
  fadeAnim,
  slideAnim,
}: {
  lang: "fr" | "en";
  fadeAnim: Animated.Value;
  slideAnim: Animated.Value;
}) {
  const t = WELCOME_I18N[lang];
  return (
    <Animated.View
      style={[
        styles.unityContent,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Text style={styles.unityNames}>{t.unity_line1}</Text>
      <Text style={styles.unityNames}>{t.unity_line2}</Text>
      <View style={styles.unityDivider} />
      <Text style={styles.unityTitle}>{t.unity_title}</Text>
      <Text style={styles.unitySub}>{t.unity_sub1}</Text>
      <Text style={styles.unitySub}>{t.unity_sub2}</Text>
      <Text style={styles.unityBrand}>{t.unity_brand}</Text>
      <CommunityAvatars width={Math.min(W - 80, 200)} />
    </Animated.View>
  );
}

// ── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current && styles.dotActive,
          ]}
        />
      ))}
    </View>
  );
}

// ── Main WelcomeScreen ───────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const router = useRouter();
  const { markAsSeen } = useFirstLaunch();
  const colorScheme = useColorScheme();
  const lang = detectLang();
  const t = WELCOME_I18N[lang];

  const allSlides = [...CAROUSEL_SLIDES, { ...UNITY_SLIDE, isUnity: true } as any];
  const totalSlides = allSlides.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [bgGradient, setBgGradient] = useState<[string, string, string]>(
    CAROUSEL_SLIDES[0].gradient
  );

  // Animation values
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleSlide = useRef(new Animated.Value(24)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const carouselFade = useRef(new Animated.Value(0)).current;
  const carouselSlide = useRef(new Animated.Value(20)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(0.88)).current;
  const btnPulse = useRef(new Animated.Value(1)).current;
  const bgOpacity = useRef(new Animated.Value(1)).current;

  // Entrance animation
  useEffect(() => {
    Animated.stagger(120, [
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(titleSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(carouselFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(carouselSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(btnOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(btnScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
      ]),
    ]).start(() => startPulse());
  }, []);

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(btnPulse, { toValue: 1.04, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(btnPulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Auto-advance carousel
  const advanceSlide = useCallback(() => {
    // Fade out
    Animated.parallel([
      Animated.timing(carouselFade, { toValue: 0, duration: FADE_DURATION, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(carouselSlide, { toValue: -12, duration: FADE_DURATION, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % totalSlides;
        const nextSlide = allSlides[next];
        setBgGradient(nextSlide.gradient ?? UNITY_SLIDE.gradient);
        return next;
      });
      // Reset and fade in
      carouselSlide.setValue(18);
      Animated.parallel([
        Animated.timing(carouselFade, { toValue: 1, duration: FADE_DURATION, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(carouselSlide, { toValue: 0, duration: FADE_DURATION, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
  }, [totalSlides]);

  useEffect(() => {
    const timer = setInterval(advanceSlide, SLIDE_DURATION);
    return () => clearInterval(timer);
  }, [advanceSlide]);

  const handleStart = useCallback(async () => {
    // Animate button press
    await new Promise<void>((resolve) =>
      Animated.sequence([
        Animated.timing(btnScale, { toValue: 0.94, duration: 100, useNativeDriver: true }),
        Animated.timing(btnScale, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start(() => resolve())
    );
    await markAsSeen();
    router.replace("/onboarding");
  }, [markAsSeen, router]);

  const currentSlide = allSlides[currentIndex];
  const isUnity = !!(currentSlide as any).isUnity;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Animated gradient background */}
      <AnimatedBackground gradient={bgGradient}>
        {/* Geometric pattern layer */}
        {!isUnity && (
          <PatternRenderer
            pattern={(currentSlide as any).pattern ?? "kente"}
            color={(currentSlide as any).accent ?? "#FFFFFF"}
          />
        )}
        {isUnity && <StarField />}

        {/* Radial vignette overlay for depth */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.82)"]}
          start={{ x: 0.5, y: 0.1 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── Hero: vision headline ─────────────────────────── */}
          <View style={styles.topSection}>
            <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
              <View style={styles.logoGlow} />
              <HodixMark size={44} color="#C9A227" />
            </Animated.View>

            <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleSlide }] }}>
              <Text style={styles.heroLine1}>{t.hero_line1}</Text>
              <Text style={styles.heroLine2}>{t.hero_line2}</Text>
            </Animated.View>

            <Animated.Text style={[styles.heroSub, { opacity: taglineOpacity }]}>
              {t.hero_sub}
            </Animated.Text>

            <Animated.Text style={[styles.visionTag, { opacity: taglineOpacity }]}>
              {t.vision_tag}
            </Animated.Text>
          </View>

          {/* ── Premium visual stack ──────────────────────────── */}
          <Animated.View style={[styles.visualSection, { opacity: carouselFade }]}>
            <PremiumVisualStack />
          </Animated.View>

          {/* ── Trust Score block ─────────────────────────────── */}
          <View style={styles.trustSection}>
            <View style={styles.trustCard}>
              <View style={styles.trustAccentBar} />
              <Text style={styles.trustTitle}>{TRUST_BLOCK_COPY[lang].title}</Text>
              <Text style={styles.trustSub}>{TRUST_BLOCK_COPY[lang].sub}</Text>
            </View>
          </View>

          {/* ── Cultural carousel (compact) ───────────────────── */}
          <View style={styles.carouselSection}>
            <View style={[styles.glassCard, styles.glassCardCompact]}>
              {/* Card inner glow top */}
              <View style={styles.glassCardGlow} />

              {isUnity ? (
                <UnitySlide
                  lang={lang}
                  fadeAnim={carouselFade}
                  slideAnim={carouselSlide}
                />
              ) : (
                <SlideContent
                  slide={currentSlide as any}
                  lang={lang}
                  fadeAnim={carouselFade}
                  slideAnim={carouselSlide}
                />
              )}
            </View>

            {/* Progress dots */}
            <ProgressDots total={totalSlides} current={currentIndex} />
          </View>

          {/* ── Bottom: CTA button ────────────────────────────── */}
          <View style={styles.bottomSection}>
            <Animated.View
              style={[
                { opacity: btnOpacity, transform: [{ scale: Animated.multiply(btnScale, btnPulse) }] },
              ]}
            >
              <TouchableOpacity
                onPress={handleStart}
                activeOpacity={0.88}
                style={styles.ctaOuter}
                testID="welcome-start"
              >
                <LinearGradient
                  colors={["#C9A227", "#10B981", "#0F766E"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.ctaGradient}
                >
                  <Text style={styles.ctaText}>{t.cta}</Text>
                  <Text style={styles.ctaArrow}>→</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            <Text style={styles.footerTagline}>{t.tagline}</Text>
          </View>

        </ScrollView>
        </SafeAreaView>
      </AnimatedBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B1F3A",
  },
  safe: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },

  // ── Hero ─────────────────────────────────────────────────────
  topSection: {
    alignItems: "center",
    paddingTop: 20,
    paddingHorizontal: 24,
    gap: 6,
  },
  logoWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  logoGlow: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#C9A227",
    opacity: 0.1,
  },
  heroLine1: {
    fontSize: 26,
    fontWeight: "800",
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  heroLine2: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.8,
    lineHeight: 34,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    lineHeight: 22,
    fontWeight: "500",
    maxWidth: 340,
    marginTop: 4,
  },
  visionTag: {
    fontSize: 12,
    color: "#10B981",
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "600",
    fontStyle: "italic",
    maxWidth: 320,
    marginTop: 6,
  },

  // ── Visual stack ─────────────────────────────────────────────
  visualSection: {
    alignItems: "center",
    paddingVertical: 8,
    minHeight: 260,
  },

  // ── Trust block ──────────────────────────────────────────────
  trustSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  trustCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.25)",
    overflow: "hidden",
  },
  trustAccentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#C9A227",
  },
  trustTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 24,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  trustSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.65)",
    lineHeight: 20,
    fontWeight: "500",
  },

  // ── Carousel ─────────────────────────────────────────────────
  carouselSection: {
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  glassCard: {
    width: W - 40,
    minHeight: H * 0.14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  glassCardCompact: {
    minHeight: undefined,
    paddingVertical: 16,
  },
  glassCardGlow: {
    position: "absolute",
    top: 0,
    left: "10%",
    right: "10%",
    height: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 1,
  },

  // ── Slide content ─────────────────────────────────────────────
  slideContent: {
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  countryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  flagEmoji: {
    fontSize: 18,
  },
  countryName: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  tontineName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#10B981",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  greeting: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    fontWeight: "600",
    lineHeight: 20,
  },
  decorLine: {
    height: 3,
    width: 48,
    borderRadius: 2,
    marginTop: 8,
    opacity: 0.8,
  },

  // ── Unity slide ───────────────────────────────────────────────
  unityContent: {
    alignItems: "center",
    gap: 8,
  },
  unityNames: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
  },
  unityDivider: {
    height: 1,
    width: 60,
    backgroundColor: "#F5C842",
    opacity: 0.6,
    marginVertical: 10,
  },
  unityTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  unitySub: {
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  unityBrand: {
    fontSize: 12,
    color: "#C9A227",
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 4,
    marginBottom: 8,
  },

  // ── Progress dots ─────────────────────────────────────────────
  dotsRow: {
    flexDirection: "row",
    gap: 5,
    marginTop: 20,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    maxWidth: W - 80,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: {
    width: 18,
    backgroundColor: "#10B981",
  },

  // ── Bottom / CTA ──────────────────────────────────────────────
  bottomSection: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  footerTagline: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    fontWeight: "600",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  ctaOuter: {
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 48,
    paddingVertical: 18,
    gap: 10,
    minWidth: 220,
  },
  ctaText: {
    color: "#0B1F3A",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  ctaArrow: {
    color: "#0B1F3A",
    fontSize: 18,
    fontWeight: "900",
  },
});
