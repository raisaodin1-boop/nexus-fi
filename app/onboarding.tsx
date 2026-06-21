// HODIX Premium Onboarding — vision-first, Trust Score hero
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles } from "lucide-react-native";

import { Radius, Spacing } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import {
  PremiumVisualStack, TrustScoreRing, VirtualCard,
  ProgressChart, CommunityAvatars,
} from "@/src/welcome-visuals";

const { width } = Dimensions.get("window");

type VisualKind = "stack" | "trust" | "community" | "card" | "chart" | "sparkle";

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  gradient: [string, string, ...string[]];
  stat?: { value: string; label: string };
  visual: VisualKind;
}

const SLIDES: Slide[] = [
  {
    id: "vision",
    title: "Transformez vos cotisations",
    subtitle: "en identité financière",
    description:
      "HODIX n'est pas seulement une application — c'est l'infrastructure qui transforme la finance communautaire africaine en historique vérifiable, partout sur le continent.",
    gradient: ["#0B1F3A", "#0F2847", "#132238"],
    stat: { value: "10 000+", label: "membres actifs" },
    visual: "stack",
  },
  {
    id: "trust",
    title: "Votre Trust Score",
    subtitle: "votre réputation financière",
    description:
      "Plus vous cotisez régulièrement, plus votre score augmente. Votre historique devient une preuve de confiance — pour emprunter, investir et grandir.",
    gradient: ["#0A1628", "#132238", "#1A3A5C"],
    stat: { value: "847", label: "score moyen des membres actifs" },
    visual: "trust",
  },
  {
    id: "community",
    title: "Finance communautaire",
    subtitle: "sécurisée et moderne",
    description:
      "Tontines, associations, coopératives, fonds collectifs — un seul écosystème pour fédérer votre communauté avec transparence et confiance.",
    gradient: ["#0B1F3A", "#0F766E", "#0D5C56"],
    stat: { value: "98%", label: "de cotisations à temps" },
    visual: "community",
  },
  {
    id: "wallet",
    title: "Épargnez · Cotisez",
    subtitle: "Empruntez · Progressez",
    description:
      "Wallet multi-devises, paiements Mobile Money, objectifs d'épargne et certificats officiels. Le pont entre la finance informelle et la finance moderne.",
    gradient: ["#0B1F3A", "#1E56A0", "#0F2847"],
    stat: { value: "2,4M XAF", label: "épargnés en moyenne" },
    visual: "card",
  },
  {
    id: "future",
    title: "Bâtissez",
    subtitle: "votre avenir financier",
    description:
      "Rejoignez la première infrastructure qui transforme les cotisations communautaires en identité financière vérifiable. Gratuit, sécurisé, certifié.",
    gradient: ["#0A1628", "#0F2847", "#10B981"],
    stat: { value: "100%", label: "gratuit et sécurisé" },
    visual: "sparkle",
  },
];

function SlideVisual({ kind }: { kind: VisualKind }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [kind]);

  return (
    <Animated.View style={[styles.visualWrap, { opacity: fade }]}>
      {kind === "stack" && <PremiumVisualStack />}
      {kind === "trust" && (
        <View style={styles.trustVisual}>
          <TrustScoreRing size={120} score={847} />
          <View style={styles.trustChart}>
            <ProgressChart width={140} height={52} />
            <Text style={styles.trustChartLabel}>Progression sur 6 mois</Text>
          </View>
        </View>
      )}
      {kind === "community" && (
        <View style={styles.communityVisual}>
          <CommunityAvatars width={220} />
          <View style={styles.communityDots}>
            {[EMERALD, "#1E56A0", "#C9A227", "#8B5CF6"].map((c, i) => (
              <View key={i} style={[styles.communityDot, { backgroundColor: c }]} />
            ))}
          </View>
        </View>
      )}
      {kind === "card" && (
        <View style={styles.cardVisual}>
          <VirtualCard width={180} />
          <ProgressChart width={160} height={56} />
        </View>
      )}
      {kind === "sparkle" && (
        <View style={styles.sparkleVisual}>
          <Sparkles color="#C9A227" size={64} strokeWidth={1.5} />
          <TrustScoreRing size={80} score={1000} />
        </View>
      )}
    </Animated.View>
  );
}

const EMERALD = "#10B981";

