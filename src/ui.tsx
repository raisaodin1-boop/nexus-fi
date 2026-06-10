// HODIX shared UI primitives — buttons, cards, headers.
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
  StyleProp,
  TextStyle,
} from "react-native";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

const triggerHaptic = Platform.OS !== "web"
  ? (type: "impact" | "warning") => {
      import("expo-haptics").then((Haptics) => {
        if (type === "warning") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      }).catch(() => {});
    }
  : (_type: "impact" | "warning") => {};

interface BtnProps {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "accent" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  testID,
  style,
  fullWidth = true,
}: BtnProps) {
  const bg =
    variant === "primary"
      ? Colors.secondary
      : variant === "accent"
      ? Colors.accent
      : variant === "danger"
      ? Colors.danger
      : variant === "ghost"
      ? "transparent"
      : Colors.surface;
  const text =
    variant === "secondary" ? Colors.primary : variant === "ghost" ? Colors.secondary : "#fff";
  const border = variant === "secondary" ? Colors.border : "transparent";
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled || loading}
      onPress={() => {
        triggerHaptic(variant === "danger" ? "warning" : "impact");
        onPress?.();
      }}
      testID={testID}
      style={[
        styles.btn,
        { backgroundColor: bg, borderColor: border, borderWidth: 1, opacity: disabled ? 0.5 : 1 },
        fullWidth ? { width: "100%" } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={text} />
      ) : (
        <View style={styles.btnRow}>
          {icon}
          <Text style={[styles.btnText, { color: text }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

interface FieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  testID?: string;
}

export function Field({ label, error, testID, style, ...rest }: FieldProps) {
  const borderAnim = useRef(new Animated.Value(0)).current;

  const onFocus = () => {
    Animated.timing(borderAnim, { toValue: 1, duration: 180, useNativeDriver: false }).start();
    rest.onFocus?.({} as any);
  };
  const onBlur = () => {
    Animated.timing(borderAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
    rest.onBlur?.({} as any);
  };

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? Colors.danger : Colors.border, error ? Colors.danger : Colors.secondary],
  });

  return (
    <View style={{ marginBottom: Spacing.md }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Animated.View style={{ borderWidth: 1.5, borderColor, borderRadius: Radius.md, backgroundColor: Colors.surface }}>
        <TextInput
          placeholderTextColor={Colors.textSubtle}
          style={[styles.input, { borderWidth: 0, borderRadius: Radius.md }, style]}
          testID={testID}
          onFocus={onFocus}
          onBlur={onBlur}
          {...rest}
        />
      </Animated.View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
  testID?: string;
}
export function Card({ children, style, dark, testID }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        dark ? { backgroundColor: Colors.primary } : null,
        Shadow.card,
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function Pill({
  label,
  color = Colors.accent,
  textColor = "#fff",
}: {
  label: string;
  color?: string;
  textColor?: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={[styles.pillText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = Colors.secondary,
  testID,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  testID?: string;
}) {
  return (
    <View style={[styles.stat, Shadow.card]} testID={testID}>
      <View style={[styles.statAccent, { backgroundColor: accent }]} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  cta,
  icon,
}: {
  title: string;
  description: string;
  cta?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 120 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.empty, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
      {icon
        ? <View style={styles.emptyIconBox}>{icon}</View>
        : <View style={styles.emptyIconBox}><View style={styles.emptyIconDefault} /></View>}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{description}</Text>
      {cta ? <View style={{ marginTop: Spacing.lg, width: "100%" }}>{cta}</View> : null}
    </Animated.View>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonBox({ width = "100%", height = 16, borderRadius = Radius.md, style }: SkeletonBoxProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: Colors.surfaceAlt, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.row}>
        <SkeletonBox width={38} height={38} borderRadius={10} />
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonBox height={16} borderRadius={Radius.sm} />
          <SkeletonBox width="60%" height={12} borderRadius={Radius.sm} />
        </View>
      </View>
      <SkeletonBox height={12} borderRadius={Radius.sm} style={{ marginTop: 10 }} />
      <SkeletonBox width="40%" height={12} borderRadius={Radius.sm} style={{ marginTop: 6 }} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});

// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnText: { fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 6,
  },
  fieldError: { fontSize: 12, color: Colors.danger, marginTop: 4 },
  input: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
  } as TextStyle,
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    marginTop: Spacing.xl,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: Colors.text, letterSpacing: -0.3 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  pillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  stat: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 140,
    position: "relative",
    overflow: "hidden",
  },
  statAccent: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
  },
  statLabel: { fontSize: 12, fontWeight: "600", color: Colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  statHint: { fontSize: 11, color: Colors.textSubtle, marginTop: 4 },
  empty: {
    alignItems: "center", padding: Spacing.xxxl, gap: 8,
  },
  emptyIconBox: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },
  emptyIconDefault: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.border },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: Colors.text, textAlign: "center" },
  emptyDesc: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 20, maxWidth: "85%" },
});

// ─── Confetti overlay ─────────────────────────────────────────────────────────

const CONFETTI_COLORS = ["#10B981", "#1D4ED8", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

interface ConfettiParticle {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  rotate: Animated.Value;
  color: string;
  size: number;
  startX: number;
}

import { Dimensions } from "react-native";
const { width: SW, height: SH } = Dimensions.get("window");

export function ConfettiOverlay({ visible }: { visible: boolean }) {
  const particles = useRef<ConfettiParticle[]>(
    Array.from({ length: 28 }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      rotate: new Animated.Value(0),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 8 + (i % 5) * 2,
      startX: (i / 28) * SW,
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    particles.forEach((p, i) => {
      p.x.setValue(0);
      p.y.setValue(0);
      p.opacity.setValue(1);
      p.rotate.setValue(0);
      const delay = i * 40;
      Animated.parallel([
        Animated.timing(p.x, { toValue: (Math.random() - 0.5) * 160, duration: 1200, delay, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: SH * 0.6 + Math.random() * SH * 0.3, duration: 1400, delay, useNativeDriver: true }),
        Animated.timing(p.rotate, { toValue: 6, duration: 1200, delay, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(delay + 800),
          Animated.timing(p.opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]).start();
    });
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            top: SH * 0.2,
            left: p.startX,
            width: p.size,
            height: p.size,
            borderRadius: p.size / 4,
            backgroundColor: p.color,
            opacity: p.opacity,
            transform: [
              { translateX: p.x },
              { translateY: p.y },
              { rotate: p.rotate.interpolate({ inputRange: [0, 6], outputRange: ["0deg", "720deg"] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}
