import React, { useEffect, useState } from "react";
import { Alert, Clipboard, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Copy, Share2 } from "lucide-react-native";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { api } from "@/src/api";
import { Colors, Spacing } from "@/src/theme";

export default function QRReceiveScreen() {
  const router = useRouter();
  const [qrData, setQrData] = useState<any>(null);

  useEffect(() => {
    api.get("/payments/qr-data").then(setQrData).catch(() => {});
  }, []);

  const copyTag = () => {
    if (qrData?.hodix_tag) {
      Clipboard.setString(qrData.hodix_tag);
      Alert.alert("Copié !", "Votre tag a été copié");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <LinearGradient colors={["#4F46E5", "#7C3AED"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={{ color: "#fff", fontSize: 16 }}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Recevoir de l'argent</Text>
        <Text style={styles.sub}>Partagez ce QR code pour recevoir un paiement</Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={styles.body}>
        {qrData ? (
          <>
            <View style={styles.qrBox}>
              <QRCode value={JSON.stringify(qrData)} size={220} />
            </View>
            <Text style={styles.name}>{qrData.full_name}</Text>
            <Text style={styles.tag}>{qrData.hodix_tag}</Text>
            <TouchableOpacity style={styles.btn} onPress={copyTag}>
              <Copy color={Colors.primary} size={16} />
              <Text style={styles.btnText}>Copier mon tag</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={{ color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>Chargement...</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 20, paddingBottom: 30, paddingHorizontal: 24 },
  back: { marginBottom: 12 },
  title: { color: "#fff", fontSize: 22, fontWeight: "900" },
  sub: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 6 },
  body: { alignItems: "center", padding: 24 },
  qrBox: { backgroundColor: "#fff", padding: 20, borderRadius: 20, marginBottom: 20, elevation: 4 },
  name: { fontSize: 18, fontWeight: "800", color: Colors.text, marginBottom: 4 },
  tag: { fontSize: 16, fontWeight: "700", color: Colors.primary, fontVariant: ["tabular-nums"], marginBottom: 24 },
  btn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: Colors.primary, fontWeight: "700", fontSize: 14 },
});
