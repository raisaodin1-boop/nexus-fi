// HODIX official logo — lockup + mark variants for light/dark surfaces.
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  Platform,
} from "react-native";
import { Colors } from "@/src/theme";

const MARK = require("../assets/brand/hodix-mark.png");
const LOCKUP_DARK = require("../assets/brand/hodix-lockup-dark.png");
const LOCKUP_LIGHT = require("../assets/brand/hodix-lockup-light.png");

export type HodixLogoVariant = "mark" | "lockup" | "icon";

export function HodixLogo({
  size = 72,
  showText = false,
  variant = "mark",
  tone = "dark",
  style,
}: {
  size?: number;
  showText?: boolean;
  /** mark = emblem only · lockup = full brand · icon = rounded app-icon shell */
  variant?: HodixLogoVariant;
  /** dark lockup for black/navy surfaces · light lockup for white surfaces */
  tone?: "dark" | "light";
  style?: ViewStyle;
}) {
  if (variant === "lockup") {
    const src = tone === "light" ? LOCKUP_LIGHT : LOCKUP_DARK;
    const w = size;
    const h = size * 1.05;
    return (
      <View style={[{ alignItems: "center" }, style]}>
        <Image source={src} resizeMode="contain" style={{ width: w, height: h }} accessibilityLabel="HODIX" />
      </View>
    );
  }

  if (variant === "icon") {
    return (
      <View style={[{ alignItems: "center" }, style]}>
        <View
          style={[
            styles.iconShell,
            {
              width: size,
              height: size,
              borderRadius: Math.round(size / 4.5),
            },
            Platform.OS === "web"
              ? ({ boxShadow: "0px 8px 24px rgba(0, 0, 0, 0.45)" } as unknown as ViewStyle)
              : {
                  shadowColor: "#000",
                  shadowOpacity: 0.4,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 10,
                },
          ]}
        >
          <Image source={MARK} resizeMode="contain" style={{ width: "86%", height: "86%" }} />
        </View>
        {showText ? (
          <>
            <Text style={styles.brand}>HODIX</Text>
            <Text style={styles.tagline}>SAVE · GROW · EMPOWER</Text>
          </>
        ) : null}
      </View>
    );
  }

  // Default mark
  return (
    <View style={[{ alignItems: "center" }, style]}>
      <Image
        source={MARK}
        resizeMode="contain"
        style={{ width: size, height: size }}
        accessibilityLabel="HODIX"
      />
      {showText ? (
        <>
          <Text style={[styles.brand, tone === "light" ? styles.brandOnLight : null]}>HODIX</Text>
          <Text style={[styles.tagline, tone === "light" ? styles.tagOnLight : null]}>
            SAVE · GROW · EMPOWER
          </Text>
        </>
      ) : null}
    </View>
  );
}

/** Premium boot animation shown between native splash and welcome/app. */
export function HodixBootAnimation({
  visible,
  onFinished,
  minDurationMs = 2400,
}: {
  visible: boolean;
  onFinished?: () => void;
  minDurationMs?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.82)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);

  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    if (!visible) return;
    doneRef.current = false;

    const enter = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 48,
        useNativeDriver: true,
      }),
    ]);

    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.045,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const orbit = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 3200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const tag = Animated.timing(tagOpacity, {
      toValue: 1,
      duration: 800,
      delay: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    enter.start();
    breathe.start();
    orbit.start();
    tag.start();

    const t = setTimeout(() => {
      Animated.timing(exit, {
        toValue: 0,
        duration: 420,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        if (!doneRef.current) {
          doneRef.current = true;
          finishedRef.current?.();
        }
      });
    }, minDurationMs);

    return () => {
      clearTimeout(t);
      breathe.stop();
      orbit.stop();
    };
  }, [visible, minDurationMs, opacity, scale, pulse, tagOpacity, ring, exit]);

  if (!visible) return null;

  const spin = ring.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={[styles.bootRoot, { opacity: exit }]} pointerEvents="none">
      <View style={styles.bootGlow} />
      <Animated.View
        style={[
          styles.bootOrbit,
          {
            opacity: opacity.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
            transform: [{ rotate: spin }, { scale: pulse }],
          },
        ]}
      />
      <Animated.View style={{ opacity, transform: [{ scale: Animated.multiply(scale, pulse) }] }}>
        <Image
          source={LOCKUP_DARK}
          resizeMode="contain"
          style={styles.bootLogo}
          accessibilityLabel="HODIX"
        />
      </Animated.View>
      <Animated.Text style={[styles.bootHint, { opacity: tagOpacity }]}>
        Finance for a better Africa
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  iconShell: {
    overflow: "hidden",
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 6,
    marginTop: 14,
  },
  brandOnLight: { color: Colors.primary },
  tagline: {
    color: "rgba(212,175,55,0.9)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 4,
  },
  tagOnLight: { color: "#8B7355" },
  bootRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  bootGlow: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(212,175,55,0.12)",
  },
  bootOrbit: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1.5,
    borderColor: "rgba(212,175,55,0.35)",
    borderStyle: "dashed",
  },
  bootLogo: {
    width: 260,
    height: 260,
  },
  bootHint: {
    position: "absolute",
    bottom: 72,
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 2.4,
    textTransform: "uppercase",
  },
});
