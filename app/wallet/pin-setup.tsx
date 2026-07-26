import React from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "@/src/theme";
import { PinSetupModal } from "@/src/pin-modal";
import { useAuth } from "@/src/auth-context";

export default function PinSetupScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();

  if (loading || !user?.id) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg }}>
        <ActivityIndicator color={Colors.secondary} size="large" />
      </View>
    );
  }

  return (
    <PinSetupModal
      visible
      userId={user.id}
      onSuccess={() => {
        Alert.alert("PIN configuré", "Votre PIN est actif sur ce compte et cet appareil.");
        router.back();
      }}
      onCancel={() => router.back()}
    />
  );
}
