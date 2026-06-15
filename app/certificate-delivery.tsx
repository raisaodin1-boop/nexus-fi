// Post-payment certificate delivery — email + download
import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Award, CheckCircle2, Download, Mail } from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { downloadOrSharePdf } from "@/src/pdf-download";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

const KIND_LABELS: Record<string, string> = {
  identity: "Identité Certifiée",
  "trust-score": "Trust Score Certifié",
  savings: "Épargne Certifiée",
};

export default function CertificateDeliveryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { cert_kind, paymentId } = useLocalSearchParams<{
    cert_kind?: "identity" | "trust-score" | "savings";
    paymentId?: string;
  }>();
  const kind = cert_kind ?? "identity";
  const [email, setEmail] = useState(user?.email ?? "");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sent, setSent] = useState(false);

  const sendEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      Alert.alert("Email invalide", "Entrez une adresse email valide pour recevoir votre certificat.");
      return;
    }
    setSending(true);
    try {
      await api.post("/certificates/send-email", { kind, email: trimmed, payment_id: paymentId });
      setSent(true);
      Alert.alert(
        "Certificat envoyé",
        `Votre certificat authentifié a été envoyé à ${trimmed}. Vérifiez aussi vos spams.`,
      );
    } catch (e) {
      Alert.alert("Erreur", e instanceof ApiError ? e.detail : "Envoi impossible. Réessayez.");
    } finally {
      setSending(false);
    }
  };

  const downloadCert = async () => {
    setDownloading(true);
    try {
      const report = await api.get<{ filename: string; html: string }>(`/reports/certified/${kind}`);
      await downloadOrSharePdf(report.html, report.filename);
    } catch (e) {
      Alert.alert("Erreur", e instanceof ApiError ? e.detail : "Téléchargement impossible.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingTop: 56, paddingBottom: 100 }}>
        <LinearGradient colors={[Colors.gradGold1, Colors.gradGold3]} style={styles.hero}>
          <CheckCircle2 color="#fff" size={48} />
          <Text style={styles.heroTitle}>Paiement confirmé</Text>
          <Text style={styles.heroSub}>
            Votre certificat {KIND_LABELS[kind] ?? kind} est prêt.
          </Text>
        </LinearGradient>

        <Card style={{ gap: 14, marginTop: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Award color={Colors.gold} size={22} />
            <Text style={styles.cardTitle}>Recevoir par email</Text>
          </View>
          <Text style={styles.cardDesc}>
            Indiquez l'adresse email où nous devons envoyer votre certificat authentifié officiel (tampon + code de vérification).
          </Text>
          <Field
            label="Adresse email"
            placeholder="exemple@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            testID="cert-email"
          />
          <Button
            label={sent ? "Renvoyer le certificat" : "Envoyer le certificat par email"}
            icon={<Mail color="#fff" size={16} />}
            loading={sending}
            onPress={sendEmail}
            testID="cert-send-email"
          />
        </Card>

        <Card style={{ gap: 12, marginTop: 14 }}>
          <Text style={styles.cardTitle}>Télécharger maintenant</Text>
          <Text style={styles.cardDesc}>
            Vous pouvez aussi télécharger le PDF directement sur cet appareil.
          </Text>
          <Button
            label="Télécharger le certificat PDF"
            variant="secondary"
            icon={<Download color="#fff" size={16} />}
            loading={downloading}
            onPress={downloadCert}
            testID="cert-download"
          />
        </Card>

        <Button
          label="Retour à mon identité"
          variant="ghost"
          onPress={() => router.replace("/(tabs)/identity")}
          testID="cert-back-identity"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  hero: {
    borderRadius: Radius.xxl,
    padding: 28,
    alignItems: "center",
    gap: 10,
  },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 14, textAlign: "center", lineHeight: 20 },
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  cardDesc: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
});
