import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/src/theme";

/**
 * Blends the system status / browser chrome area with the app background on web/PWA,
 * so the top edge looks like a native shell instead of a visible browser frame.
 */
export function WebShellChrome() {
  const insets = useSafeAreaInsets();

  if (Platform.OS !== "web" || insets.top <= 0) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.bar, { height: insets.top }]}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 150,
    backgroundColor: Colors.bg,
  },
});
