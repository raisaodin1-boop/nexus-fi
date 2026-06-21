/**
 * Premium post-login hero — same navy / emerald / gold narrative as welcome.
 */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { TrustScoreRing, VirtualCard, ProgressChart, CommunityAvatars } from "@/src/welcome-visuals";
import { DASHBOARD_HERO_I18N } from "@/src/welcome-content";
import { useI18n } from "@/src/i18n";
import { formatXAF } from "@/src/api";

const NAVY = "#0B1F3A";
const EMERALD = "#10B981";
const GOLD = "#C9A227";

export function CompactMemberVisuals({ score = 0 }: { score?: number }) {
  const displayScore = Math.min(1000, Math.max(0, Math.round(score)));
  return (
    <View style={compactStyles.wrap}>
      <View style={compactStyles.card}>
        <VirtualCard width={108} />
      </View>
      <View style={compactStyles.ring}>
        <TrustScoreRing size={76} score={displayScore || 1} />
      </View>
      <View style={compactStyles.chart}>
        <View style={compactStyles.chartGlass}>
          <ProgressChart width={88} height={36} />
        </View>
      </View>
    </View>
  );
}

const compactStyles = StyleSheet.create({
  wrap: { width: 168, height: 132, position: "relative" },
  card: { position: "absolute", top: 0, right: 0, zIndex: 2 },
  ring: { position: "absolute", bottom: 0, left: 0, zIndex: 3 },
  chart: { position: "absolute", bottom: 4, right: 0, zIndex: 2 },
  chartGlass: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
});

export type MemberDashboardHeroProps = {
  firstName?: string;
  trustScore?: number;
  trustLevel?: string;
  totalSaved?: number;
  currency?: string;
  unread?: number;
  onNotifPress?: () => void;
};

export function MemberDashboardHero({
  firstName = "",
  trustScore = 0,
  trustLevel,
  totalSaved = 0,
  currency = "XAF",
  unread = 0,
  onNotifPress,
}: MemberDashboardHeroProps) {
  const router = useRouter();
  const { language } = useI18n();
  const copy = DASHBOARD_HERO_I18N[language === "en" ? "en" : "fr"];
  const displayScore = Math.round(trustScore);

  return (
    <LinearGradient
      colors={[NAVY, "#0F2847", "#134E4A"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={heroStyles.hero}
    >
      <View style={heroStyles.glowEmerald} pointerEvents="none" />
      <View style={heroStyles.glowGold} pointerEvents="none" />

      <View style={heroStyles.topRow}>
        <View style={heroStyles.greetingBlock}>
          <Text style={heroStyles.greeting}>{copy.greeting(firstName)}</Text>
          <View style={heroStyles.chip}>
            <Text style={heroStyles.chipText}>{copy.vision_chip}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={heroStyles.notifBtn}
          onPress={onNotifPress ?? (() => router.push("/notifications"))}
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={22} color="#E2E8F0" />
          {unread > 0 && (
            <View style={heroStyles.badge}>
              <Text style={heroStyles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={heroStyles.mainRow}>
        <View style={heroStyles.copyCol}>
          <Text style={heroStyles.headline}>{copy.headline}</Text>
          <Text style={heroStyles.subline}>{copy.subline}</Text>

          <View style={heroStyles.statsRow}>
            <TouchableOpacity
              style={heroStyles.statPill}
              onPress={() => router.push("/(tabs)/identity")}
              activeOpacity={0.85}
            >
              <Text style={heroStyles.statLabel}>{copy.score_label}</Text>
              <Text style={[heroStyles.statValue, { color: EMERALD }]}>
                {displayScore > 0 ? displayScore : "—"}
              </Text>
              {trustLevel ? (
                <Text style={heroStyles.statMeta}>{trustLevel}</Text>
              ) : null}
            </TouchableOpacity>
            <View style={heroStyles.statPill}>
              <Text style={heroStyles.statLabel}>{copy.saved_label}</Text>
              <Text style={[heroStyles.statValue, { color: GOLD }]}>
                {formatXAF(totalSaved, currency)}
              </Text>
            </View>
          </View>

          <View style={heroStyles.ctaRow}>
            <TouchableOpacity
              style={heroStyles.ctaPrimary}
              onPress={() => router.push("/(tabs)/identity")}
            >
              <Text style={heroStyles.ctaPrimaryText}>{copy.trust_cta}</Text>
              <Ionicons name="arrow-forward" size={16} color={NAVY} />
            </TouchableOpacity>
            <TouchableOpacity
              style={heroStyles.ctaGhost}
              onPress={() => router.push("/wallet")}
            >
              <Text style={heroStyles.ctaGhostText}>{copy.wallet_cta}</Text>
            </TouchableOpacity>
          </View>

          <CommunityAvatars width={140} />
        </View>

        <View style={heroStyles.visualCol}>
          <CompactMemberVisuals score={displayScore} />
        </View>
      </View>
    </LinearGradient>
  );
}

const heroStyles = StyleSheet.create({
  hero: {
    borderRadius: 20,
    padding: 20,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 12px 40px rgba(11,31,58,0.35)" } as object,
      default: {
        shadowColor: NAVY,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 8,
      },
    }),
  },
  glowEmerald: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: EMERALD,
    opacity: 0.12,
    top: -60,
    right: -40,
  },
  glowGold: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: GOLD,
    opacity: 0.1,
    bottom: -30,
    left: -20,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  greetingBlock: { flex: 1 },
  greeting: {
    fontSize: 22,
    fontWeight: "700",
    color: "#F8FAFC",
    letterSpacing: -0.3,
  },
  chip: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "rgba(16,185,129,0.15)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
  },
  chipText: {
    fontSize: 11,
    color: EMERALD,
    fontWeight: "600",
  },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 9, fontWeight: "700", color: "#FFF" },
  mainRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  copyCol: { flex: 1, minWidth: 0 },
  visualCol: { marginLeft: 4 },
  headline: {
    fontSize: 17,
    fontWeight: "700",
    color: "#F1F5F9",
    lineHeight: 22,
    marginBottom: 6,
  },
  subline: {
    fontSize: 13,
    color: "rgba(226,232,240,0.85)",
    lineHeight: 18,
    marginBottom: 14,
  },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statPill: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  statLabel: {
    fontSize: 10,
    color: "rgba(148,163,184,0.9)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  statMeta: { fontSize: 10, color: EMERALD, marginTop: 2 },
  ctaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  ctaPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: EMERALD,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  ctaPrimaryText: { fontSize: 13, fontWeight: "700", color: NAVY },
  ctaGhost: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  ctaGhostText: { fontSize: 13, fontWeight: "600", color: "#E2E8F0" },
});
