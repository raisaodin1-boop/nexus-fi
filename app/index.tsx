import { Platform } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "@/src/auth-context";

export default function Root() {
  const { user, loading } = useAuth();

  if (Platform.OS === "web" && !loading && !user) {
    return <Redirect href="/landing" />;
  }

  return <Redirect href="/(tabs)" />;
}
