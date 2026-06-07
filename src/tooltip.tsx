// Tooltip / onboarding contextuel system.
// Persists "seen" flags in storage to show once. Each tip is anchored to a screen+key.
import React, { useCallback, useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles, X } from "lucide-react-native";

import { storage } from "@/src/utils/storage";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

const SEEN_KEY = (k: string) => `hodix_tip_${k}`;

export interface TipDef {
  id: string;
  title: string;
  body: string;
  cta?: string;
}

interface Props {
  tip: TipDef;
  enabled?: boolean; // master switch (e.g. only show to members)
}

/**
 * Shows a tooltip card the first time the screen is opened (per device).
 * Persists "seen" flag in local storage.
 */
export function Tooltip({ tip, enabled = true }: Props) {
  const [visible, setVisible] = useState(false);

  const check = useCallback(async () => {
    if (!enabled) return;
    const seen = await storage.getItem(SEEN_KEY(tip.id), false as boolean);
    if (!seen) setVisible(true);
  }, [tip.id, enabled]);

  useEffect(() => {
    check();
  }, [check]);

  const dismiss = async () => {
    await storage.setItem(SEEN_KEY(tip.id), true);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, Shadow.cardDark]} testID={`tip-${tip.id}`}>
          <TouchableOpacity onPress={dismiss} style={styles.closeBtn} testID={`tip-close-${tip.id}`}>
            <X color="#fff" size={16} />
          </TouchableOpacity>
          <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.iconWrap}>
            <Sparkles color="#fff" size={22} />
          </LinearGradient>
          <Text style={styles.title}>{tip.title}</Text>
          <Text style={styles.body}>{tip.body}</Text>
          <TouchableOpacity onPress={dismiss} style={styles.cta} testID={`tip-cta-${tip.id}`}>
            <Text style={styles.ctaText}>{tip.cta ?? "Compris !"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(11,31,58,0.7)",
    alignItems: "center", justifyContent: "center", padding: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xxl,
    padding: 24, width: "100%", maxWidth: 360,
    alignItems: "center", borderWidth: 1, borderColor: Colors.border,
  },
  closeBtn: {
    position: "absolute", top: 14, right: 14,
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "900", color: Colors.primary, letterSpacing: -0.3, textAlign: "center" },
  body: { fontSize: 13, color: Colors.textMuted, lineHeight: 19, textAlign: "center", marginTop: 8, marginBottom: 18 },
  cta: {
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    paddingHorizontal: 28, paddingVertical: 12,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
