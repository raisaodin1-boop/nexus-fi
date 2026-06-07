// HODIX Forgot / Reset password.
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Field } from "@/src/ui";
import { Colors, Spacing } from "@/src/theme";
import { ApiError, forgotPassword, resetPassword } from "@/src/api";

export default function ForgotScreen() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async () => {
    setError(null); setLoading(true);
    try {
      const res = await forgotPassword(email.trim());
      // Dev mode: token returned in body
      if (res.dev_token) {
        setResetToken(res.dev_token);
        setMessage("Token de réinitialisation pré-rempli (mode démo).");
      } else {
        setMessage(res.detail);
      }
      setStep("reset");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setError(null); setLoading(true);
    try {
      await resetPassword(resetToken.trim(), newPassword);
      setMessage("Mot de passe modifié. Redirection...");
      setTimeout(() => router.replace("/(auth)/login"), 1500);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="forgot-back">
            <Text style={styles.backText}>← Retour</Text>
          </TouchableOpacity>

          <Text style={styles.title}>
            {step === "request" ? "Réinitialiser votre mot de passe" : "Définir un nouveau mot de passe"}
          </Text>
          <Text style={styles.subtitle}>
            {step === "request"
              ? "Entrez votre email pour recevoir un lien de réinitialisation."
              : "Collez votre token et choisissez un nouveau mot de passe."}
          </Text>

          {step === "request" ? (
            <>
              <Field
                testID="forgot-email"
                label="Email"
                placeholder="vous@exemple.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              {message ? <View style={styles.info}><Text style={styles.infoText}>{message}</Text></View> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                testID="forgot-request-submit"
                label="Envoyer le lien"
                onPress={handleRequest}
                loading={loading}
                disabled={!email}
              />
            </>
          ) : (
            <>
              <Field
                testID="forgot-token"
                label="Token de réinitialisation"
                placeholder="Collez le token reçu par email"
                value={resetToken}
                onChangeText={setResetToken}
                autoCapitalize="none"
                multiline
              />
              <Field
                testID="forgot-new-password"
                label="Nouveau mot de passe"
                placeholder="••••••••"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              {message ? <View style={styles.info}><Text style={styles.infoText}>{message}</Text></View> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                testID="forgot-reset-submit"
                label="Confirmer le nouveau mot de passe"
                onPress={handleReset}
                loading={loading}
                disabled={!resetToken || !newPassword}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.xxl, paddingTop: Spacing.lg },
  back: { marginBottom: 16 },
  backText: { color: Colors.textMuted, fontWeight: "600" },
  title: { fontSize: 24, fontWeight: "900", color: Colors.primary, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: Colors.textMuted, marginTop: 6, marginBottom: 24, lineHeight: 20 },
  error: {
    backgroundColor: "#FEE2E2", color: Colors.danger, padding: 12,
    borderRadius: 12, fontSize: 13, fontWeight: "600", marginBottom: 12,
  },
  info: {
    backgroundColor: "#DCFCE7", padding: 12, borderRadius: 12, marginBottom: 12,
  },
  infoText: { color: Colors.accentDark, fontSize: 13, fontWeight: "600" },
});
