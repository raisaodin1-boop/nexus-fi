// HODIX Payment — Stripe / Orange Money / MTN Money
// Business rules:
//   - Mobile Money: member pays EXACT cotisation amount — no fee displayed
//   - Stripe: member sees cotisation amount only — gross handled server-side
//   - Commission 1.5% applied only on withdrawal, NEVER shown here
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { LinearGradient } from "expo-linear-gradient";
import { CheckCircle2, XCircle, CreditCard, Smartphone, ArrowRight, Lock } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";

type Method = "stripe" | "orange" | "mtn";
type Stage = "select" | "form" | "processing" | "done";
type Status = "succeeded" | "failed" | "expired" | "canceled" | "polling";

interface StripePaymentInfo {
  payment_id: string;
  checkout_url: string;
  displayed_amount_xaf: number;
  currency: string;
}

const METHODS = [
  {
    key: "orange" as Method,
    label: "Orange Money",
    sub: "Paiement mobile instantané",
    color: "#FF6900",
    dark: "#CC5400",
    icon: "🟠",
  },
  {
    key: "mtn" as Method,
    label: "MTN Mobile Money",
    sub: "Paiement mobile instantané",
    color: "#FFCC00",
    dark: "#CC9900",
    icon: "🟡",
  },
  {
    key: "stripe" as Method,
    label: "Carte bancaire",
    sub: "Visa, Mastercard — 3-D Secure",
    color: Colors.secondary,
    dark: "#1E40AF",
    icon: "💳",
  },
];

