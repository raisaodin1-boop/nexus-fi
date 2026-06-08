// HODIX — Login screen
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react-native";

import { useAuth } from "@/src/auth-context";
import { forgotPassword } from "@/src/api";
import { HodixLogo } from "@/src/logo";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { show } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      show("Remplissez tous les champs", "error");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/");
    } catch (e: any) {
      show(e?.detail || e?.message || "Identifiants incorrects", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot() {
    if (!email.trim()) {
      show("Entrez votre email pour réinitialiser", "error");
      return;
    }
    setForgotLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      show("Email de réinitialisation envoyé !", "success");
    } catch (e: any) {
      show(e?.detail || "Erreur lors de l'envoi", "error");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={[Colors.primary, Colors.gradMid, Colors.secondary]} style={styles.header}>
        <HodixLogo size={56} />
        <Text style={styles.title}>Bon retour 👋</Text>
        <Text style={styles.subtitle}>Connectez-vous à votre espace HODIX</Text>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

          {/* Email */}
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

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Mot de passe</Text>
            <View style={styles.inputRow}>
              <Lock size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
                {showPassword
                  ? <EyeOff size={18} color={Colors.textMuted} />
                  : <Eye size={18} color={Colors.textMuted} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Forgot password */}
          <TouchableOpacity onPress={handleForgot} disabled={forgotLoading} style={styles.forgotRow}>
            {forgotLoading
              ? <ActivityIndicator size="small" color={Colors.secondary} />
              : <Text style={styles.forgotText}>Mot de passe oublié ?</Text>}
          </TouchableOpacity>

          {/* Login button */}
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
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
                : <>
                    <Text style={styles.btnText}>Se connecter</Text>
                    <ArrowRight size={18} color="#fff" />
                  </>}
            </LinearGradient>
          </TouchableOpacity>

          {/* Register link */}
          <View style={styles.registerRow}>
            <Text style={styles.registerLabel}>Pas encore de compte ? </Text>
            <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
              <Text style={styles.registerLink}>Créer un compte</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl * 1.5,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
    gap: 10,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  title: { fontSize: 26, fontWeight: "900", color: "#fff", marginTop: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.75)", textAlign: "center" },
  form: { padding: Spacing.xl, gap: 16, paddingBottom: 40 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "web" ? 14 : 0,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    paddingVertical: Platform.OS === "web" ? 0 : 14,
    outlineStyle: "none",
  } as any,
  forgotRow: { alignItems: "flex-end", marginTop: -4 },
  forgotText: { fontSize: 13, color: Colors.secondary, fontWeight: "600" },
  btn: { borderRadius: Radius.lg, overflow: "hidden", marginTop: 8 },
  btnDisabled: { opacity: 0.7 },
  btnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  registerRow: { flexDirection: "row", justifyContent: "center", marginTop: 8 },
  registerLabel: { fontSize: 14, color: Colors.textMuted },
  registerLink: { fontSize: 14, color: Colors.secondary, fontWeight: "700" },
});
