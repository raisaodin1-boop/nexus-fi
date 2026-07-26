import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import {
  Animated, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
  type StyleProp, type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";

import { Colors, Radius, Spacing } from "@/src/theme";

/** Diaspora visual language — navy horizon + teal depth (HODIX brand, not purple). */
export const DiasporaPalette = {
  night: "#0A1628",
  navy: "#0F2847",
  teal: "#0F766E",
  tealSoft: "#148F85",
  mist: "rgba(230, 244, 242, 0.12)",
  gold: "#C9A227",
  ink: Colors.text,
  muted: Colors.textMuted,
  paper: "#F3F7FA",
};

type ShellProps = {
  children: ReactNode;
  /** Compact top brand bar instead of full hero. */
  variant?: "hero" | "app";
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  rightSlot?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: ComponentProps<typeof ScrollView>["refreshControl"];
};

export function DiasporaScreenShell({
  children,
  variant = "app",
  title,
  subtitle,
  onBack,
  showBack = true,
  rightSlot,
  scroll = true,
  contentStyle,
  refreshControl,
}: ShellProps) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.back());

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scroll, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flexBody, contentStyle]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[DiasporaPalette.night, DiasporaPalette.navy, DiasporaPalette.teal]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <AtmosphereDecor />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {variant === "hero" ? (
          <View style={styles.heroTop}>
            {showBack ? (
              <TouchableOpacity onPress={handleBack} style={styles.backHit} hitSlop={10}>
                <ArrowLeft color="#fff" size={22} />
              </TouchableOpacity>
            ) : (
              <View style={styles.backHit} />
            )}
            {rightSlot}
          </View>
        ) : (
          <View style={styles.appBar}>
            {showBack ? (
              <TouchableOpacity onPress={handleBack} style={styles.backHit} hitSlop={10}>
                <ArrowLeft color="#fff" size={22} />
              </TouchableOpacity>
            ) : (
              <View style={styles.backHit} />
            )}
            <View style={styles.appBarText}>
              {title ? <Text style={styles.appTitle}>{title}</Text> : null}
              {subtitle ? <Text style={styles.appSub} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            {rightSlot ?? <View style={styles.backHit} />}
          </View>
        )}
        {body}
      </SafeAreaView>
    </View>
  );
}

function AtmosphereDecor() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.orb, styles.orbA]} />
      <View style={[styles.orb, styles.orbB]} />
      <View style={styles.horizon} />
    </View>
  );
}

export function DiasporaBrandMark({ size = "lg" }: { size?: "sm" | "lg" }) {
  const large = size === "lg";
  return (
    <View style={styles.brandWrap}>
      <Text style={[styles.brandEyeline, large && styles.brandEyelineLg]}>HODIX</Text>
      <Text style={[styles.brandName, large && styles.brandNameLg]}>Diaspora</Text>
    </View>
  );
}

export function DiasporaSection({
  title,
  body,
  children,
  tone = "light",
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  tone?: "light" | "dark";
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, tone === "dark" && { color: "#fff" }]}>{title}</Text>
      {body ? (
        <Text style={[styles.sectionBody, tone === "dark" && { color: "rgba(255,255,255,0.72)" }]}>
          {body}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function DiasporaPanel({
  children,
  style,
  accent,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: boolean;
}) {
  return (
    <View style={[styles.panel, accent && styles.panelAccent, style]}>
      {children}
    </View>
  );
}

export function DiasporaFadeIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 420, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 420, delay, useNativeDriver: true }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

export function DiasporaStepRail({
  steps,
  active,
}: {
  steps: string[];
  active: number;
}) {
  return (
    <View style={styles.rail}>
      {steps.map((label, i) => {
        const on = i + 1 === active;
        const done = i + 1 < active;
        return (
          <View key={label} style={styles.railItem}>
            <View style={[styles.railDot, on && styles.railDotOn, done && styles.railDotDone]}>
              <Text style={[styles.railNum, (on || done) && { color: "#fff" }]}>{i + 1}</Text>
            </View>
            <Text style={[styles.railLabel, on && styles.railLabelOn]} numberOfLines={2}>{label}</Text>
            {i < steps.length - 1 ? <View style={[styles.railLine, done && styles.railLineDone]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DiasporaPalette.night },
  safe: { flex: 1 },
  flexBody: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 56, gap: 18 },
  orb: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: DiasporaPalette.mist,
  },
  orbA: { width: 280, height: 280, top: -80, right: -90 },
  orbB: { width: 200, height: 200, top: 180, left: -70, backgroundColor: "rgba(201,162,39,0.08)" },
  horizon: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "38%",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  backHit: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  appBarText: { flex: 1, minWidth: 0 },
  appTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: Platform.OS === "ios" ? 0.2 : 0,
  },
  appSub: { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 2, fontWeight: "600" },
  brandWrap: { gap: 2 },
  brandEyeline: {
    color: DiasporaPalette.gold,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  brandEyelineLg: { fontSize: 13, letterSpacing: 5 },
  brandName: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  brandNameLg: { fontSize: 42, lineHeight: 46, letterSpacing: -1.2 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.textMuted,
    fontWeight: "500",
  },
  panel: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  panelAccent: {
    backgroundColor: "#fff",
    borderColor: "rgba(15,118,110,0.25)",
    borderWidth: 1.5,
  },
  rail: { flexDirection: "row", alignItems: "flex-start", gap: 0, marginVertical: 4 },
  railItem: { flex: 1, alignItems: "center", position: "relative" },
  railDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 1,
  },
  railDotOn: { backgroundColor: DiasporaPalette.teal, borderColor: DiasporaPalette.teal },
  railDotDone: { backgroundColor: DiasporaPalette.navy, borderColor: DiasporaPalette.navy },
  railNum: { fontSize: 12, fontWeight: "800", color: Colors.textMuted },
  railLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 2,
  },
  railLabelOn: { color: DiasporaPalette.navy },
  railLine: {
    position: "absolute",
    top: 13,
    left: "55%",
    right: "-55%",
    height: 2,
    backgroundColor: Colors.border,
    zIndex: 0,
  },
  railLineDone: { backgroundColor: DiasporaPalette.navy },
});
