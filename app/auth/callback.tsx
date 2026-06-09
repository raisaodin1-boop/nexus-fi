// OAuth callback — handles Google redirect on mobile
// expo-web-browser captures the redirect and this screen never actually renders
// but it must exist as a route so Expo Router can process the deep link.
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "@/src/theme";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // Brief delay then redirect to home — auth state is handled by AuthContext listener
    const t = setTimeout(() => router.replace("/"), 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}
