// HODIX Login — with biometric (Face ID / Fingerprint) support
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eye, EyeOff, Fingerprint } from "lucide-react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import { Button, Field } from "@/src/ui";
import { Colors, Spacing } from "@/src/theme";
import { useAuth } from "@/src/auth-context";
import { ApiError } from "@/src/api";
import { HodixLogo } from "@/src/logo";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  // On mount: check if biometric login is enabled
  useEffect(() => {
    (async () => {
      try {
        const enabled = await SecureStore.getItemAsync("bio_enabled");
        if (enabled !== "1") return;
        const hasHw = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBioAvailable(hasHw && enrolled);
      } catch {}
    })();
  }, []);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const user = await login(email.trim(), password);

      // After successful login: offer to enable biometric
      try {
        const hasHw = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (hasHw && enrolled) {
          const alreadyEnabled = await SecureStore.getItemAsync("bio_enabled");
          if (alreadyEnabled !== "1") {
            Alert.alert(
              "Connexion biométrique",
              "Activer la connexion avec Face ID / Empreinte digitale ?",
              [
                { text: "Non", style: "cancel" },
                {
                  text: "Activer",
                  onPress: async () => {
                    try {
                      await SecureStore.setItemAsync("bio_email", email.trim());
                      await SecureStore.deleteItemAsync("bio_password"); // remove old plaintext format
                      await SecureStore.setItemAsync("bio_enabled", "1");
                      // Refresh token is already stored securely by login()
                    } catch {}
                  },
                },
              ],
            );
          }
        }
      } catch {}

      if (user.role === "super_admin" || user.role === "tontine_manager") {
        router.replace("/(tabs)");
      } else {
        router.replace("/(tabs)");
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Connexion impossible.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onBioLogin = async () => {
    setBioLoading(true);
    setError(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Connectez-vous à HODIX",
        cancelLabel: "Annuler",
      });
      if (!result.success) {
        setBioLoading(false);
        return;
      }
      // Biometric confirmed — check Supabase session is still active
      const { data } = await (await import("@/src/supabase")).getSupabase().auth.getSession();
      if (!data.session) {
        setError("Session expirée. Reconnectez-vous avec votre mot de passe.");
        setBioLoading(false);
        return;
      }
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Connexion impossible.";
      setError(msg);
    } finally {
      setBioLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail("demo@hodix.app");
    setPassword("Demo123!");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignItems: "center", marginTop: 40, marginBottom: Spacing.xxl }}>
            <HodixLogo size={60} />
            <Text style={styles.brand}>HODIX</Text>
            <Text style={styles.subtitle}>Connexion à votre identité financière</Text>
          </View>

          {/* Biometric login button */}
          {bioAvailable ? (
            <TouchableOpacity
              style={styles.bioBtn}
              onPress={onBioLogin}
              disabled={bioLoading}
              testID="login-biometric"
            >
              <Fingerprint color={Colors.secondary} size={22} />
              <Text style={styles.bioBtnText}>
                {bioLoading ? "Vérification…" : "Se connecter avec Face ID / Empreinte"}
              </Text>
            </TouchableOpacity>
          ) : null}

          <Field
            testID="login-email"
            label="Email"
            placeholder="vous@exemple.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <View style={{ position: "relative" }}>
            <Field
              testID="login-password"
              label="Mot de passe"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPwd}
              autoComplete="password"
            />
            <TouchableOpacity
              style={{ position: "absolute", right: 14, bottom: 22, zIndex: 10, padding: 4 }}
              onPress={() => setShowPwd((v) => !v)}
              testID="login-eye"
            >
              {showPwd ? <EyeOff color={Colors.textMuted} size={20} /> : <Eye color={Colors.textMuted} size={20} />}
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}

          <Button
            testID="login-submit"
            label="Se connecter"
            onPress={onSubmit}
            loading={loading}
            disabled={!email || !password}
          />

          <TouchableOpacity onPress={fillDemo} testID="login-fill-demo" style={styles.demoBtn}>
            <Text style={styles.demoText}>Utiliser le compte de démonstration</Text>
          </TouchableOpacity>

          <View style={styles.row}>
            <Link href="/(auth)/forgot" asChild>
              <TouchableOpacity testID="login-forgot">
                <Text style={styles.link}>Mot de passe oublié ?</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View style={styles.divider} />

          <Text style={styles.bottomQ}>Pas encore de compte ?</Text>
          <Link href="/(auth)/register" asChild>
            <TouchableOpacity testID="login-go-register">
              <Text style={styles.bottomLink}>Créer un compte Hodix</Text>
            </TouchableOpacity>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.xxl, paddingBottom: 40 },
  brand: { color: Colors.primary, fontSize: 28, fontWeight: "900", letterSpacing: 6, marginTop: 12 },
  subtitle: { color: Colors.textMuted, fontSize: 14, marginTop: 4, fontWeight: "500" },
  error: {
    backgroundColor: "#FEE2E2",
    color: Colors.danger,
    padding: 12,
    borderRadius: 12,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
  },
  bioBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 2,
    borderColor: Colors.secondary,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: Spacing.lg,
    backgroundColor: "rgba(29,78,216,0.05)",
  },
  bioBtnText: { color: Colors.secondary, fontWeight: "700", fontSize: 14 },
  demoBtn: { marginTop: 12, padding: 12, alignItems: "center" },
  demoText: { color: Colors.secondary, fontWeight: "600", fontSize: 13 },
  row: { alignItems: "center", marginTop: 4 },
  link: { color: Colors.secondary, fontWeight: "600" },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.xxl },
  bottomQ: { textAlign: "center", color: Colors.textMuted, marginBottom: 6 },
  bottomLink: { textAlign: "center", color: Colors.primary, fontWeight: "800", fontSize: 15 },
});
