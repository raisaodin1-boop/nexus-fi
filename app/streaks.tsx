import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import { api } from "@/src/api";
import { Card } from "@/src/ui";
import { Colors, Spacing } from "@/src/theme";

interface StreakData {
  current_streak: number;
  best_streak: number;
  total_contributions: number;
  last_contribution_at: string | null;
  milestones: number[];
  is_at_risk: boolean;
}

// ─── Confetti ────────────────────────────────────────────────────────────────

function ConfettiPiece({ x, color, delay }: { x: number; color: string; delay: number }) {
  const y = useRef(new Animated.Value(-20)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: Dimensions.get("window").height, duration: 2500 + delay * 200, useNativeDriver: true, delay }),
      Animated.timing(opacity, { toValue: 0, duration: 2500 + delay * 200, useNativeDriver: true, delay }),
      Animated.timing(rotate, { toValue: 1, duration: 1000, useNativeDriver: true, delay }),
    ]).start();
  }, []);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={{
      position: "absolute", left: x, top: 0, width: 8, height: 8, borderRadius: 4,
      backgroundColor: color, transform: [{ translateY: y }, { rotate: spin }], opacity,
    }} />
  );
}

function Confetti() {
  const W = Dimensions.get("window").width;
  const COLORS = ["#FFD700", "#FF6B6B", "#10B981", "#3B82F6", "#F59E0B", "#8B5CF6"];
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    x: Math.random() * W, color: COLORS[i % COLORS.length], delay: i * 50,
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => <ConfettiPiece key={i} {...p} />)}
    </View>
  );
}

// ─── Streak Ring ──────────────────────────────────────────────────────────────

