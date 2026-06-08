import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Mail } from "lucide-react-native";

import { forgotPassword } from "@/src/api";
import { HodixLogo } from "@/src/logo";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function ForgotScreen() {
  const router = useRouter();
  const { show } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) { show("Entrez votre adresse email", "error"); return; }
    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      setSent(true);
      show("Email envoyé ! Vérifiez votre boîte.", "success");
    } catch (e: any) {
      show(e?.detail || "Erreur lors de l'envoi", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={[Colors.primary, Colors.gradMid, Colors.secondary]} style={styles.header}>
        <HodixLogo size={48} />
        <Text style={styles.title}>Mot de passe oublié</Text>
        <Text style={styles.subtitle}>Entrez votre email pour recevoir un lien de réinitialisation</Text>
      </LinearGradient>

      <View style={styles.form}>
        {sent ? (
          <View style={styles.sentBox}>
            <Text style={styles.sentTitle}>Email envoyé !</Text>
            <Text style={styles.sentDesc}>Vérifiez votre boîte de réception et suivez le lien pour réinitialiser votre mot de passe.</Text>
            <TouchableOpacity onPress={() => router.replace("/(auth)/login")} style={styles.backToLogin}>
              <Text style={styles.backToLoginText}>Retour à la connexion</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputRow}>
                <Mail size={18} color={Colors.textMuted} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="votre@email.com"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[Colors.secondary, Colors.accent]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.btnGrad}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>Envoyer le lien</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
              <ArrowLeft size={16} color={Colors.secondary} />
              <Text style={styles.backText}>Retour à la connexion</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingTop: Spacing.xl, paddingBottom: Spacing.xl * 1.5,
    paddingHorizontal: Spacing.xl, alignItems: "center", gap: 10,
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
  },
  title: { fontSize: 24, fontWeight: "900", color: "#fff", marginTop: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 18 },
  form: { padding: Spacing.xl, gap: 16, marginTop: 8 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 14, gap: 10,
  },
  input: { flex: 1, fontSize: 15, color: Colors.text, outlineStyle: "none" } as any,
  btn: { borderRadius: Radius.lg, overflow: "hidden" },
  btnDisabled: { opacity: 0.7 },
  btnGrad: { alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  backRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  backText: { fontSize: 14, color: Colors.secondary, fontWeight: "600" },
  sentBox: { alignItems: "center", gap: 12, paddingTop: 20 },
  sentTitle: { fontSize: 22, fontWeight: "900", color: Colors.primary },
  sentDesc: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 20 },
  backToLogin: { marginTop: 8 },
  backToLoginText: { fontSize: 15, color: Colors.secondary, fontWeight: "700" },
});
