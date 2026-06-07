// HODIX Trust Score Gauge (semi-circle) using react-native-svg
import React from "react";
import Svg, { Circle, Defs, LinearGradient, Stop, G } from "react-native-svg";
import { Text as RNText, View, StyleSheet } from "react-native";
import { Colors } from "@/src/theme";

interface Props {
  score: number; // 0-1000
  level: string;
  color?: string;
  size?: number;
  scoreMax?: number;
}

export function TrustGauge({ score, level, color = Colors.accent, size = 220, scoreMax = 1000 }: Props) {
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * radius; // half circle
  const clamped = Math.min(scoreMax, Math.max(0, score));
  const progress = (clamped / scoreMax) * circumference;
  const offset = circumference - progress;

  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: size, height: size / 1.6 }}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={Colors.secondary} />
              <Stop offset="100%" stopColor={color} />
            </LinearGradient>
          </Defs>
          <G rotation="180" originX={cx} originY={cy}>
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              stroke={Colors.border}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={0}
              strokeLinecap="round"
            />
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              stroke="url(#g)"
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </G>
        </Svg>
        <View style={[styles.center, { width: size, height: size / 1.6 }]}>
          <RNText style={styles.score}>{clamped.toFixed(0)}</RNText>
          <RNText style={styles.outOf}>/ {scoreMax}</RNText>
        </View>
      </View>
      <View style={[styles.levelPill, { backgroundColor: color }]}>
        <RNText style={styles.levelText}>{level}</RNText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 20,
  },
  score: { fontSize: 56, fontWeight: "900", color: Colors.text, letterSpacing: -2 },
  outOf: { fontSize: 14, color: Colors.textMuted, marginTop: -8, fontWeight: "600" },
  levelPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: -10,
  },
  levelText: { color: "#fff", fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
});
