import NetInfo from "@react-native-community/netinfo";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors } from "@/src/theme";
import { replayQueue, getPendingCount } from "@/src/offline-queue";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(async (s) => {
      const online = !!s.isConnected && !!s.isInternetReachable;
      setIsOnline(online);

      // Coming back online → replay pending queue
      if (online && wasOffline.current) {
        wasOffline.current = false;
        const pending = await getPendingCount();
        if (pending > 0) {
          const result = await replayQueue();
          if (result.failed > 0) {
            console.warn(`[offline-queue] ${result.failed} transaction(s) failed after ${result.ok} replayed`);
          }
        }
      } else if (!online) {
        wasOffline.current = true;
      }
    });
    return unsub;
  }, []);

  return { isOnline };
}

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  if (isOnline) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>📡 Pas de connexion — les actions seront retentées à la reconnexion</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: "#EF4444", paddingVertical: 8, paddingHorizontal: 16, alignItems: "center" },
  text: { color: "#fff", fontWeight: "700", fontSize: 12, textAlign: "center" },
});
