import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { Colors } from "@/src/theme";
import { useResponsive } from "@/src/hooks/use-responsive";

interface MobileScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: Edge[];
  /** Extra bottom padding for scroll content above tab bar (e.g. 100). */
  scrollBottomPad?: number;
}

/**
 * Safe-area shell with compact horizontal padding on small screens.
 */
export function MobileScreen({ children, style, edges = ["top"], scrollBottomPad }: MobileScreenProps) {
  const { horizontalPad } = useResponsive();
  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      <View style={[styles.body, { paddingHorizontal: horizontalPad, paddingBottom: scrollBottomPad }]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  body: { flex: 1 },
});
