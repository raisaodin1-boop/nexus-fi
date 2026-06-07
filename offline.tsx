import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors } from "@/src/theme";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const unsub = NetInfo.addEventListener(s => setIsOnline(!!s.isConnected));
    return unsub;
  }, []);
  return { isOnline };
}

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  if (isOnline) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Pas de connexion — mode hors-ligne</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: "#EF4444", paddingVertical: 8, paddingHorizontal: 16, alignItems: "center" },
  text: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
