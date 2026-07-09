/**
 * CEO-style personal dashboard hero — tells a financial story at a glance.
 */
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import type { DashboardStory } from "@/src/db/dashboard-story";
import { formatXAF } from "@/src/api";

const NAVY = "#0B1F3A";
const EMERALD = "#10B981";
const GOLD = "#C9A227";

type Props = {
  story: DashboardStory;
  unread?: number;
};

export function CeoDashboardHero({ story, unread = 0 }: Props) {
  const router = useRouter();
  const delta = story.score_delta_today;
  const deltaLabel = delta > 0 ? `+${delta} aujourd'hui` : delta < 0 ? `${delta} aujourd'hui` : "Stable aujourd'hui";

  return (
    <LinearGradient colors={[NAVY, "#0F2847", "#134E4A"]} style={styles.hero}>
      <View style={styles.glowE} pointerEvents="none" />
      <View style={styles.glowG} pointerEvents="none" />

      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Bonjour {story.greeting_name}</Text>
          <Text style={styles.tagline}>Infrastructure financière communautaire</Text>
        </View>
        <TouchableOpacity
          style={styles.notifBtn}
          onPress={() => router.push("/notifications")}
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={22} color="#E2E8F0" />
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <TouchableOpacity activeOpacity={0.9} onPress={() => router.push("/(tabs)/identity")}>
        <Text style={styles.trustEyebrow}>TRUST SCORE</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreValue}>{story.trust_score}</Text>
          <View style={styles.scoreMeta}>
            <Text style={styles.quality}>{story.trust_quality}</Text>
            <Text style={styles.level}>Niveau {story.trust_level}</Text>
            <Text style={[styles.delta, delta > 0 && { color: EMERALD }]}>
              {deltaLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.percentile}>
          Top {story.top_pct}% · {story.users_below_pct}% des membres ont un score inférieur
        </Text>
      </TouchableOpacity>

      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{story.savings_days}j</Text>
          <Text style={styles.statLbl}>Tu épargnes depuis</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{story.groups_count}</Text>
          <Text style={styles.statLbl}>Groupes</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{formatXAF(story.wallet_balance_xaf)}</Text>
          <Text style={styles.statLbl}>HODIX Wallet</Text>
        </View>
      </View>

      {story.primary_goal ? (
        <TouchableOpacity
          style={styles.goalCard}
          activeOpacity={0.88}
          onPress={() => router.push(`/savings/${story.primary_goal!.id}` as any)}
        >
          <View style={styles.goalHeader}>
            <Text style={styles.goalLabel}>Objectif · {story.primary_goal.name}</Text>
            <Text style={styles.goalPct}>{story.primary_goal.progress_pct}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${story.primary_goal.progress_pct}%` }]} />
          </View>
          <Text style={styles.goalAmount}>
            {formatXAF(story.primary_goal.current_amount)} / {formatXAF(story.primary_goal.target_amount)}
          </Text>
        </TouchableOpacity>
      ) : null}

      {story.next_contribution ? (
        <TouchableOpacity
          style={styles.nextCard}
          activeOpacity={0.88}
          onPress={() => router.push(`/tontines/${story.next_contribution!.tontine_id}` as any)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.nextLabel}>{story.next_contribution.label}</Text>
            <Text style={styles.nextName}>{story.next_contribution.tontine_name}</Text>
          </View>
          <View style={styles.nextDuePill}>
            <Text style={styles.nextDue}>{story.next_contribution.due_label}</Text>
          </View>
        </TouchableOpacity>
      ) : null}

      <View style={styles.ctaRow}>
        <TouchableOpacity style={styles.ctaPrimary} onPress={() => router.push("/wallet")}>
          <Text style={styles.ctaPrimaryText}>HODIX Wallet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ctaGhost} onPress={() => router.push("/(tabs)/identity")}>
          <Text style={styles.ctaGhostText}>Mon identité</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 20,
    padding: 18,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 12px 40px rgba(11,31,58,0.35)" } as object,
      default: { elevation: 8 },
    }),
  },
  glowE: {
    position: "absolute", width: 160, height: 160, borderRadius: 80,
    backgroundColor: EMERALD, opacity: 0.12, top: -50, right: -30,
  },
  glowG: {
    position: "absolute", width: 120, height: 120, borderRadius: 60,
    backgroundColor: GOLD, opacity: 0.1, bottom: -20, left: -20,
  },
  topRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16, gap: 8 },
  greeting: { fontSize: 24, fontWeight: "800", color: "#F8FAFC" },
  tagline: { fontSize: 11, color: "rgba(226,232,240,0.65)", marginTop: 4, fontWeight: "600" },
  notifBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  badge: {
    position: "absolute", top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  badgeText: { fontSize: 9, fontWeight: "700", color: "#FFF" },
  trustEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: GOLD, marginBottom: 4 },
  scoreRow: { flexDirection: "row", alignItems: "flex-end", gap: 14, marginBottom: 6 },
  scoreValue: { fontSize: 52, fontWeight: "900", color: "#FFF", letterSpacing: -2, lineHeight: 56 },
  scoreMeta: { paddingBottom: 6, gap: 2 },
  quality: { fontSize: 16, fontWeight: "800", color: EMERALD },
  level: { fontSize: 13, fontWeight: "700", color: "#E2E8F0" },
  delta: { fontSize: 12, fontWeight: "700", color: "rgba(226,232,240,0.75)" },
  percentile: { fontSize: 12, color: "rgba(226,232,240,0.85)", marginBottom: 14, lineHeight: 18 },
  statsGrid: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statBox: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  statVal: { fontSize: 15, fontWeight: "800", color: "#FFF" },
  statLbl: { fontSize: 10, color: "rgba(148,163,184,0.95)", marginTop: 3 },
  goalCard: {
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 14, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  goalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  goalLabel: { fontSize: 13, fontWeight: "700", color: "#F1F5F9", flex: 1 },
  goalPct: { fontSize: 14, fontWeight: "900", color: GOLD },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: EMERALD, borderRadius: 3 },
  goalAmount: { fontSize: 11, color: "rgba(226,232,240,0.75)", marginTop: 6 },
  nextCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(16,185,129,0.12)", borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "rgba(16,185,129,0.25)",
  },
  nextLabel: { fontSize: 10, fontWeight: "800", color: EMERALD, letterSpacing: 0.6, textTransform: "uppercase" },
  nextName: { fontSize: 14, fontWeight: "700", color: "#F8FAFC", marginTop: 2 },
  nextDuePill: { backgroundColor: NAVY, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  nextDue: { fontSize: 12, fontWeight: "800", color: GOLD },
  ctaRow: { flexDirection: "row", gap: 8 },
  ctaPrimary: { flex: 1, backgroundColor: EMERALD, paddingVertical: 11, borderRadius: 10, alignItems: "center" },
  ctaPrimaryText: { fontSize: 13, fontWeight: "800", color: NAVY },
  ctaGhost: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  ctaGhostText: { fontSize: 13, fontWeight: "700", color: "#E2E8F0" },
});
