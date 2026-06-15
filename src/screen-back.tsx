import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import { Colors } from "@/src/theme";

const HIDDEN_ROOTS = new Set([
  "(tabs)",
  "(auth)",
  "welcome",
  "onboarding",
  "index",
  "auth",
]);

/** Discrete back arrow on sub-pages (hidden on main tab menu). */
export function FloatingBackButton() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const root = segments[0] ?? "";

  if (!root || HIDDEN_ROOTS.has(root)) return null;
  if (segments.includes("login") || segments.includes("register")) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + (Platform.OS === "web" ? 8 : 4) }]}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.btn}
        activeOpacity={0.75}
        accessibilityLabel="Retour"
        testID="global-back"
      >
        <ArrowLeft color={Colors.text} size={18} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    zIndex: 200,
    elevation: 200,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
