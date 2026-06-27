import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeftRight, Zap } from "lucide-react-native";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

/** One-tap send money from the home dashboard. */
export function QuickSendBar() {
  const router = useRouter();

  return (
    <View style={[styles.wrap, Shadow.card]}>
      <View style={styles.iconWrap}>
        <Zap color={Colors.accent} size={18} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Envoi rapide</Text>
        <Text style={styles.sub}>Transférez à un membre HODIX en 2 taps</Text>
      </View>
      <TouchableOpacity style={styles.btn} onPress={() => router.push("/wallet/transfer")} testID="quick-send-btn">
        <ArrowLeftRight color="#fff" size={16} />
        <Text style={styles.btnText}>Envoyer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: Spacing.xl,
    marginBottom: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: Colors.text, fontWeight: "800", fontSize: 14 },
  sub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.lg,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
