import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { routeFromShareTarget } from "@/src/share-target";
import { Colors } from "@/src/theme";

/** Web Share Target landing — routes shared links / invite codes into the app. */
export default function ShareTargetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string; text?: string; url?: string }>();

  useEffect(() => {
    const route = routeFromShareTarget({
      title: params.title,
      text: params.text,
      url: params.url,
    });
    router.replace(route as any);
  }, [params.title, params.text, params.url, router]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={Colors.secondary} />
      <Text style={styles.text}>Ouverture du contenu partagé…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: Colors.bg },
  text: { color: Colors.textMuted, fontWeight: "600" },
});
