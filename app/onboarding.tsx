// HODIX Premium Onboarding — animated slides
import React, { useRef, useState } from "react";
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
import {
  Shield, TrendingUp, Users, Award, Wallet, Sparkles,
} from "lucide-react-native";

import { Colors, Radius, Spacing } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const { width, height } = Dimensions.get("window");

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  gradient: [string, string, ...string[]];
  iconBg: string;
  stat?: { value: string; label: string };
}

const SLIDES: Slide[] = [
  {
    id: "welcome",
    title: "Bienvenue sur",
    subtitle: "HODIX",
    description: "L'infrastructure financière communautaire qui transforme votre épargne en identité reconnue. Rejoignez des milliers de membres qui construisent leur avenir.",
    icon: <Shield color="#fff" size={52} strokeWidth={1.5} />,
    gradient: ["#0B1F3A", "#1E3A8A"],
    iconBg: "rgba(29,78,216,0.4)",
    stat: { value: "10 000+", label: "membres actifs" },
  },
  {
    id: "savings",
    title: "Épargnez",
    subtitle: "à votre rythme",
    description: "Objectifs flexibles, verrouillés ou récurrents. Suivez chaque franc épargné, visualisez vos progrès, et atteignez vos cibles plus vite.",
    icon: <TrendingUp color="#fff" size={52} strokeWidth={1.5} />,
    gradient: ["#065F46", "#059669"],
    iconBg: "rgba(16,185,129,0.35)",
    stat: { value: "2,4M XAF", label: "épargnés en moyenne" },
  },
  {
    id: "tontines",
    title: "Tontines",
    subtitle: "100% digitales",
    description: "Créez ou rejoignez des tontines, gérez membres, contributions et rotations en quelques tapotements. Sécurisé, transparent, instantané.",
    icon: <Users color="#fff" size={52} strokeWidth={1.5} />,
    gradient: ["#1E1B4B", "#4338CA"],
    iconBg: "rgba(99,102,241,0.35)",
    stat: { value: "98%", label: "de cotisations à temps" },
  },
  {
    id: "community",
    title: "Associations",
    subtitle: "& Coopératives",
    description: "Fédérez vos communautés — associations, coopératives, fonds collectifs — dans un espace unifié, auditable et sécurisé.",
    icon: <Wallet color="#fff" size={52} strokeWidth={1.5} />,
    gradient: ["#7C2D12", "#DC2626"],
    iconBg: "rgba(239,68,68,0.3)",
    stat: { value: "3 types", label: "de groupes supportés" },
  },
  {
    id: "identity",
    title: "Score Hodix",
    subtitle: "votre passeport financier",
    description: "Votre historique d'épargne devient un score certifiable. Présentez votre identité financière pour accéder à des opportunités exclusives.",
    icon: <Award color="#fff" size={52} strokeWidth={1.5} />,
    gradient: ["#78350F", "#D97706"],
    iconBg: "rgba(245,158,11,0.3)",
    stat: { value: "A+", label: "votre potentiel" },
  },
  {
    id: "start",
    title: "Construisez",
    subtitle: "votre avenir financier",
    description: "Rejoignez la communauté qui transforme l'épargne informelle en histoire financière de demain. Gratuit, sécurisé, certifié.",
    icon: <Sparkles color="#fff" size={52} strokeWidth={1.5} />,
    gradient: ["#0B1F3A", "#1D4ED8"],
    iconBg: "rgba(29,78,216,0.4)",
    stat: { value: "100%", label: "gratuit et sécurisé" },
  },
];

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

      {/* Decorative circles */}
      <View style={styles.circleTopRight} />
      <View style={styles.circleBottomLeft} />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Top bar */}
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

        {/* Slide content — hidden FlatList for swipe, visible animated view */}
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

        {/* Animated content overlay */}
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          {/* Icon card */}
          <View style={[styles.iconCard, { backgroundColor: slide.iconBg }]}>
            {slide.icon}
          </View>

          {/* Stat badge */}
          {slide.stat && (
            <View style={styles.statBadge}>
              <Text style={styles.statValue}>{slide.stat.value}</Text>
              <Text style={styles.statLabel}>{slide.stat.label}</Text>
            </View>
          )}

          {/* Text */}
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.subtitle}>{slide.subtitle}</Text>
          <Text style={styles.desc}>{slide.description}</Text>
        </Animated.View>

        {/* Bottom controls */}
        <View style={styles.bottom}>
          {/* Dots */}
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
                      ? { backgroundColor: "#fff", width: 28, opacity: 1 }
                      : { backgroundColor: "rgba(255,255,255,0.35)", width: 8 },
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* CTA button */}
          <TouchableOpacity
            testID="onboarding-next"
            onPress={goNext}
            activeOpacity={0.85}
            style={styles.cta}
          >
            <LinearGradient
              colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0.12)"]}
              style={styles.ctaGrad}
            >
              <Text style={styles.ctaText}>
                {idx === SLIDES.length - 1 ? "Démarrer maintenant →" : "Continuer →"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {idx === SLIDES.length - 1 && (
            <TouchableOpacity onPress={() => router.push("/(auth)/register")} style={styles.registerLink}>
              <Text style={styles.registerText}>Créer un compte gratuitement</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.legal}>Sécurisé · Certifié · Sans frais cachés</Text>
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
    backgroundColor: "rgba(255,255,255,0.05)", top: -80, right: -80,
  },
  circleBottomLeft: {
    position: "absolute", width: 220, height: 220, borderRadius: 110,
    backgroundColor: "rgba(255,255,255,0.04)", bottom: 80, left: -60,
  },
  topBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: Spacing.xxl, paddingTop: Spacing.md, paddingBottom: Spacing.lg,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" },
  brandName: { color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 2 },
  skipBtn: { backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  skipText: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 13 },
  flatlist: { position: "absolute", opacity: 0, height: 0 },
  content: {
    flex: 1, paddingHorizontal: Spacing.xxl, justifyContent: "center",
    alignItems: "flex-start", gap: 0,
  },
  iconCard: {
    width: 100, height: 100, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    marginBottom: 24,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  statBadge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    marginBottom: 20,
  },
  statValue: { color: "#10B981", fontWeight: "900", fontSize: 16 },
  statLabel: { color: "rgba(255,255,255,0.75)", fontWeight: "600", fontSize: 12 },
  title: {
    color: "rgba(255,255,255,0.65)", fontSize: 20, fontWeight: "700",
    letterSpacing: -0.3, marginBottom: 2,
  },
  subtitle: {
    color: "#fff", fontSize: 36, fontWeight: "900",
    letterSpacing: -1.5, marginBottom: 20, lineHeight: 40,
  },
  desc: {
    color: "rgba(255,255,255,0.75)", fontSize: 16, lineHeight: 26,
    fontWeight: "500", maxWidth: "95%",
  },
  bottom: { paddingHorizontal: Spacing.xxl, paddingBottom: Spacing.xl, gap: 0 },
  dots: { flexDirection: "row", gap: 6, marginBottom: 24, alignItems: "center" },
  dot: { height: 8, borderRadius: 4 },
  cta: { borderRadius: Radius.xl, overflow: "hidden", marginBottom: 14 },
  ctaGrad: {
    paddingVertical: 18, alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", borderRadius: Radius.xl,
  },
  ctaText: { color: "#fff", fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
  registerLink: { alignItems: "center", paddingVertical: 6, marginBottom: 14 },
  registerText: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "700", textDecorationLine: "underline" },
  legal: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "600", letterSpacing: 1, textAlign: "center" },
});
