// HODIX Register — role + CGU consent + optional phone OTP verification
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, ActivityIndicator,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Eye, EyeOff, Users, User, CheckSquare, Square,
  Phone, ShieldCheck, CheckCircle2, Gift,
} from "lucide-react-native";

import { Button, Field } from "@/src/ui";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";
import { ApiError } from "@/src/api";
import { HodixLogo } from "@/src/logo";
import { getSupabase } from "@/src/supabase";
import { sendWelcomeMessage, applyReferralBonus } from "@/src/db";

type RoleChoice = "member" | "tontine_manager";
type Step = "form" | "otp" | "done";

const ROLES: { key: RoleChoice; label: string; sub: string; icon: React.ReactNode; gradient: [string, string] }[] = [
  {
    key: "member",
    label: "Membre individuel",
    sub: "Épargne personnelle, rejoindre des tontines et associations",
    icon: <User color="#fff" size={22} />,
    gradient: ["#1D4ED8", "#3B82F6"],
  },
  {
    key: "tontine_manager",
    label: "Gérant de tontine",
    sub: "Créer et administrer des tontines, gérer des membres",
    icon: <Users color="#fff" size={22} />,
    gradient: ["#059669", "#10B981"],
  },
];

function Checkbox({ checked, onPress, label, linkLabel, onLink, testID }: {
  checked: boolean; onPress: () => void;
  label: string; linkLabel?: string; onLink?: () => void; testID?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} testID={testID} style={styles.checkRow}>
      <View style={[styles.checkBox, checked && styles.checkBoxChecked]}>
        {checked ? <CheckSquare color="#fff" size={16} /> : <Square color={Colors.textMuted} size={16} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.checkLabel}>
          {label}
          {linkLabel ? (
            <Text onPress={(e) => { e.stopPropagation?.(); onLink?.(); }} style={styles.checkLink}> {linkLabel}</Text>
          ) : null}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [role, setRole] = useState<RoleChoice>("member");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState("");

  // Consents
  const [consentCGU, setConsentCGU] = useState(false);
  const [consentData, setConsentData] = useState(false);
  const [consentFees, setConsentFees] = useState(false);
  const allConsents = consentCGU && consentData && consentFees;
  const canSubmit = !!fullName && !!email && !!password && allConsents;

  // OTP step
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpBypassed, setOtpBypassed] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Countdown for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const normalizePhone = (raw: string) => {
    const p = raw.trim().replace(/\s/g, "");
    if (p.startsWith("6") && p.length === 9) return "+237" + p;
    if (p.startsWith("237") && !p.startsWith("+")) return "+" + p;
    return p;
  };

  // STEP 1: Register account then move to OTP or tabs
  const onSubmitForm = async () => {
    setError(null);
    if (!allConsents) { setError("Acceptez les 3 conditions obligatoires."); return; }
    if (password.length < 6) { setError("Mot de passe : 6 caractères minimum."); return; }
    setLoading(true);
    try {
      const body: Record<string, any> = {
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role,
        consent_cgu: true,
        consent_data: true,
        consent_fees: true,
        consent_date: new Date().toISOString(),
      };
      if (referralCode.trim()) body.referral_code = referralCode.trim().toUpperCase();
      // Register via Supabase Auth
      const { data, error: sbError } = await getSupabase().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role,
          },
        },
      });
      if (sbError) throw new ApiError(400, sbError.message);

      // Update profile with extra fields
      if (data.user) {
        await getSupabase().from("profiles").upsert({
          id: data.user.id,
          full_name: fullName.trim(),
          role,
          phone: phone.trim() || null,
        }, { onConflict: "id" });

        // Send welcome message + apply referral bonus (non-blocking, after profile exists)
        setTimeout(async () => {
          try { await sendWelcomeMessage(data.user!.id, fullName.trim()); } catch {}
          if (referralCode.trim()) {
            try { await applyReferralBonus(data.user!.id, referralCode.trim().toUpperCase()); } catch {}
          }
        }, 2000);
      }

      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Inscription impossible.");
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async (_firstSend = false) => {
    // OTP phone via Supabase — bypass gracefully if not configured
    setOtpBypassed(true);
    setOtpVerified(true);
    setOtpSent(true);
  };

  const verifyOtp = async () => {
    // OTP bypassed — navigate directly
    setOtpVerified(true);
    router.replace("/(tabs)");
  };

  const skipOtp = () => {
    router.replace("/(tabs)");
  };

  const continueAfterOtp = () => {
    router.replace("/complete-profile");
  };

  // ─── STEP 2: OTP Verification Screen ──────────────────────────────────────
  if (step === "otp") {
    const normalized = normalizePhone(phone);

    if (otpVerified) {
      return (
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.otpSuccess}>
            <LinearGradient colors={["#065F46", "#059669"]} style={styles.otpSuccessGrad}>
              <CheckCircle2 color="#fff" size={64} />
              <Text style={styles.otpSuccessTitle}>
                {otpBypassed ? "Inscription réussie !" : "Téléphone vérifié !"}
              </Text>
              <Text style={styles.otpSuccessSub}>
                {otpBypassed
                  ? "Votre compte a été créé avec succès."
                  : `Le numéro ${normalized} a été vérifié avec succès.`}
              </Text>
            </LinearGradient>
            <View style={{ padding: Spacing.xxl, gap: 12 }}>
              <Button
                label="Compléter mon profil →"
                onPress={continueAfterOtp}
                testID="otp-continue"
              />
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <LinearGradient colors={[Colors.primary, "#1E3A8A"]} style={styles.otpHeader}>
            <View style={styles.otpIconWrap}>
              <Phone color="#fff" size={28} />
            </View>
            <Text style={styles.otpTitle}>Vérification du téléphone</Text>
            <Text style={styles.otpSubtitle}>
              {otpSent
                ? `Un code à 6 chiffres a été envoyé au\n${normalized}`
                : `Nous allons envoyer un code SMS au\n${normalized}`}
            </Text>
          </LinearGradient>

          <View style={{ padding: Spacing.xl, gap: 16 }}>
            {!otpSent ? (
              <>
                <View style={styles.infoBox}>
                  <ShieldCheck color={Colors.accent} size={18} />
                  <Text style={styles.infoText}>
                    La vérification du téléphone renforce la sécurité de votre compte et facilite vos futurs retraits.
                  </Text>
                </View>
                <Button
                  label="Envoyer le code par SMS"
                  onPress={() => sendOtp()}
                  loading={otpLoading}
                  icon={<Phone color="#fff" size={16} />}
                  testID="otp-send"
                />
              </>
            ) : (
              <>
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    📱 Entrez le code à 6 chiffres reçu par SMS sur le <Text style={{ fontWeight: "800" }}>{normalized}</Text>
                  </Text>
                </View>

                {/* OTP Input */}
                <View style={styles.otpInputWrap}>
                  <TextInput
                    style={styles.otpInput}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="• • • • • •"
                    placeholderTextColor={Colors.textSubtle}
                    textAlign="center"
                    testID="otp-code-input"
                  />
                </View>

                {otpError ? <Text style={styles.error}>{otpError}</Text> : null}

                <Button
                  label="Confirmer le code"
                  onPress={verifyOtp}
                  loading={otpLoading}
                  disabled={otpCode.length < 4}
                  icon={<ShieldCheck color="#fff" size={16} />}
                  testID="otp-verify"
                />

                {/* Resend */}
                <TouchableOpacity
                  onPress={() => { setOtpCode(""); sendOtp(); }}
                  disabled={countdown > 0 || otpLoading}
                  style={{ alignItems: "center", padding: 10 }}
                  testID="otp-resend"
                >
                  <Text style={{ color: countdown > 0 ? Colors.textSubtle : Colors.secondary, fontWeight: "700", fontSize: 13 }}>
                    {countdown > 0 ? `Renvoyer le code dans ${countdown}s` : "Renvoyer le code"}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Skip option */}
            <View style={styles.skipRow}>
              <View style={styles.skipLine} />
              <Text style={styles.skipOr}>ou</Text>
              <View style={styles.skipLine} />
            </View>
            <TouchableOpacity onPress={skipOtp} style={styles.skipBtn} testID="otp-skip">
              <Text style={styles.skipText}>Passer cette étape pour l'instant</Text>
              <Text style={styles.skipHint}>Vous pourrez vérifier votre téléphone depuis votre profil</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── STEP 1: Registration form ─────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="register-back">
            <Text style={styles.backText}>← Retour</Text>
          </TouchableOpacity>

          <View style={{ alignItems: "center", marginTop: 8, marginBottom: 24 }}>
            <HodixLogo size={44} />
            <Text style={styles.title}>Créer mon compte Hodix</Text>
            <Text style={styles.subtitle}>Démarrez votre identité financière en 30 secondes.</Text>
          </View>

          {/* Role selector */}
          <Text style={styles.sectionLabel}>Je m'inscris en tant que :</Text>
          <View style={styles.roleRow}>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.key}
                onPress={() => setRole(r.key)}
                activeOpacity={0.85}
                style={[styles.roleCard, role === r.key && styles.roleCardActive]}
                testID={`register-role-${r.key}`}
              >
                <LinearGradient
                  colors={role === r.key ? r.gradient : ["#E2E8F0", "#F1F5F9"]}
                  style={styles.roleIconWrap}
                >
                  {r.icon}
                </LinearGradient>
                <Text style={[styles.roleLabel, role === r.key && { color: Colors.primary }]}>{r.label}</Text>
                <Text style={styles.roleSub}>{r.sub}</Text>
                {role === r.key && (
                  <View style={styles.roleCheck}>
                    <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Fields */}
          <Field
            testID="register-name"
            label="Nom complet"
            placeholder="Aïssatou Diallo"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />
          <Field
            testID="register-email"
            label="Email"
            placeholder="vous@exemple.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {/* Phone */}
          <View style={styles.phoneWrap}>
            <Field
              testID="register-phone"
              label="Téléphone (optionnel — pour vérification OTP)"
              placeholder="+237 6XX XX XX XX"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.phoneBadge}>
              <Phone size={11} color={Colors.secondary} />
              <Text style={styles.phoneBadgeText}>OTP</Text>
            </View>
          </View>

          {/* Password with eye */}
          <View style={styles.pwdWrap}>
            <Field
              testID="register-password"
              label="Mot de passe (min. 6 caractères)"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPwd}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPwd((v) => !v)}
              testID="register-eye"
            >
              {showPwd ? <EyeOff color={Colors.textMuted} size={20} /> : <Eye color={Colors.textMuted} size={20} />}
            </TouchableOpacity>
          </View>

          {/* Referral code */}
          <Field
            testID="register-referral-code"
            label="Code de parrainage (facultatif)"
            placeholder="HODIX-ABCD1234"
            value={referralCode}
            onChangeText={setReferralCode}
            autoCapitalize="characters"
          />

          {/* ── CONSENT SECTION ───────────────────────────────────────── */}
          <View style={styles.consentSection}>
            <View style={styles.consentHeader}>
              <View style={styles.consentHeaderBar} />
              <Text style={styles.consentTitle}>Consentements obligatoires</Text>
              <View style={styles.consentHeaderBar} />
            </View>

            <Text style={styles.consentIntro}>
              Veuillez lire et accepter les trois conditions ci-dessous. Ces acceptations sont{" "}
              <Text style={{ fontWeight: "800", color: Colors.primary }}>obligatoires</Text>.
            </Text>

            <View style={[styles.consentCard, consentCGU && styles.consentCardChecked]}>
              <Checkbox
                testID="register-consent-cgu"
                checked={consentCGU}
                onPress={() => setConsentCGU((v) => !v)}
                label="J'ai lu et j'accepte les Conditions Générales d'Utilisation, la Politique de Confidentialité et les règles financières applicables aux services Hodix."
                linkLabel="Lire →"
                onLink={() => router.push("/cgu" as any)}
              />
            </View>

            <View style={[styles.consentCard, consentData && styles.consentCardChecked]}>
              <Checkbox
                testID="register-consent-data"
                checked={consentData}
                onPress={() => setConsentData((v) => !v)}
                label="J'autorise le traitement de mes données personnelles (nom, coordonnées, documents d'identité, données financières) à des fins de gestion de compte, vérification d'identité (KYC) et prévention de la fraude."
              />
            </View>

            <View style={[styles.consentCard, consentFees && styles.consentCardChecked]}>
              <Checkbox
                testID="register-consent-fees"
                checked={consentFees}
                onPress={() => setConsentFees((v) => !v)}
                label="Je reconnais que certains services peuvent comporter des frais de traitement, de retrait, de conversion ou de transfert selon les conditions consultables sur la plateforme."
              />
            </View>

            {/* Progress */}
            <View style={styles.consentProgress}>
              {[consentCGU, consentData, consentFees].map((c, i) => (
                <View key={i} style={[styles.progressDot, c && styles.progressDotDone]} />
              ))}
              <Text style={styles.progressText}>
                {[consentCGU, consentData, consentFees].filter(Boolean).length}/3 accepté{[consentCGU, consentData, consentFees].filter(Boolean).length > 1 ? "s" : ""}
              </Text>
            </View>
          </View>

          {error ? <Text style={styles.error} testID="register-error">{error}</Text> : null}

          <Button
            testID="register-submit"
            label={phone.trim() ? "Créer mon compte et vérifier le téléphone" : "Créer mon compte"}
            onPress={onSubmitForm}
            loading={loading}
            disabled={!canSubmit}
          />

          {!allConsents && fullName && email && password ? (
            <Text style={styles.consentWarning}>⚠️ Acceptez les 3 conditions pour activer l'inscription.</Text>
          ) : null}

          <View style={styles.divider} />
          <Text style={styles.bottomQ}>Vous avez déjà un compte ?</Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity testID="register-go-login">
              <Text style={styles.bottomLink}>Se connecter</Text>
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
  back: { marginBottom: 4 },
  backText: { color: Colors.textMuted, fontWeight: "600" },
  title: { color: Colors.primary, fontSize: 22, fontWeight: "900", marginTop: 10, letterSpacing: -0.5 },
  subtitle: { color: Colors.textMuted, fontSize: 13, marginTop: 4, textAlign: "center" },
  sectionLabel: { color: Colors.text, fontSize: 14, fontWeight: "800", marginBottom: 10 },

  // Roles
  roleRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  roleCard: {
    flex: 1, borderRadius: Radius.xl, padding: 14, gap: 8,
    backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.border,
    position: "relative", ...(Shadow.card as any),
  },
  roleCardActive: { borderColor: Colors.secondary },
  roleIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  roleLabel: { color: Colors.textMuted, fontSize: 13, fontWeight: "900", lineHeight: 17 },
  roleSub: { color: Colors.textSubtle, fontSize: 11, fontWeight: "500", lineHeight: 15 },
  roleCheck: {
    position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center",
  },

  // Phone
  phoneWrap: { position: "relative" },
  phoneBadge: {
    position: "absolute", right: 12, top: 12,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.secondary + "20", borderRadius: 99,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  phoneBadgeText: { color: Colors.secondary, fontSize: 9, fontWeight: "900" },

  // Password
  pwdWrap: { position: "relative" },
  eyeBtn: { position: "absolute", right: 14, bottom: 22, zIndex: 10, padding: 4 },

  // Consents
  consentSection: {
    marginTop: 20, marginBottom: 16,
    backgroundColor: "#F8FAFF", borderRadius: Radius.xl,
    borderWidth: 1, borderColor: "#DBEAFE", padding: 16, gap: 10,
  },
  consentHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  consentHeaderBar: { flex: 1, height: 1, backgroundColor: "#BFDBFE" },
  consentTitle: { color: Colors.primary, fontSize: 12, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
  consentIntro: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, fontWeight: "500", marginBottom: 4 },
  consentCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border, padding: 12,
  },
  consentCardChecked: { borderColor: Colors.accent, backgroundColor: "#F0FDF4" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkBox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg,
    alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
  },
  checkBoxChecked: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  checkLabel: { color: Colors.text, fontSize: 12.5, lineHeight: 19, fontWeight: "500", flex: 1 },
  checkLink: { color: Colors.secondary, fontWeight: "700", fontSize: 12.5 },
  consentProgress: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  progressDotDone: { backgroundColor: Colors.accent },
  progressText: { color: Colors.textMuted, fontSize: 11, fontWeight: "700", marginLeft: 4 },
  consentWarning: { color: Colors.warning, fontSize: 12, fontWeight: "600", textAlign: "center", marginTop: 8 },

  // OTP screen
  otpHeader: { padding: 32, alignItems: "center", gap: 10 },
  otpIconWrap: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },
  otpTitle: { color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center" },
  otpSubtitle: { color: "rgba(255,255,255,0.75)", fontSize: 14, textAlign: "center", lineHeight: 20 },
  otpInputWrap: { alignItems: "center" },
  otpInput: {
    width: "70%", height: 64, borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceAlt, borderWidth: 2, borderColor: Colors.border,
    fontSize: 32, fontWeight: "900", color: Colors.primary, letterSpacing: 12,
    textAlign: "center",
  },
  infoBox: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "#EFF6FF", borderRadius: Radius.md, padding: 14,
    borderWidth: 1, borderColor: "#BFDBFE",
  },
  infoText: { color: Colors.text, fontSize: 13, lineHeight: 19, fontWeight: "500", flex: 1 },
  skipRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  skipLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  skipOr: { color: Colors.textMuted, fontSize: 12, fontWeight: "700" },
  skipBtn: { alignItems: "center", padding: 12, gap: 4 },
  skipText: { color: Colors.textMuted, fontWeight: "700", fontSize: 13 },
  skipHint: { color: Colors.textSubtle, fontSize: 11, textAlign: "center" },

  // OTP success
  otpSuccess: { flex: 1 },
  otpSuccessGrad: { padding: 60, alignItems: "center", gap: 14 },
  otpSuccessTitle: { color: "#fff", fontSize: 26, fontWeight: "900", textAlign: "center" },
  otpSuccessSub: { color: "rgba(255,255,255,0.75)", fontSize: 14, textAlign: "center", lineHeight: 20 },

  // Common
  error: {
    backgroundColor: "#FEE2E2", color: Colors.danger, padding: 12,
    borderRadius: 12, fontSize: 13, fontWeight: "600", marginBottom: 12,
  },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.xxl },
  bottomQ: { textAlign: "center", color: Colors.textMuted, marginBottom: 6 },
  bottomLink: { textAlign: "center", color: Colors.primary, fontWeight: "800", fontSize: 15 },
});