function StreakRing({ streak }: { streak: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, tension: 40, friction: 8, useNativeDriver: true }).start();
  }, []);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const color = streak >= 12 ? "#FFD700" : streak >= 4 ? "#10B981" : Colors.secondary;
  return (
    <Animated.View style={[styles.streakRing, { borderColor: color, transform: [{ scale }] }]}>
      <Text style={styles.streakNumber}>{streak}</Text>
      <Text style={styles.streakLabel}>semaines</Text>
      <Text style={styles.streakSub}>🔥 consécutives</Text>
    </Animated.View>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

const BADGES = [
  { weeks: 4, label: "Débutant", icon: "🌱", color: "#10B981" },
  { weeks: 8, label: "Régulier", icon: "⭐", color: "#3B82F6" },
  { weeks: 12, label: "Discipline", icon: "🔥", color: "#F59E0B" },
  { weeks: 26, label: "Champion", icon: "🏆", color: "#8B5CF6" },
  { weeks: 52, label: "Légende", icon: "👑", color: "#FFD700" },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function StreaksScreen() {
  const router = useRouter();
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get<StreakData>("/streaks");
      setData(result);
      setError(null);
    } catch {
      setError("Impossible de charger vos streaks. Réessayez.");
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {loading ? (
            <ActivityIndicator color={Colors.secondary} size="large" />
          ) : (
            <>
              <Text style={{ color: Colors.text, fontWeight: "800", fontSize: 16, marginBottom: 8 }}>Streaks indisponibles</Text>
              <Text style={{ color: Colors.textMuted, fontSize: 13, textAlign: "center", marginBottom: 16 }}>{error}</Text>
              <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.secondary }}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Réessayer</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { current_streak, best_streak, total_contributions, last_contribution_at, milestones, is_at_risk } = data;

  const showConfetti = current_streak >= 4 && current_streak % 4 === 0;

  const formattedDate = last_contribution_at
    ? new Date(last_contribution_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

  // Find next badge
  const nextBadge = BADGES.find((b) => !milestones.includes(b.weeks) && b.weeks > current_streak);
  const weeksToNext = nextBadge ? nextBadge.weeks - current_streak : null;

  let conseil: string;
  if (current_streak >= 12) {
    conseil = "Incroyable ! Votre régularité vous classe parmi les meilleurs.";
  } else if (current_streak >= 4) {
    conseil = weeksToNext
      ? `Continuez comme ça ! Encore ${weeksToNext} semaine${weeksToNext > 1 ? "s" : ""} pour le badge suivant.`
      : "Continuez comme ça ! Vous êtes sur la bonne voie.";
  } else {
    conseil = "Faites votre première cotisation pour démarrer votre streak !";
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {showConfetti && <Confetti />}
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={{ color: Colors.secondary, fontSize: 16, fontWeight: "700" }}>← Mes Streaks</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: Spacing.xl }}>
          {/* At-risk warning */}
          {is_at_risk && (
            <View style={styles.warning}>
              <AlertTriangle color="#D97706" size={18} />
              <Text style={styles.warnText}>Cotisez avant dimanche !</Text>
            </View>
          )}

          {/* Streak ring */}
          <View style={styles.ringWrap}>
            <StreakRing streak={current_streak} />
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{best_streak}</Text>
              <Text style={styles.statLabel}>Meilleur streak</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{total_contributions}</Text>
              <Text style={styles.statLabel}>Cotisations</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{formattedDate}</Text>
              <Text style={styles.statLabel}>Dernière cotis.</Text>
            </View>
          </View>

          {/* Badges */}
          <Text style={{ color: Colors.text, fontWeight: "900", fontSize: 18, marginTop: 24, marginBottom: 4 }}>
            Badges débloqués
          </Text>
          <View style={styles.badgeGrid}>
            {BADGES.map((badge) => {
              const earned = milestones.includes(badge.weeks);
              return (
                <View
                  key={badge.weeks}
                  style={[
                    styles.badgeCard,
                    !earned && styles.badgeLocked,
                    earned && {
                      backgroundColor: badge.color + "18",
                      borderWidth: 1.5,
                      borderColor: badge.color + "55",
                      shadowColor: badge.color,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.25,
                      shadowRadius: 8,
                      elevation: 3,
                    },
                    !earned && { backgroundColor: Colors.surfaceAlt ?? "#F0F2F8", borderWidth: 1, borderColor: Colors.border },
                  ]}
                >
                  <Text style={{ fontSize: 30 }}>{badge.icon}</Text>
                  <Text style={{ color: earned ? badge.color : Colors.textMuted, fontWeight: "800", fontSize: 13, marginTop: 6 }}>
                    {badge.label}
                  </Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {badge.weeks} sem.
                  </Text>
                  {!earned && (
                    <Text style={{ color: Colors.textSubtle, fontSize: 10, marginTop: 4 }}>🔒 Verrouillé</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Conseil */}
          <Card style={{ marginTop: 20, padding: 16, backgroundColor: Colors.secondaryLight ?? "#EEF2FF" }}>
            <Text style={{ color: Colors.secondary, fontWeight: "800", fontSize: 13, marginBottom: 4 }}>💡 Conseil</Text>
            <Text style={{ color: Colors.text, fontSize: 13, lineHeight: 19, fontWeight: "500" }}>{conseil}</Text>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  back: { alignSelf: "flex-start" },
  ringWrap: { alignItems: "center", marginVertical: 24 },
  streakRing: {
    width: 160, height: 160, borderRadius: 80, borderWidth: 6,
    alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  streakNumber: { fontSize: 52, fontWeight: "900", color: Colors.text, lineHeight: 58 },
  streakLabel: { color: Colors.textMuted, fontSize: 13, fontWeight: "600" },
  streakSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: { color: Colors.text, fontWeight: "900", fontSize: 14, textAlign: "center" },
  statLabel: { color: Colors.textMuted, fontSize: 10, marginTop: 4, textAlign: "center", fontWeight: "600" },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  badgeCard: { width: "47%", alignItems: "center", padding: 16, borderRadius: 16 },
  badgeLocked: { opacity: 0.4 },
  warning: {
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    alignItems: "center",
  },
  warnText: { color: "#92400E", fontWeight: "700", fontSize: 14, flex: 1 },
});
