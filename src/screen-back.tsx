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

/** Screens that already render their own back control — avoid duplicate arrows. */
const ROOTS_WITH_LOCAL_BACK = new Set([
  "admin",
  "advisor",
  "alerts",
  "analytics",
  "auto-savings",
  "budget",
  "cgu",
  "cooperatives",
  "associations",
  "credit-score",
  "data-rights",
  "fee-config",
  "funds",
  "kyc",
  "messages",
  "notifications",
  "pay",
  "payments",
  "privacy",
  "promotion-request",
  "qr-payment",
  "qr-receive",
  "ranking",
  "referral",
  "split-expense",
  "streaks",
  "withdraw",
  "wallet",
  "tontines",
  "savings",
]);

/** Discrete back arrow on sub-pages (hidden on main tab menu). */
export function FloatingBackButton() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const root = segments[0] ?? "";
  const isWeb = Platform.OS === "web";

  if (!root || HIDDEN_ROOTS.has(root)) return null;
  if (ROOTS_WITH_LOCAL_BACK.has(root)) return null;
  const segs = segments as string[];
  if (segs.includes("login") || segs.includes("register")) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + (isWeb ? 6 : 4) }]}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        style={[styles.btn, isWeb && styles.btnWeb]}
        activeOpacity={0.75}
        accessibilityLabel="Retour"
        testID="global-back"
      >
        <ArrowLeft color={Colors.textMuted} size={isWeb ? 16 : 18} />
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
  btnWeb: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "rgba(229,231,235,0.6)",
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
});