export default function PayContribution() {
  const router = useRouter();
  const { tontine_id, goal_id, amount, label } = useLocalSearchParams<{
    tontine_id?: string; goal_id?: string; amount: string; label?: string;
  }>();
  const amt = parseFloat(amount || "0");

  const [method, setMethod] = useState<Method | null>(null);
  const [stage, setStage] = useState<Stage>("select");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stripeInfo, setStripeInfo] = useState<StripePaymentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [webviewOpen, setWebviewOpen] = useState(false);
  const [finalStatus, setFinalStatus] = useState<Status | null>(null);
  const [countdown, setCountdown] = useState(120);

  // Pulse animation for processing
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (stage !== "processing") return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [stage]);

  // Countdown for mobile money
  useEffect(() => {
    if (stage !== "processing" || method === "stripe") return;
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, stage, method]);

  // Poll Stripe status
  useEffect(() => {
    if (!stripeInfo || method !== "stripe") return;
    if (webviewOpen) return;
    let stopped = false;
    let t: any;
    const poll = async () => {
      try {
        const s = await api.get<any>(`/payments/${stripeInfo.payment_id}/status`);
        if (["succeeded", "failed", "expired"].includes(s.status)) {
          setFinalStatus(s.status);
          setStage("done");
          return;
        }
      } catch {}
      if (!stopped) t = setTimeout(poll, 2500);
    };
    poll();
    return () => { stopped = true; if (t) clearTimeout(t); };
  }, [stripeInfo, webviewOpen, method]);

  const selectedMethod = METHODS.find((m) => m.key === method);

  // --- Stripe flow ---
  const startStripe = async () => {
    setError(null); setBusy(true);
    try {
      const r = await api.post<StripePaymentInfo & { payment_id: string }>("/payments/contributions/checkout", {
        tontine_id, amount_xaf: amt,
      });
      setStripeInfo(r);
      setStage("processing");
      if (Platform.OS === "web") {
        window.open(r.checkout_url, "_blank");
      } else {
        setWebviewOpen(true);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur de paiement");
    } finally { setBusy(false); }
  };

  // --- Mobile Money flow ---
  const sendMobileMoneyRequest = async () => {
    if (!phone || phone.length < 9) { setError("Numéro invalide"); return; }
    setError(null); setBusy(true);
    try {
      await api.post("/payments/mobile-money/initiate", {
        ...(tontine_id ? { tontine_id } : {}),
        ...(goal_id ? { goal_id } : {}),
        amount_xaf: amt,
        provider: method,
        phone,
      });
      setStage("processing");
      setCountdown(120);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally { setBusy(false); }
  };

  const confirmMobileMoney = async () => {
    if (!otp || otp.length < 4) { setError("Code de confirmation invalide"); return; }
    setError(null); setBusy(true);
    try {
      const mmResult = await api.post<{ payment_id?: string }>("/payments/mobile-money/confirm", {
        ...(tontine_id ? { tontine_id } : {}),
        ...(goal_id ? { goal_id } : {}),
        amount_xaf: amt,
        provider: method,
        phone,
        reference: otp,
      });
      // Credit savings goal after successful mobile money payment
      if (goal_id) {
        await api.post(`/savings/goals/${goal_id}/transactions`, { amount: amt, kind: "deposit" }).catch(() => null);
      }
      setFinalStatus("succeeded");
      setStage("done");
      if (mmResult?.payment_id) {
        router.replace({
          pathname: "/payments/receipt",
          params: { paymentId: mmResult.payment_id, type: "deposit" },
        } as any);
        return;
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur de confirmation");
    } finally { setBusy(false); }
  };

  const onNavChange = (navState: { url: string }) => {
    const u = navState.url || "";
    if (u.includes("/api/payments/return")) {
      setWebviewOpen(false);
      if (u.includes("sc=success")) {
        if (goal_id) {
          api.post(`/savings/goals/${goal_id}/transactions`, { amount: amt, kind: "deposit" }).catch(() => null);
        }
        setFinalStatus("polling");
      } else {
        setFinalStatus("canceled");
        setStage("done");
      }
    }
  };

  // ---- WEBVIEW ----
  if (webviewOpen && stripeInfo) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top", "bottom"]}>
        <View style={styles.webHeader}>
          <TouchableOpacity onPress={() => setWebviewOpen(false)}>
            <Text style={styles.webBack}>← Annuler</Text>
          </TouchableOpacity>
          <View style={styles.webHeaderCenter}>
            <Lock size={12} color={Colors.accent} />
            <Text style={styles.webTitle}>Paiement sécurisé</Text>
          </View>
          <View style={{ width: 60 }} />
        </View>
        <WebView source={{ uri: stripeInfo.checkout_url }} onNavigationStateChange={onNavChange} startInLoadingState />
      </SafeAreaView>
    );
  }

  // ---- DONE ----
  if (stage === "done" && finalStatus) {
    // Navigate to receipt for succeeded Stripe payments
    if (finalStatus === "succeeded" && stripeInfo?.payment_id) {
      router.replace({
        pathname: "/payments/receipt",
        params: { paymentId: stripeInfo.payment_id, type: "deposit" },
      } as any);
      return null;
    }
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.doneWrap}>
          <LinearGradient
            colors={finalStatus === "succeeded" ? ["#065F46", "#059669"] : ["#7F1D1D", "#DC2626"]}
            style={styles.doneHero}
          >
            {finalStatus === "succeeded" ? (
              <CheckCircle2 color="#fff" size={64} />
            ) : finalStatus === "polling" ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <XCircle color="#fff" size={64} />
            )}
            <Text style={styles.doneTitle}>
              {finalStatus === "succeeded" ? "Paiement validé !" :
               finalStatus === "polling" ? "Vérification..." :
               finalStatus === "canceled" ? "Paiement annulé" : "Session expirée"}
            </Text>
            {finalStatus === "succeeded" && (
              <Text style={styles.doneAmt}>{formatXAF(amt)}</Text>
            )}
          </LinearGradient>
          <View style={{ padding: Spacing.xxl, gap: 12 }}>
            {finalStatus === "succeeded" && (
              <Card style={{ alignItems: "center", gap: 4 }}>
                <Text style={{ color: Colors.accent, fontWeight: "800", fontSize: 15 }}>
                  ✓ Contribution enregistrée
                </Text>
                {goal_id && (
                  <Text style={{ color: Colors.accent, fontWeight: "700", fontSize: 13, marginTop: 4 }}>
                    ✓ Votre objectif d'épargne a été crédité
                  </Text>
                )}
              </Card>
            )}
            <Button
              label={goal_id ? "Retour à l'objectif" : "Retour à la tontine"}
              onPress={() => router.back()}
              testID="pay-done"
            />
            {(finalStatus === "canceled" || finalStatus === "expired" || finalStatus === "failed") && (
              <Button
                label="Réessayer"
                variant="outline"
                onPress={() => { setStage("select"); setFinalStatus(null); setMethod(null); }}
                testID="pay-retry"
              />
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ---- SELECT METHOD ----
  if (stage === "select") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>← Retour</Text>
          </TouchableOpacity>

          {/* Payment card — shows cotisation amount, no fee mention */}
          <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={[styles.hero, Shadow.cardDark]}>
            <Text style={styles.heroLabel}>{goal_id ? "DÉPÔT ÉPARGNE" : "COTISATION TONTINE"}</Text>
            {label ? (
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "700", marginBottom: 2 }}>
                {label}
              </Text>
            ) : null}
            <Text style={styles.heroAmt}>{formatXAF(amt)}</Text>
            <View style={styles.heroRow}>
              <Lock size={12} color="rgba(255,255,255,0.6)" />
              <Text style={styles.heroSub}>Montant à payer : {formatXAF(amt)}</Text>
            </View>
          </LinearGradient>

          <Text style={styles.sectionTitle}>Choisissez votre mode de paiement</Text>

          {METHODS.map((m) => (
            <TouchableOpacity
              key={m.key}
              onPress={() => { setMethod(m.key); setStage("form"); setError(null); }}
              activeOpacity={0.8}
              style={[styles.methodCard, method === m.key && { borderColor: m.color }]}
              testID={`pay-method-${m.key}`}
            >
              <View style={[styles.methodIconWrap, { backgroundColor: m.color + "22" }]}>
                <Text style={{ fontSize: 26 }}>{m.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.methodLabel}>{m.label}</Text>
                <Text style={styles.methodSub}>{m.sub}</Text>
              </View>
              <ArrowRight color={Colors.textSubtle} size={18} />
            </TouchableOpacity>
          ))}

          <View style={styles.secureBar}>
            <Lock size={12} color={Colors.accent} />
            <Text style={styles.secureText}>Paiements cryptés · Aucune donnée stockée non chiffrée</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- FORM ----
  if (stage === "form") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100 }}>
          <TouchableOpacity onPress={() => { setStage("select"); setError(null); }}>
            <Text style={styles.back}>← Changer de méthode</Text>
          </TouchableOpacity>

          <View style={[styles.methodBadge, { backgroundColor: selectedMethod?.color }]}>
            <Text style={{ fontSize: 20 }}>{selectedMethod?.icon}</Text>
            <Text style={styles.methodBadgeText}>{selectedMethod?.label}</Text>
          </View>

          {/* Show only the cotisation amount — no fee breakdown */}
          <Text style={styles.amtDisplay}>{formatXAF(amt)}</Text>
          <Text style={styles.amtSub}>Montant à payer : {formatXAF(amt)}</Text>

          {method === "stripe" ? (
            <Card style={{ marginTop: 20, gap: 12 }}>
              <Text style={styles.formTitle}>Paiement par carte bancaire</Text>
              <Text style={styles.formDesc}>
                Vous allez être redirigé vers le formulaire Stripe sécurisé.
                Visa, Mastercard, American Express acceptées.
              </Text>
              <View style={styles.cardBrands}>
                {["VISA", "MC", "AMEX"].map((b) => (
                  <View key={b} style={styles.cardBrand}>
                    <Text style={styles.cardBrandText}>{b}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.infoRow}>
                <Lock size={14} color={Colors.accent} />
                <Text style={styles.infoText}>3-D Secure · PCI DSS · Cryptage 256-bit</Text>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                testID="pay-stripe-start"
                label={`Payer ${formatXAF(amt)} par carte`}
                icon={<CreditCard color="#fff" size={16} />}
                loading={busy}
                onPress={startStripe}
              />
              <Text style={styles.disclaimer}>Mode test : carte 4242 4242 4242 4242 · Date future · CVC 123</Text>
            </Card>
          ) : (
            <Card style={{ marginTop: 20, gap: 12 }}>
              <Text style={styles.formTitle}>Paiement {selectedMethod?.label}</Text>
              <View style={[styles.infoBoxOrange, { borderColor: (selectedMethod?.color ?? "#ccc") + "55", backgroundColor: (selectedMethod?.color ?? "#ccc") + "11" }]}>
                <Text style={[styles.infoBoxTitle, { color: selectedMethod?.dark }]}>Comment ça marche ?</Text>
                <Text style={styles.infoBoxStep}>1. Entrez votre numéro Mobile Money ci-dessous</Text>
                <Text style={styles.infoBoxStep}>2. Vous recevrez une demande de paiement sur votre téléphone</Text>
                <Text style={styles.infoBoxStep}>3. Validez avec votre code PIN sur votre téléphone</Text>
                <Text style={styles.infoBoxStep}>4. Entrez le code de confirmation reçu par SMS</Text>
              </View>

              <Field
                label={`Numéro ${selectedMethod?.label}`}
                placeholder="6X XX XX XX XX"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                testID="pay-mm-phone"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                testID="pay-mm-send"
                label="Envoyer la demande de paiement"
                icon={<Smartphone color="#fff" size={16} />}
                loading={busy}
                onPress={sendMobileMoneyRequest}
              />
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- PROCESSING (mobile money OTP) ----
  if (stage === "processing" && method !== "stripe") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100 }}>
          <Animated.View style={[styles.processingHero, { transform: [{ scale: pulse }] }]}>
            <LinearGradient
              colors={[selectedMethod?.color || Colors.secondary, selectedMethod?.dark || Colors.secondary]}
              style={styles.processingCircle}
            >
              <Smartphone color="#fff" size={44} />
            </LinearGradient>
          </Animated.View>

          <Text style={styles.processingTitle}>Demande envoyée !</Text>
          <Text style={styles.processingDesc}>
            Vérifiez votre téléphone au numéro {phone}.{"\n"}
            Validez la demande avec votre code PIN {selectedMethod?.label}, puis entrez le code de confirmation ci-dessous.
          </Text>

          <View style={styles.countdownWrap}>
            <Text style={[styles.countdown, countdown <= 30 ? { color: Colors.danger } : {}]}>{countdown}s</Text>
            <Text style={styles.countdownLabel}>temps restant</Text>
          </View>

          <Card style={{ gap: 12, marginTop: 8 }}>
            <Field
              label="Code de confirmation SMS"
              placeholder="Ex: 123456"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              testID="pay-mm-otp"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              testID="pay-mm-confirm"
              label="Confirmer le paiement"
              loading={busy}
              onPress={confirmMobileMoney}
              icon={<CheckCircle2 color="#fff" size={16} />}
            />
            <Button
              label="Annuler"
              variant="outline"
              onPress={() => { setStage("select"); setMethod(null); setOtp(""); }}
              testID="pay-mm-cancel"
            />
          </Card>
          <Text style={styles.disclaimer}>Le code expire dans {countdown} secondes. Pas reçu ? Vérifiez votre solde {selectedMethod?.label}.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Stripe processing (webview closed, polling)
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
        <ActivityIndicator color={Colors.secondary} size="large" />
        <Text style={{ color: Colors.text, fontWeight: "700" }}>Vérification du paiement...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  back: { color: Colors.textMuted, fontWeight: "600", marginBottom: 16 },
  hero: { borderRadius: Radius.xxl, padding: 24, gap: 6, marginBottom: 28, alignItems: "center" },
  heroLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  heroAmt: { color: "#fff", fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "600" },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", marginBottom: 14, letterSpacing: -0.3 },
  methodCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: 16, marginBottom: 10,
    borderWidth: 2, borderColor: Colors.border,
    ...Shadow.card,
  } as any,
  methodIconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  methodLabel: { color: Colors.text, fontSize: 15, fontWeight: "800" },
  methodSub: { color: Colors.textMuted, fontSize: 12, fontWeight: "500", marginTop: 2 },
  secureBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, marginTop: 20, padding: 12,
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md,
  },
  secureText: { color: Colors.textMuted, fontSize: 11, fontWeight: "600" },
  methodBadge: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: Radius.xl, marginBottom: 16,
  },
  methodBadgeText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  amtDisplay: { color: Colors.primary, fontSize: 38, fontWeight: "900", letterSpacing: -1, marginBottom: 4 },
  amtSub: { color: Colors.textMuted, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  formTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  formDesc: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  cardBrands: { flexDirection: "row", gap: 8 },
  cardBrand: {
    backgroundColor: Colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 6, borderWidth: 1, borderColor: Colors.border,
  },
  cardBrandText: { color: Colors.text, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoText: { color: Colors.textMuted, fontSize: 12, fontWeight: "600" },
  infoBoxOrange: {
    borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 6,
  },
  infoBoxTitle: { fontWeight: "900", fontSize: 13, marginBottom: 4 },
  infoBoxStep: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", lineHeight: 18 },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: "600" },
  disclaimer: { color: Colors.textSubtle, fontSize: 11, textAlign: "center", marginTop: 10, lineHeight: 16 },
  processingHero: { alignItems: "center", marginVertical: 32 },
  processingCircle: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: "center", justifyContent: "center",
  },
  processingTitle: { color: Colors.text, fontSize: 24, fontWeight: "900", textAlign: "center", marginBottom: 10 },
  processingDesc: { color: Colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 20 },
  countdownWrap: { alignItems: "center", marginBottom: 16 },
  countdown: { color: Colors.secondary, fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  countdownLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: "600" },
  doneWrap: { flex: 1 },
  doneHero: {
    padding: 48, alignItems: "center", gap: 12,
  },
  doneTitle: { color: "#fff", fontSize: 24, fontWeight: "900" },
  doneAmt: { color: "rgba(255,255,255,0.8)", fontSize: 18, fontWeight: "700" },
  webHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: "#fff",
  },
  webBack: { color: Colors.secondary, fontWeight: "700" },
  webHeaderCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  webTitle: { color: Colors.text, fontWeight: "800", fontSize: 14 },
});
