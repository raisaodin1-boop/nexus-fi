import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { Colors } from "@/src/theme";
import { PinSetupModal } from "@/src/pin-modal";

export default function PinSetupScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ id: string }>("/users/me")
      .then(me => setUserId(me.id))
      .catch(() => {
        Alert.alert("Erreur", "Impossible de charger le profil.");
        router.back();
      });
  }, []);

  if (!userId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg }}>
        <ActivityIndicator color={Colors.secondary} size="large" />
      </View>
    );
  }

  return (
    <PinSetupModal
      visible={true}
      userId={userId}
      onSuccess={() => {
        Alert.alert("PIN configuré !", "Votre PIN est actif.");
        router.back();
      }}
      onCancel={() => router.back()}
    />
  );
}
