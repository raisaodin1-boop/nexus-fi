/**
 * Premium landing-only visuals — emotional hero, Trust Score timeline, app showcase.
 */
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

const NAVY = "#0B1F3A";
const EMERALD = "#10B981";
const GOLD = "#C9A227";
const BLUE = "#1E56A0";

export type TrustStep = { emoji: string; title: string; body: string };
export type Persona = { label: string; emoji: string };
export type AppScreenId = "dashboard" | "wallet" | "trust" | "contributions" | "groups";

// ── Fade-in on mount (staggered) ─────────────────────────────────

export function LandingFadeIn({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 600,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 600,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

// ── Emotional community scene (hero) ─────────────────────────────

export function CommunityEmotionalVisual({ width = 320 }: { width?: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const h = width * 0.55;

  const nodes = [
    { x: 0.18, y: 0.22, emoji: "👨‍👩‍👧", label: "Famille" },
    { x: 0.82, y: 0.18, emoji: "🏪", label: "Commerce" },
    { x: 0.92, y: 0.55, emoji: "💼", label: "Entrepreneur" },
    { x: 0.72, y: 0.88, emoji: "🤝", label: "Association" },
    { x: 0.28, y: 0.88, emoji: "🎓", label: "Jeunes pros" },
    { x: 0.08, y: 0.55, emoji: "🌍", label: "Diaspora" },
  ];

  return (
    <View style={[lvStyles.emotionalWrap, { width, height: h }]}>
      <Animated.View
        style={[
          lvStyles.emotionalGlow,
          { width: width * 0.5, height: width * 0.5, transform: [{ scale: glowScale }] },
        ]}
      />
      <Svg width={width} height={h} viewBox={`0 0 ${width} ${h}`}>
        <Defs>
          <SvgGradient id="emotionalGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="rgba(16,185,129,0.15)" />
            <Stop offset="1" stopColor="rgba(201,162,39,0.12)" />
          </SvgGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={h} rx="20" fill="url(#emotionalGrad)" />
        {nodes.map((n, i) => {
          const cx = n.x * width;
          const cy = n.y * h;
          const mx = width / 2;
          const my = h / 2;
          return (
            <G key={i}>
              <Path
                d={`M ${cx} ${cy} Q ${(cx + mx) / 2} ${(cy + my) / 2 - 20} ${mx} ${my}`}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="1"
                fill="none"
                strokeDasharray="4 4"
              />
            </G>
          );
        })}
        <Circle cx={width / 2} cy={h / 2} r={width * 0.14} fill="rgba(11,31,58,0.85)" stroke={GOLD} strokeWidth="2" />
        <SvgText x={width / 2} y={h / 2 - 6} fill="#fff" fontSize={width * 0.045} fontWeight="900" textAnchor="middle">
          HODIX
        </SvgText>
        <SvgText x={width / 2} y={h / 2 + 14} fill={EMERALD} fontSize={width * 0.028} fontWeight="700" textAnchor="middle">
          Trust 847
        </SvgText>
      </Svg>
      {nodes.map((n, i) => (
        <View
          key={i}
          style={[
            lvStyles.emotionalNode,
            { left: n.x * width - 22, top: n.y * h - 22 },
          ]}
        >
          <Text style={lvStyles.emotionalEmoji}>{n.emoji}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Persona strip ────────────────────────────────────────────────

export function PersonaStrip({ personas }: { personas: Persona[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={lvStyles.personaRow}
    >
      {personas.map((p) => (
        <View key={p.label} style={lvStyles.personaChip}>
          <Text style={lvStyles.personaEmoji}>{p.emoji}</Text>
          <Text style={lvStyles.personaLabel}>{p.label}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ── Score evolution illustration ─────────────────────────────────

export function ScoreEvolutionIllustration({ width = 280 }: { width?: number }) {
  const scores = [420, 580, 710, 847];
  const h = 100;

  return (
    <View style={[lvStyles.scoreEvolution, { width }]}>
      <Svg width={width} height={h}>
        <Rect x="0" y="0" width={width} height={h} rx="12" fill="rgba(11,31,58,0.04)" />
        {scores.map((s, i) => {
          const x = 20 + i * ((width - 40) / (scores.length - 1));
          const barH = (s / 1000) * 60;
          return (
            <G key={i}>
              <Rect x={x - 14} y={h - 20 - barH} width="28" height={barH} rx="6" fill={i === scores.length - 1 ? EMERALD : "rgba(16,185,129,0.35)"} />
              <SvgText x={x} y={h - 6} fill="#64748B" fontSize="9" fontWeight="600" textAnchor="middle">
                {i === 0 ? "M1" : i === 1 ? "M3" : i === 2 ? "M6" : "M12"}
              </SvgText>
              <SvgText x={x} y={h - 26 - barH} fill={i === scores.length - 1 ? NAVY : "#94A3B8"} fontSize="10" fontWeight="800" textAnchor="middle">
                {s}
              </SvgText>
            </G>
          );
        })}
        <Path
          d={`M 20 ${h - 20 - (420 / 1000) * 60} ${scores.slice(1).map((s, i) => {
            const x = 20 + (i + 1) * ((width - 40) / (scores.length - 1));
            const y = h - 20 - (s / 1000) * 60;
            return `L ${x} ${y}`;
          }).join(" ")}`}
          stroke={GOLD}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
      <View style={lvStyles.scoreEvolutionBadge}>
        <Text style={lvStyles.scoreEvolutionBadgeText}>+427 pts en 12 mois</Text>
      </View>
    </View>
  );
}

// ── Trust Score timeline ─────────────────────────────────────────

export function TrustScoreTimeline({ steps }: { steps: TrustStep[] }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  return (
    <View style={[lvStyles.timeline, isWide && lvStyles.timelineWide]}>
      {steps.map((step, i) => (
        <LandingFadeIn key={step.title} delay={i * 120} style={lvStyles.timelineItemWrap}>
          <View style={lvStyles.timelineItem}>
            {isWide && i < steps.length - 1 && <View style={lvStyles.timelineConnector} />}
            <View style={lvStyles.timelineIcon}>
              <Text style={lvStyles.timelineEmoji}>{step.emoji}</Text>
            </View>
            <Text style={lvStyles.timelineTitle}>{step.title}</Text>
            <Text style={lvStyles.timelineBody}>{step.body}</Text>
          </View>
        </LandingFadeIn>
      ))}
    </View>
  );
}

// ── App screen phone mockup variants ─────────────────────────────

function AppScreenContent({ variant, screenW, pad }: {
  variant: AppScreenId;
  screenW: number;
  pad: number;
}) {
  const innerX = pad + 10;
  const innerW = screenW - 20;

  if (variant === "wallet") {
    return (
      <>
        <SvgText x={innerX + 8} y="42" fill="#fff" fontSize="9" fontWeight="700">Portefeuille</SvgText>
        <Rect x={innerX} y="48" width={innerW} height="52" rx="10" fill="#132238" stroke="rgba(16,185,129,0.35)" strokeWidth="1" />
        <SvgText x={innerX + 8} y="64" fill="rgba(255,255,255,0.5)" fontSize="7">Solde total</SvgText>
        <SvgText x={innerX + 8} y="84" fill={EMERALD} fontSize="14" fontWeight="900">1 245 000 XAF</SvgText>
        <Rect x={innerX} y="108" width={innerW / 2 - 4} height="28" rx="8" fill="rgba(16,185,129,0.2)" />
        <Rect x={innerX + innerW / 2 + 4} y="108" width={innerW / 2 - 4} height="28" rx="8" fill="rgba(30,86,160,0.2)" />
        <SvgText x={innerX + innerW / 4} y="126" fill="#fff" fontSize="7" fontWeight="600" textAnchor="middle">Dépôt</SvgText>
        <SvgText x={innerX + (innerW * 3) / 4} y="126" fill="#fff" fontSize="7" fontWeight="600" textAnchor="middle">Retrait</SvgText>
      </>
    );
  }

  if (variant === "trust") {
    return (
      <>
        <SvgText x={innerX + 8} y="42" fill={GOLD} fontSize="9" fontWeight="800">TRUST SCORE</SvgText>
        <Circle cx={pad + screenW / 2} cy="88" r="32" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
        <Circle cx={pad + screenW / 2} cy="88" r="32" fill="none" stroke={GOLD} strokeWidth="5" strokeDasharray="160 60" strokeLinecap="round" rotation={-90} origin={`${pad + screenW / 2},88`} />
        <SvgText x={pad + screenW / 2} y="92" fill="#fff" fontSize="16" fontWeight="900" textAnchor="middle">847</SvgText>
        <Rect x={innerX} y="130" width={innerW} height="8" rx="4" fill="rgba(255,255,255,0.08)" />
        <Rect x={innerX} y="130" width={innerW * 0.85} height="8" rx="4" fill={EMERALD} />
        <SvgText x={innerX + 8} y="152" fill="rgba(255,255,255,0.6)" fontSize="7">Niveau : Confiance élevée</SvgText>
      </>
    );
  }

  if (variant === "contributions") {
    return (
      <>
        <SvgText x={innerX + 8} y="42" fill="#fff" fontSize="9" fontWeight="700">Historique cotisations</SvgText>
        {[0, 1, 2, 3].map((i) => (
          <G key={i}>
            <Rect x={innerX} y={50 + i * 28} width={innerW} height="22" rx="6" fill="rgba(255,255,255,0.06)" />
            <Circle cx={innerX + 12} cy={61 + i * 28} r="6" fill={i % 2 === 0 ? EMERALD : BLUE} opacity={0.8} />
            <SvgText x={innerX + 24} y={65 + i * 28} fill="#fff" fontSize="7" fontWeight="600">Cycle #{4 - i}</SvgText>
            <SvgText x={innerX + innerW - 8} y={65 + i * 28} fill={EMERALD} fontSize="8" fontWeight="800" textAnchor="end">+25k</SvgText>
          </G>
        ))}
      </>
    );
  }

  if (variant === "groups") {
    return (
      <>
        <SvgText x={innerX + 8} y="42" fill="#fff" fontSize="9" fontWeight="700">Mes groupes</SvgText>
        {["Njangi Diaspora", "Ajo Entrepreneurs", "Stokvel Famille"].map((name, i) => (
          <G key={i}>
            <Rect x={innerX} y={48 + i * 36} width={innerW} height="30" rx="8" fill="rgba(16,185,129,0.12)" stroke="rgba(16,185,129,0.25)" strokeWidth="1" />
            <SvgText x={innerX + 10} y={66 + i * 36} fill="#fff" fontSize="7" fontWeight="700">{name}</SvgText>
            <SvgText x={innerX + innerW - 10} y={66 + i * 36} fill={GOLD} fontSize="7" fontWeight="600" textAnchor="end">{12 - i * 3} membres</SvgText>
          </G>
        ))}
      </>
    );
  }

  // dashboard (default)
  return (
    <>
      <Rect x={innerX} y="28" width={innerW} height="28" rx="8" fill="rgba(16,185,129,0.2)" />
      <SvgText x={innerX + 8} y="46" fill="#fff" fontSize="9" fontWeight="700">Bonjour, Amina 👋</SvgText>
      <Rect x={innerX} y="62" width={innerW} height="44" rx="10" fill="#132238" stroke="rgba(16,185,129,0.3)" strokeWidth="1" />
      <SvgText x={innerX + 8} y="78" fill="rgba(255,255,255,0.5)" fontSize="7">Solde wallet</SvgText>
      <SvgText x={innerX + 8} y="96" fill={EMERALD} fontSize="13" fontWeight="900">245 000 XAF</SvgText>
      {[0.3, 0.45, 0.4, 0.55, 0.7, 0.65, 0.85].map((p, i) => (
        <Rect
          key={i}
          x={innerX + 4 + i * 12}
          y={118 + (1 - p) * 28}
          width="8"
          height={p * 28}
          rx="2"
          fill={i === 6 ? EMERALD : "rgba(16,185,129,0.35)"}
        />
      ))}
      <SvgText x={innerX + 8} y="158" fill="rgba(255,255,255,0.5)" fontSize="7">Activité récente</SvgText>
    </>
  );
}

function AppScreenPhone({ variant, height = 240 }: { variant: AppScreenId; height?: number }) {
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const delay = variant === "dashboard" ? 0 : variant === "wallet" ? 200 : variant === "trust" ? 400 : variant === "contributions" ? 600 : 800;
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(float, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, [float, variant]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const w = height * 0.52;
  const pad = 8;
  const screenW = w - pad * 2;
  const screenH = height - pad * 2 - 12;

  return (
    <Animated.View style={[lvStyles.appPhone, { width: w, height, transform: [{ translateY }] }]}>
      <Svg width={w} height={height}>
        <Rect x="0" y="0" width={w} height={height} rx="22" fill="#1A2D45" />
        <Rect x="2" y="2" width={w - 4} height={height - 4} rx="20" fill="#0A1628" stroke="rgba(201,162,39,0.25)" strokeWidth="1.5" />
        <Rect x={w / 2 - 28} y="6" width="56" height="5" rx="3" fill="#243B55" />
        <Rect x={pad} y="18" width={screenW} height={screenH} rx="14" fill={NAVY} />
        <AppScreenContent variant={variant} screenW={screenW} pad={pad} />
      </Svg>
    </Animated.View>
  );
}

export function AppShowcase({
  screens,
}: {
  screens: { id: string; label: string }[];
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={lvStyles.appShowcaseRow}
      decelerationRate="fast"
      snapToInterval={160}
    >
      {screens.map((s, i) => (
        <LandingFadeIn key={s.id} delay={i * 100} style={lvStyles.appShowcaseItem}>
          <AppScreenPhone variant={s.id as AppScreenId} height={220} />
          <Text style={lvStyles.appShowcaseLabel}>{s.label}</Text>
        </LandingFadeIn>
      ))}
    </ScrollView>
  );
}

export type SecurityItem = { emoji: string; title: string; body: string };
export type FeeRow = { label: string; value: string; highlight: boolean };

export function SecurityFeesSection({
  securityTitle,
  securitySub,
  securityItems,
  securityEyebrow,
  feesEyebrow,
  feesTitle,
  feesSub,
  feesRows,
  feesNote,
  isWide,
}: {
  securityTitle: string;
  securitySub: string;
  securityItems: SecurityItem[];
  securityEyebrow: string;
  feesEyebrow: string;
  feesTitle: string;
  feesSub: string;
  feesRows: FeeRow[];
  feesNote: string;
  isWide: boolean;
}) {
  return (
    <View style={lvStyles.securityFeesWrap}>
      <View style={[lvStyles.securityFeesGrid, isWide && lvStyles.securityFeesGridWide]}>
        <View style={lvStyles.securityBlock}>
          <Text style={lvStyles.blockEyebrow}>{securityEyebrow}</Text>
          <Text style={lvStyles.blockTitle}>{securityTitle}</Text>
          <Text style={lvStyles.blockSub}>{securitySub}</Text>
          <View style={lvStyles.securityItems}>
            {securityItems.map((item) => (
              <View key={item.title} style={lvStyles.securityCard}>
                <Text style={lvStyles.securityEmoji}>{item.emoji}</Text>
                <View style={lvStyles.securityCardCopy}>
                  <Text style={lvStyles.securityCardTitle}>{item.title}</Text>
                  <Text style={lvStyles.securityCardBody}>{item.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <View style={lvStyles.feesBlock}>
          <Text style={lvStyles.blockEyebrow}>{feesEyebrow}</Text>
          <Text style={lvStyles.blockTitle}>{feesTitle}</Text>
          <Text style={lvStyles.blockSub}>{feesSub}</Text>
          <View style={lvStyles.feesTable}>
            {feesRows.map((row) => (
              <View key={row.label} style={lvStyles.feesRow}>
                <Text style={lvStyles.feesLabel}>{row.label}</Text>
                <Text style={[lvStyles.feesValue, row.highlight && lvStyles.feesValueFree]}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
          <View style={lvStyles.feesNoteBox}>
            <Text style={lvStyles.feesNoteText}>{feesNote}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function AuctionHighlight({
  title,
  subtitle,
  steps,
  ctaLabel,
  onCta,
}: {
  title: string;
  subtitle: string;
  steps: string[];
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <View style={lvStyles.auctionWrap}>
      <View style={lvStyles.auctionBadge}>
        <Text style={lvStyles.auctionBadgeText}>Exclusif HODIX</Text>
      </View>
      <Text style={lvStyles.auctionTitle}>{title}</Text>
      <Text style={lvStyles.auctionSub}>{subtitle}</Text>
      <View style={lvStyles.auctionSteps}>
        {steps.map((step, i) => (
          <View key={step} style={lvStyles.auctionStepRow}>
            <View style={lvStyles.auctionStepNum}>
              <Text style={lvStyles.auctionStepNumText}>{i + 1}</Text>
            </View>
            <Text style={lvStyles.auctionStepText}>{step}</Text>
          </View>
        ))}
      </View>
      <View style={lvStyles.auctionVisual}>
        <Text style={lvStyles.auctionVisualEmoji}>🔨</Text>
        <View style={lvStyles.auctionVisualCard}>
          <Text style={lvStyles.auctionVisualLabel}>Prime enchère</Text>
          <Text style={lvStyles.auctionVisualAmount}>+5 000 XAF</Text>
          <Text style={lvStyles.auctionVisualHint}>Redistribuée au groupe</Text>
        </View>
      </View>
      <TouchableOpacity style={lvStyles.auctionCta} onPress={onCta} activeOpacity={0.85}>
        <Text style={lvStyles.auctionCtaText}>{ctaLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const lvStyles = StyleSheet.create({
  emotionalWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  emotionalGlow: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: EMERALD,
    opacity: 0.06,
    alignSelf: "center",
    top: "20%",
  },
  emotionalNode: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  emotionalEmoji: { fontSize: 20 },
  personaRow: { flexDirection: "row", gap: 10, paddingVertical: 4 },
  personaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  personaEmoji: { fontSize: 18 },
  personaLabel: { fontSize: 13, fontWeight: "700", color: NAVY },
  scoreEvolution: { marginTop: 8 },
  scoreEvolutionBadge: {
    alignSelf: "center",
    marginTop: 8,
    backgroundColor: "rgba(16,185,129,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  scoreEvolutionBadgeText: { fontSize: 11, fontWeight: "700", color: EMERALD },
  timeline: { gap: 16 },
  timelineWide: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  timelineItemWrap: { flex: 1, minWidth: 200 },
  timelineItem: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    position: "relative",
    minHeight: 160,
  },
  timelineConnector: {
    position: "absolute",
    top: 36,
    right: -18,
    width: 24,
    height: 2,
    backgroundColor: "rgba(16,185,129,0.35)",
    zIndex: 1,
  },
  timelineIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(16,185,129,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  timelineEmoji: { fontSize: 22 },
  timelineTitle: { fontSize: 15, fontWeight: "800", color: NAVY, marginBottom: 6 },
  timelineBody: { fontSize: 13, color: "#64748B", lineHeight: 19 },
  appShowcaseRow: {
    flexDirection: "row",
    gap: 20,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  appShowcaseItem: { alignItems: "center", width: 140 },
  appPhone: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  appShowcaseLabel: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: "700",
    color: NAVY,
    textAlign: "center",
  },
  securityFeesWrap: { width: "100%" },
  securityFeesGrid: { gap: 20 },
  securityFeesGridWide: { flexDirection: "row", alignItems: "flex-start" },
  securityBlock: { flex: 1, minWidth: 280 },
  feesBlock: { flex: 1, minWidth: 280 },
  blockEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: EMERALD,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  blockTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: NAVY,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  blockSub: { fontSize: 14, color: "#64748B", lineHeight: 21, marginBottom: 16 },
  securityItems: { gap: 10 },
  securityCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  securityEmoji: { fontSize: 22 },
  securityCardCopy: { flex: 1 },
  securityCardTitle: { fontSize: 14, fontWeight: "800", color: NAVY, marginBottom: 4 },
  securityCardBody: { fontSize: 12, color: "#64748B", lineHeight: 18 },
  feesTable: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  feesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: 12,
  },
  feesLabel: { flex: 1, fontSize: 13, color: "#475569", lineHeight: 18 },
  feesValue: { fontSize: 13, fontWeight: "700", color: NAVY },
  feesValueFree: { color: EMERALD, fontWeight: "800" },
  feesNoteBox: {
    marginTop: 12,
    backgroundColor: "rgba(16,185,129,0.08)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.2)",
  },
  feesNoteText: { fontSize: 12, color: "#0F766E", lineHeight: 18, fontWeight: "600" },
  auctionWrap: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  auctionBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(124,58,237,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 12,
  },
  auctionBadgeText: { color: "#7C3AED", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  auctionTitle: { fontSize: 24, fontWeight: "800", color: NAVY, marginBottom: 10, letterSpacing: -0.3 },
  auctionSub: { fontSize: 15, color: "#64748B", lineHeight: 22, marginBottom: 20 },
  auctionSteps: { gap: 12, marginBottom: 20 },
  auctionStepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  auctionStepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(124,58,237,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  auctionStepNumText: { color: "#7C3AED", fontWeight: "800", fontSize: 13 },
  auctionStepText: { flex: 1, fontSize: 14, color: "#334155", lineHeight: 20, paddingTop: 4 },
  auctionVisual: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  auctionVisualEmoji: { fontSize: 36 },
  auctionVisualCard: {
    flex: 1,
    backgroundColor: NAVY,
    borderRadius: 12,
    padding: 14,
  },
  auctionVisualLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "600" },
  auctionVisualAmount: { color: GOLD, fontSize: 20, fontWeight: "900", marginTop: 4 },
  auctionVisualHint: { color: EMERALD, fontSize: 11, fontWeight: "600", marginTop: 4 },
  auctionCta: {
    alignSelf: "flex-start",
    backgroundColor: "#7C3AED",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  auctionCtaText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
});
