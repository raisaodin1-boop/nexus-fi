/**
 * Premium fintech visuals for welcome / onboarding — SVG mockups
 * Palette: navy #0B1F3A · emerald #10B981 · gold #C9A227 · white
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, {
  Circle, Defs, G, LinearGradient as SvgGradient,
  Path, Rect, Stop, Text as SvgText,
} from "react-native-svg";

const NAVY = "#0B1F3A";
const EMERALD = "#10B981";
const GOLD = "#C9A227";
const BLUE = "#1E56A0";

// ── Virtual HODIX card ───────────────────────────────────────────

export function VirtualCard({ width = 140, style }: { width?: number; style?: object }) {
  const h = width * 0.63;
  return (
    <View style={[styles.cardWrap, style]}>
      <Svg width={width} height={h} viewBox="0 0 140 88">
        <Defs>
          <SvgGradient id="cardGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#132238" />
            <Stop offset="0.5" stopColor="#0F2847" />
            <Stop offset="1" stopColor="#1E56A0" />
          </SvgGradient>
        </Defs>
        <Rect x="0" y="0" width="140" height="88" rx="12" fill="url(#cardGrad)" />
        <Rect x="0" y="0" width="140" height="88" rx="12" fill="none" stroke="rgba(201,162,39,0.4)" strokeWidth="1" />
        <Rect x="16" y="20" width="28" height="20" rx="4" fill={GOLD} opacity={0.85} />
        <SvgText x="16" y="58" fill="#fff" fontSize="11" fontWeight="700">HODIX</SvgText>
        <SvgText x="16" y="72" fill="rgba(255,255,255,0.5)" fontSize="8">TRUST SCORE</SvgText>
        <SvgText x="120" y="72" fill={EMERALD} fontSize="14" fontWeight="900" textAnchor="end">847</SvgText>
        <Circle cx="118" cy="22" r="8" fill={EMERALD} opacity={0.3} />
        <Circle cx="118" cy="22" r="4" fill={EMERALD} />
      </Svg>
    </View>
  );
}

// ── Mini progress chart ──────────────────────────────────────────

export function ProgressChart({ width = 120, height = 48 }: { width?: number; height?: number }) {
  const bars = [0.35, 0.52, 0.48, 0.68, 0.75, 0.82, 0.95];
  const barW = (width - 16) / bars.length - 3;
  return (
    <Svg width={width} height={height}>
      {bars.map((pct, i) => (
        <Rect
          key={i}
          x={8 + i * (barW + 3)}
          y={height - 8 - pct * (height - 16)}
          width={barW}
          height={pct * (height - 16)}
          rx={2}
          fill={i === bars.length - 1 ? EMERALD : "rgba(16,185,129,0.35)"}
        />
      ))}
    </Svg>
  );
}

// ── Trust Score ring ─────────────────────────────────────────────

export function TrustScoreRing({ size = 88, score = 847 }: { size?: number; score?: number }) {
  const r = size * 0.38;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score / 1000, 1);
  const dash = circ * pct;
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={6} />
      <Circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={GOLD} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        rotation={-90}
        origin={`${cx}, ${cy}`}
      />
      <SvgText x={cx} y={cy - 4} fill="#fff" fontSize={size * 0.22} fontWeight="900" textAnchor="middle">{score}</SvgText>
      <SvgText x={cx} y={cy + size * 0.12} fill={EMERALD} fontSize={size * 0.1} fontWeight="700" textAnchor="middle">TRUST</SvgText>
    </Svg>
  );
}

// ── Community avatars (cotisation group) ─────────────────────────

export function CommunityAvatars({ width = 160 }: { width?: number }) {
  const avatars = [
    { x: 20, color: EMERALD, label: "A" },
    { x: 52, color: BLUE, label: "M" },
    { x: 84, color: GOLD, label: "K" },
    { x: 116, color: "#8B5CF6", label: "S" },
  ];
  return (
    <Svg width={width} height={56} viewBox="0 0 160 56">
      {avatars.map((a, i) => (
        <G key={i}>
          <Circle cx={a.x} cy={28} r={18} fill={a.color} opacity={0.25} />
          <Circle cx={a.x} cy={28} r={14} fill={a.color} />
          <SvgText x={a.x} y={32} fill="#fff" fontSize="11" fontWeight="800" textAnchor="middle">{a.label}</SvgText>
        </G>
      ))}
      <Path
        d="M 38 28 L 46 28 M 70 28 L 78 28 M 102 28 L 110 28"
        stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeDasharray="3 3"
      />
      <SvgText x={80} y={52} fill="rgba(255,255,255,0.5)" fontSize="8" fontWeight="600" textAnchor="middle">+2 400 groupes actifs</SvgText>
    </Svg>
  );
}

// ── Phone mockup with app preview ────────────────────────────────

export function PhoneMockup({ height = 280 }: { height?: number }) {
  const w = height * 0.52;
  const pad = 8;
  const screenW = w - pad * 2;
  const screenH = height - pad * 2 - 12;
  return (
    <View style={[styles.phoneWrap, { width: w, height }]}>
      <Svg width={w} height={height}>
        {/* Phone frame */}
        <Rect x="0" y="0" width={w} height={height} rx="22" fill="#1A2D45" />
        <Rect x="2" y="2" width={w - 4} height={height - 4} rx="20" fill="#0A1628" stroke="rgba(201,162,39,0.25)" strokeWidth="1.5" />
        {/* Notch */}
        <Rect x={w / 2 - 28} y="6" width="56" height="5" rx="3" fill="#243B55" />
        {/* Screen */}
        <Rect x={pad} y="18" width={screenW} height={screenH} rx="14" fill={NAVY} />
        {/* App UI preview */}
        <Rect x={pad + 10} y="28" width={screenW - 20} height="28" rx="8" fill="rgba(16,185,129,0.2)" />
        <SvgText x={pad + 18} y="46" fill="#fff" fontSize="9" fontWeight="700">Bonjour, Amina 👋</SvgText>
        {/* Balance card */}
        <Rect x={pad + 10} y="62" width={screenW - 20} height="44" rx="10" fill="#132238" stroke="rgba(16,185,129,0.3)" strokeWidth="1" />
        <SvgText x={pad + 18} y="78" fill="rgba(255,255,255,0.5)" fontSize="7">Solde wallet</SvgText>
        <SvgText x={pad + 18} y="96" fill={EMERALD} fontSize="13" fontWeight="900">245 000 XAF</SvgText>
        {/* Trust score bar */}
        <Rect x={pad + 10} y="114" width={screenW - 20} height="36" rx="8" fill="rgba(201,162,39,0.12)" stroke="rgba(201,162,39,0.25)" strokeWidth="1" />
        <SvgText x={pad + 18} y="128" fill={GOLD} fontSize="7" fontWeight="700">TRUST SCORE</SvgText>
        <SvgText x={pad + screenW - 28} y="138" fill="#fff" fontSize="11" fontWeight="900">847</SvgText>
        <Rect x={pad + 18} y="134" width={(screenW - 36) * 0.85} height="4" rx="2" fill="rgba(255,255,255,0.1)" />
        <Rect x={pad + 18} y="134" width={(screenW - 36) * 0.72} height="4" rx="2" fill={GOLD} />
        {/* Mini chart */}
        {[0.3, 0.45, 0.4, 0.55, 0.7, 0.65, 0.85].map((p, i) => (
          <Rect
            key={i}
            x={pad + 14 + i * 12}
            y={158 + (1 - p) * 28}
            width="8"
            height={p * 28}
            rx="2"
            fill={i === 6 ? EMERALD : "rgba(16,185,129,0.35)"}
          />
        ))}
        {/* Quick actions row */}
        <Circle cx={pad + 24} cy={screenH - 18} r="10" fill="rgba(16,185,129,0.25)" />
        <Circle cx={pad + screenW / 2} cy={screenH - 18} r="10" fill="rgba(30,86,160,0.25)" />
        <Circle cx={pad + screenW - 24} cy={screenH - 18} r="10" fill="rgba(201,162,39,0.25)" />
      </Svg>
      {/* Glow */}
      <View style={[styles.phoneGlow, { width: w + 40, height: height * 0.6 }]} />
    </View>
  );
}

