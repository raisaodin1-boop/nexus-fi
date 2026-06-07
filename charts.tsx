// Lightweight line + bar chart components built on react-native-svg.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path, Circle, Line, Rect } from "react-native-svg";
import { Colors } from "@/src/theme";

export interface Point {
  date: string;  // YYYY-MM-DD
  value: number;
}

interface LineProps {
  data: Point[];
  height?: number;
  color?: string;
  showAxis?: boolean;
  title?: string;
  format?: (v: number) => string;
}

export function LineChart({
  data,
  height = 160,
  color = Colors.accent,
  showAxis = true,
  title,
  format,
}: LineProps) {
  const W = 340;
  const PAD_X = 16;
  const PAD_Y = 20;
  const innerW = W - PAD_X * 2;
  const innerH = height - PAD_Y * 2;

  const safe = data.length ? data : [{ date: "—", value: 0 }];
  const max = Math.max(1, ...safe.map((d) => d.value));
  const step = safe.length > 1 ? innerW / (safe.length - 1) : innerW;
  const points = safe.map((d, i) => ({
    x: PAD_X + i * step,
    y: PAD_Y + (innerH - (d.value / max) * innerH),
    raw: d,
  }));

  // Smooth path
  const path = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");
  const areaPath =
    points.length > 1
      ? `${path} L ${points[points.length - 1].x} ${PAD_Y + innerH} L ${points[0].x} ${PAD_Y + innerH} Z`
      : "";

  const total = safe.reduce((s, d) => s + d.value, 0);

  return (
    <View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`}>
        <Defs>
          <LinearGradient id="lc" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {showAxis ? (
          <>
            <Line x1={PAD_X} y1={PAD_Y + innerH} x2={W - PAD_X} y2={PAD_Y + innerH} stroke={Colors.border} strokeWidth={1} />
            <Line x1={PAD_X} y1={PAD_Y} x2={PAD_X} y2={PAD_Y + innerH} stroke={Colors.border} strokeWidth={1} />
          </>
        ) : null}
        {areaPath ? <Path d={areaPath} fill="url(#lc)" /> : null}
        <Path d={path} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {points.length <= 14
          ? points.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
            ))
          : null}
      </Svg>
      <View style={styles.legend}>
        <Text style={styles.legendLabel}>Total</Text>
        <Text style={[styles.legendValue, { color }]}>
          {format ? format(total) : total.toLocaleString("fr-FR")}
        </Text>
      </View>
    </View>
  );
}

interface BarProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  title?: string;
}

export function BarChart({ data, height = 180, title }: BarProps) {
  const W = 340;
  const PAD_X = 20;
  const PAD_Y = 30;
  const innerW = W - PAD_X * 2;
  const innerH = height - PAD_Y * 2;
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = data.length ? (innerW / data.length) * 0.6 : 0;
  const gap = data.length ? (innerW / data.length) * 0.4 : 0;

  return (
    <View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`}>
        <Line x1={PAD_X} y1={PAD_Y + innerH} x2={W - PAD_X} y2={PAD_Y + innerH} stroke={Colors.border} strokeWidth={1} />
        {data.map((d, i) => {
          const h = (d.value / max) * innerH;
          const x = PAD_X + i * (barW + gap) + gap / 2;
          const y = PAD_Y + innerH - h;
          const c = d.color ?? Colors.secondary;
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={y} width={barW} height={h} fill={c} rx={6} />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.barLabels}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.barLabel}>{d.label}</Text>
            <Text style={styles.barValue}>{d.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: Colors.text, fontSize: 13, fontWeight: "700", marginBottom: 8, letterSpacing: -0.2 },
  legend: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  legendLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "600", letterSpacing: 0.3 },
  legendValue: { fontSize: 13, fontWeight: "800" },
  barLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  barLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "600" },
  barValue: { color: Colors.text, fontSize: 12, fontWeight: "800", marginTop: 2 },
});