export default function Onboarding() {
  const router = useRouter();
  const flatRef = useRef<FlatList>(null);
  const [idx, setIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const animateTransition = (next: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0.7, duration: 120, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 120, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
    ]).start(() => {
      next();
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      ]).start();
    });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== idx) setIdx(i);
  };

  const goNext = async () => {
    if (idx < SLIDES.length - 1) {
      animateTransition(() => {
        flatRef.current?.scrollToIndex({ index: idx + 1, animated: true });
        setIdx(idx + 1);
      });
    } else {
      await finish();
    }
  };

  const finish = async () => {
    await storage.setItem("hodix_onboarded", true);
    await storage.setItem("hodix_welcome_seen", true);
    router.replace("/(auth)/login");
  };

  const slide = SLIDES[idx];

  return (
    <View style={styles.root}>
      <LinearGradient colors={slide.gradient} style={StyleSheet.absoluteFill} />

      <View style={styles.circleTopRight} />
      <View style={styles.circleBottomLeft} />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.brandDot} />
            <Text style={styles.brandName}>HODIX</Text>
          </View>
          {idx < SLIDES.length - 1 ? (
            <TouchableOpacity onPress={finish} testID="onboarding-skip" style={styles.skipBtn}>
              <Text style={styles.skipText}>Passer</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 60 }} />}
        </View>

        <FlatList
          ref={flatRef}
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => s.id}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={styles.flatlist}
          renderItem={() => <View style={{ width }} />}
        />

        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <SlideVisual kind={slide.visual} />

          {slide.stat && (
            <View style={styles.statBadge}>
              <Text style={styles.statValue}>{slide.stat.value}</Text>
              <Text style={styles.statLabel}>{slide.stat.label}</Text>
            </View>
          )}

          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.subtitle}>{slide.subtitle}</Text>
          <Text style={styles.desc}>{slide.description}</Text>
        </Animated.View>

        <View style={styles.bottom}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => {
                  animateTransition(() => {
                    flatRef.current?.scrollToIndex({ index: i, animated: true });
                    setIdx(i);
                  });
                }}
                activeOpacity={0.7}
              >
                <Animated.View
                  style={[
                    styles.dot,
                    i === idx
                      ? { backgroundColor: "#C9A227", width: 28, opacity: 1 }
                      : { backgroundColor: "rgba(255,255,255,0.35)", width: 8 },
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity testID="onboarding-next" onPress={goNext} activeOpacity={0.85} style={styles.cta}>
            <LinearGradient
              colors={["#C9A227", "#10B981"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGrad}
            >
              <Text style={styles.ctaText}>
                {idx === SLIDES.length - 1 ? "Commencer mon parcours →" : "Continuer →"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {idx === SLIDES.length - 1 && (
            <TouchableOpacity onPress={() => router.push("/(auth)/register")} style={styles.registerLink}>
              <Text style={styles.registerText}>Créer un compte gratuitement</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.legal}>Infrastructure financière · Trust Score · Certifié</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  circleTopRight: {
    position: "absolute", width: 280, height: 280, borderRadius: 140,
    backgroundColor: "rgba(16,185,129,0.06)", top: -80, right: -80,
  },
  circleBottomLeft: {
    position: "absolute", width: 220, height: 220, borderRadius: 110,
    backgroundColor: "rgba(201,162,39,0.05)", bottom: 80, left: -60,
  },
  topBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: Spacing.xxl, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" },
  brandName: { color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 2 },
  skipBtn: { backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  skipText: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 13 },
  flatlist: { position: "absolute", opacity: 0, height: 0 },
  content: {
    flex: 1, paddingHorizontal: Spacing.xxl, justifyContent: "flex-end",
    paddingBottom: 8,
  },
  visualWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
    marginBottom: 8,
  },
  trustVisual: { alignItems: "center", gap: 16 },
  trustChart: { alignItems: "center", gap: 4 },
  trustChartLabel: { color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "600" },
  communityVisual: { alignItems: "center", gap: 16 },
  communityDots: { flexDirection: "row", gap: 8 },
  communityDot: { width: 8, height: 8, borderRadius: 4 },
  cardVisual: { alignItems: "center", gap: 20 },
  sparkleVisual: { alignItems: "center", gap: 20, flexDirection: "row" },
  statBadge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(201,162,39,0.25)",
    marginBottom: 16, alignSelf: "flex-start",
  },
  statValue: { color: "#C9A227", fontWeight: "900", fontSize: 16 },
  statLabel: { color: "rgba(255,255,255,0.75)", fontWeight: "600", fontSize: 12 },
  title: {
    color: "rgba(255,255,255,0.65)", fontSize: 18, fontWeight: "700",
    letterSpacing: -0.3, marginBottom: 2,
  },
  subtitle: {
    color: "#fff", fontSize: 32, fontWeight: "900",
    letterSpacing: -1.2, marginBottom: 16, lineHeight: 36,
  },
  desc: {
    color: "rgba(255,255,255,0.75)", fontSize: 15, lineHeight: 24,
    fontWeight: "500",
  },
  bottom: { paddingHorizontal: Spacing.xxl, paddingBottom: Spacing.xl },
  dots: { flexDirection: "row", gap: 6, marginBottom: 20, alignItems: "center" },
  dot: { height: 8, borderRadius: 4 },
  cta: { borderRadius: Radius.xl, overflow: "hidden", marginBottom: 14 },
  ctaGrad: { paddingVertical: 18, alignItems: "center" },
  ctaText: { color: "#0B1F3A", fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
  registerLink: { alignItems: "center", paddingVertical: 6, marginBottom: 14 },
  registerText: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "700", textDecorationLine: "underline" },
  legal: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: "600", letterSpacing: 0.8, textAlign: "center" },
});