// ── Animated floating stack (phone + cards) ──────────────────────

export function PremiumVisualStack() {
  const float1 = useRef(new Animated.Value(0)).current;
  const float2 = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    const loop = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
    loop(float1, 0).start();
    loop(float2, 600).start();
  }, []);

  const y1 = float1.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const y2 = float2.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });

  return (
    <Animated.View style={[styles.stack, { opacity: fadeIn }]}>
      <PhoneMockup height={260} />
      <Animated.View style={[styles.cardFloat, { transform: [{ translateY: y1 }] }]}>
        <VirtualCard width={130} />
      </Animated.View>
      <Animated.View style={[styles.scoreFloat, { transform: [{ translateY: y2 }] }]}>
        <TrustScoreRing size={72} score={847} />
      </Animated.View>
      <View style={styles.chartFloat}>
        <View style={styles.chartGlass}>
          <ProgressChart width={100} height={40} />
        </View>
      </View>
    </Animated.View>
  );
}

// ── Trust Score hero block (onboarding accent) ─────────────────

export function TrustScoreHeroBlock({ lang }: { lang: "fr" | "en" }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.03, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.trustBlock}>
      <View style={styles.trustGlow} />
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <TrustScoreRing size={96} score={847} />
      </Animated.View>
      <View style={styles.trustBadge}>
        <View style={styles.trustBadgeDot} />
        <Animated.Text style={styles.trustBadgeLabel}>
          {lang === "fr" ? "INNOVATION HODIX" : "HODIX INNOVATION"}
        </Animated.Text>
      </View>
    </View>
  );
}

// Export copy helper for trust block text (used in parent)
export const TRUST_BLOCK_COPY = {
  fr: {
    title: "Votre Trust Score : un actif financier communautaire",
    sub: "Intégrez des groupes, accédez au crédit, réduisez les cautions — votre réputation travaille pour vous.",
  },
  en: {
    title: "Your Trust Score: a community financial asset",
    sub: "Join groups, access credit, lower collateral — your reputation works for you.",
  },
};

const styles = StyleSheet.create({
  cardWrap: {
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  phoneWrap: {
    position: "relative",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  phoneGlow: {
    position: "absolute",
    bottom: -20,
    alignSelf: "center",
    backgroundColor: EMERALD,
    opacity: 0.08,
    borderRadius: 999,
    zIndex: -1,
  },
  stack: {
    alignItems: "center",
    justifyContent: "center",
    height: 280,
    width: "100%",
  },
  cardFloat: {
    position: "absolute",
    top: 24,
    right: 0,
    zIndex: 3,
  },
  scoreFloat: {
    position: "absolute",
    bottom: 40,
    left: -4,
    zIndex: 3,
  },
  chartFloat: {
    position: "absolute",
    bottom: 16,
    right: 8,
    zIndex: 3,
  },
  chartGlass: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  trustBlock: {
    alignItems: "center",
    gap: 12,
    position: "relative",
  },
  trustGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: GOLD,
    opacity: 0.08,
    top: 0,
  },
  trustBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(201,162,39,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.3)",
  },
  trustBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD },
  trustBadgeLabel: { color: GOLD, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
});
