// HODIX — Register screen
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
import { Mail, Lock, User, Eye, EyeOff, ArrowRight } from "lucide-react-native";

import { useAuth } from "@/src/auth-context";
import { HodixLogo } from "@/src/logo";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const { show } = useToast();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!fullName.trim() || !email.trim() || !password || !confirm) {
      show("Remplissez tous les champs", "error");
      return;
    }
    if (password !== confirm) {
      show("Les mots de passe ne correspondent pas", "error");
      return;
    }
    if (password.length < 8) {
      show("Le mot de passe doit faire au moins 8 caractères", "error");
      return;
    }
    setLoading(true);
    try {
      await register(email.trim().toLowerCase(), password, fullName.trim());
      router.replace("/");
    } catch (e: any) {
      show(e?.detail || e?.message || "Erreur lors de l'inscription", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={[Colors.primary, Colors.gradMid, Colors.secondary]} style={styles.header}>
        <HodixLogo size={48} />
        <Text style={styles.title}>Créer un compte</Text>
        <Text style={styles.subtitle}>Rejoignez la communauté HODIX</Text>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

          {/* Full name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nom complet</Text>
            <View style={styles.inputRow}>
              <User size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Prénom Nom"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
              />
            </View>
          </View>

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
                placeholder="Min. 8 caractères"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
                {showPassword
                  ? <EyeOff size={18} color={Colors.textMuted} />
                  : <Eye size={18} color={Colors.textMuted} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Confirmer le mot de passe</Text>
            <View style={styles.inputRow}>
              <Lock size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
              />
            </View>
          </View>

          {/* CGU */}
          <Text style={styles.cguText}>
            En créant un compte, vous acceptez nos{" "}
            <Text style={styles.cguLink} onPress={() => router.push("/cgu")}>
              Conditions Générales d'Utilisation
            </Text>
          </Text>

          {/* Register button */}
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
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
                    <Text style={styles.btnText}>Créer mon compte</Text>
                    <ArrowRight size={18} color="#fff" />
                  </>}
            </LinearGradient>
          </TouchableOpacity>

          {/* Login link */}
          <View style={styles.loginRow}>
            <Text style={styles.loginLabel}>Déjà un compte ? </Text>
            <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
              <Text style={styles.loginLink}>Se connecter</Text>
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
  title: { fontSize: 24, fontWeight: "900", color: "#fff", marginTop: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.75)", textAlign: "center" },
  form: { padding: Spacing.xl, gap: 14, paddingBottom: 40 },
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
  cguText: { fontSize: 12, color: Colors.textMuted, textAlign: "center", lineHeight: 18 },
  cguLink: { color: Colors.secondary, fontWeight: "600" },
  btn: { borderRadius: Radius.lg, overflow: "hidden", marginTop: 4 },
  btnDisabled: { opacity: 0.7 },
  btnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  loginRow: { flexDirection: "row", justifyContent: "center", marginTop: 8 },
  loginLabel: { fontSize: 14, color: Colors.textMuted },
  loginLink: { fontSize: 14, color: Colors.secondary, fontWeight: "700" },
});
