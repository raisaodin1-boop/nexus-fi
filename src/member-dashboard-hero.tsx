/**
 * Premium post-login hero — same navy / emerald / gold narrative as welcome.
 * Responsive: stacked layout on narrow mobile web / phones (fixes crushed stat pills).
 */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  TextStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { TrustScoreRing, VirtualCard, ProgressChart, CommunityAvatars } from "@/src/welcome-visuals";
import { DASHBOARD_HERO_I18N } from "@/src/welcome-content";
import { useI18n } from "@/src/i18n";
import { formatXAF } from "@/src/api";
import { useResponsive } from "@/src/hooks/use-responsive";

const NAVY = "#0B1F3A";
const EMERALD = "#10B981";
const GOLD = "#C9A227";

/** Prevent RN-web from breaking amounts/labels letter-by-letter in narrow flex children. */
const webNoBreak = Platform.select({
  web: { whiteSpace: "nowrap", wordBreak: "keep-all" } as TextStyle,
  default: undefined,
});

export function CompactMemberVisuals({ score = 0, compact = false }: { score?: number; compact?: boolean }) {
  const displayScore = Math.min(1000, Math.max(0, Math.round(score)));
  const cardW = compact ? 92 : 108;
  const ringSize = compact ? 64 : 76;
  const chartW = compact ? 72 : 88;
  const wrapW = compact ? 140 : 168;
  const wrapH = compact ? 110 : 132;

  return (
    <View style={[compactStyles.wrap, { width: wrapW, height: wrapH }]}>
      <View style={compactStyles.card}>
        <VirtualCard width={cardW} />
      </View>
      <View style={compactStyles.ring}>
        <TrustScoreRing size={ringSize} score={displayScore || 1} />
      </View>
      <View style={compactStyles.chart}>
        <View style={compactStyles.chartGlass}>
          <ProgressChart width={chartW} height={compact ? 32 : 36} />
        </View>
      </View>
    </View>
  );
}

const compactStyles = StyleSheet.create({
  wrap: { position: "relative" },
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
  const { isCompact, isNarrow } = useResponsive();
  const copy = DASHBOARD_HERO_I18N[language === "en" ? "en" : "fr"];
  const displayScore = Math.round(trustScore);

  /** Side-by-side visuals only when enough horizontal space (avoids crushed pills). */
  const sideBySide = !isNarrow;
  const savedFormatted = formatXAF(totalSaved, currency);

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
          <Text style={[heroStyles.greeting, isCompact && heroStyles.greetingCompact]} numberOfLines={2}>
            {copy.greeting(firstName)}
          </Text>
          <View style={heroStyles.chip}>
            <Text style={heroStyles.chipText} numberOfLines={2}>
              {copy.vision_chip}
            </Text>
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

      <View style={[heroStyles.mainRow, !sideBySide && heroStyles.mainRowStacked]}>
        <View style={heroStyles.copyCol}>
          <Text style={heroStyles.headline}>{copy.headline}</Text>
          <Text style={heroStyles.subline}>{copy.subline}</Text>

          <View style={[heroStyles.statsRow, !sideBySide && heroStyles.statsRowWide]}>
            <TouchableOpacity
              style={[heroStyles.statPill, !sideBySide && heroStyles.statPillWide]}
              onPress={() => router.push("/(tabs)/identity")}
              activeOpacity={0.85}
            >
              <Text style={[heroStyles.statLabel, webNoBreak]} numberOfLines={1}>
                {copy.score_label}
              </Text>
              <Text
                style={[heroStyles.statValue, { color: EMERALD }, webNoBreak]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {displayScore > 0 ? displayScore : "—"}
              </Text>
              {trustLevel ? (
                <Text style={[heroStyles.statMeta, webNoBreak]} numberOfLines={1}>
                  {trustLevel}
                </Text>
              ) : null}
            </TouchableOpacity>
            <View style={[heroStyles.statPill, !sideBySide && heroStyles.statPillWide]}>
              <Text style={[heroStyles.statLabel, webNoBreak]} numberOfLines={1}>
                {copy.saved_label}
              </Text>
              <Text
                style={[heroStyles.statValue, heroStyles.statValueMoney, { color: GOLD }, webNoBreak]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {savedFormatted}
              </Text>
            </View>
          </View>

          <View style={heroStyles.ctaRow}>
            <TouchableOpacity
              style={heroStyles.ctaPrimary}
              onPress={() => router.push("/(tabs)/identity")}
            >
              <Text style={heroStyles.ctaPrimaryText} numberOfLines={1}>
                {copy.trust_cta}
              </Text>
              <Ionicons name="arrow-forward" size={16} color={NAVY} />
            </TouchableOpacity>
            <TouchableOpacity
              style={heroStyles.ctaGhost}
              onPress={() => router.push("/wallet")}
            >
              <Text style={heroStyles.ctaGhostText} numberOfLines={1}>
                {copy.wallet_cta}
              </Text>
            </TouchableOpacity>
          </View>

          <CommunityAvatars width={isCompact ? 120 : 140} />

          {!sideBySide && (
            <View style={heroStyles.visualBelow}>
              <CompactMemberVisuals score={displayScore} compact />
            </View>
          )}
        </View>

        {sideBySide && (
          <View style={heroStyles.visualCol}>
            <CompactMemberVisuals score={displayScore} />
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

const heroStyles = StyleSheet.create({
  hero: {
    borderRadius: 20,
    padding: 16,
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
    marginBottom: 14,
    gap: 8,
  },
  greetingBlock: { flex: 1, minWidth: 0 },
  greeting: {
    fontSize: 22,
    fontWeight: "700",
    color: "#F8FAFC",
    letterSpacing: -0.3,
  },
  greetingCompact: { fontSize: 20 },
  chip: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "rgba(16,185,129,0.15)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
    maxWidth: "100%",
  },
  chipText: {
    fontSize: 11,
    color: EMERALD,
    fontWeight: "600",
    lineHeight: 15,
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
    flexShrink: 0,
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
    gap: 12,
  },
  mainRowStacked: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  copyCol: { flex: 1, minWidth: 0, width: "100%" },
  visualCol: { flexShrink: 0 },
  visualBelow: {
    alignItems: "center",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
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
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
    alignSelf: "stretch",
  },
  statsRowWide: {
    gap: 8,
  },
  statPill: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  statPillWide: {
    flex: 1,
    minWidth: "46%",
  },
  statLabel: {
    fontSize: 10,
    color: "rgba(148,163,184,0.9)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  statValue: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  statValueMoney: { fontSize: 15, letterSpacing: -0.3 },
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
    flexShrink: 1,
  },
  ctaPrimaryText: { fontSize: 13, fontWeight: "700", color: NAVY },
  ctaGhost: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    flexShrink: 1,
  },
  ctaGhostText: { fontSize: 13, fontWeight: "600", color: "#E2E8F0" },
});
