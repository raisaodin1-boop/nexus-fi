// HODIX Payment — CinetPay (Orange / MTN / Moov / Carte)
// Règle: aucun crédit dans l'app tant que CinetPay n'a pas confirmé le débit.
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
import { paynoteMtnEnabled } from "@/src/db/paynote-mtn";
import { paymentReturnRoute, type PaymentKind } from "@/src/payment-nav";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";

type Method = "card" | "orange" | "mtn" | "moov";
type Stage = "select" | "form" | "processing" | "done";
type Status = "succeeded" | "failed" | "expired" | "canceled" | "polling";

interface CinetpayInit {
  payment_id: string;
  payment_url?: string | null;
  sandbox_mode?: boolean;
  amount_xaf?: number;
  gateway?: "cinetpay" | "paynote";
  message?: string;
}

const MTN_PAYNOTE = paynoteMtnEnabled();

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
    sub: MTN_PAYNOTE ? "MTN MoMo via Paynote (direct)" : "Paiement mobile instantané",
    color: "#FFCC00",
    dark: "#CC9900",
    icon: "🟡",
  },
  {
    key: "moov" as Method,
    label: "Moov Money",
    sub: "Paiement mobile instantané",
    color: "#2563EB",
    dark: "#1D4ED8",
    icon: "🔵",
  },
  {
    key: "card" as Method,
    label: "Carte bancaire",
    sub: "Visa, Mastercard via CinetPay",
    color: Colors.secondary,
    dark: "#1E40AF",
    icon: "💳",
  },
];

function inferKind(params: Record<string, string | undefined>): PaymentKind {
  if (params.kind) return params.kind as PaymentKind;
  if (params.tontine_id) return "tontine_contribution";
  if (params.goal_id) return "savings_deposit";
  if (params.association_id) return "association_contribution";
  if (params.cooperative_id) return "cooperative_contribution";
  if (params.fund_id) return "fund_contribution";
  return "savings_deposit";
}

function paymentTitle(kind: PaymentKind) {
  switch (kind) {
    case "tontine_contribution": return "COTISATION TONTINE";
    case "association_contribution": return "COTISATION ASSOCIATION";
    case "cooperative_contribution": return "COTISATION COOPÉRATIVE";
    case "fund_contribution": return "CONTRIBUTION FONDS";
    case "wallet_topup": return "RECHARGE WALLET";
    case "certified_report": return "CERTIFICAT AUTHENTIFIÉ";
    default: return "DÉPÔT ÉPARGNE";
  }
}

export default function PayContribution() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tontine_id?: string; goal_id?: string; association_id?: string;
    cooperative_id?: string; fund_id?: string; amount: string; label?: string; kind?: PaymentKind;
    cert_kind?: "identity" | "trust-score" | "savings";
    provider?: string; phone?: string;
  }>();
  const { tontine_id, goal_id, association_id, cooperative_id, fund_id, amount, label, cert_kind, provider: paramProvider, phone: paramPhone } = params;
  const paymentKind = inferKind(params);
  const amt = parseFloat(amount || "0");
  const returnRoute = paymentReturnRoute({
    amount: amt, kind: paymentKind, cert_kind, tontine_id, goal_id, association_id, cooperative_id, fund_id, label,
  });

  const [method, setMethod] = useState<Method | null>(
    paramProvider === "mtn" ? "mtn" : null,
  );
  const [stage, setStage] = useState<Stage>(
    paramProvider === "mtn" && paramPhone ? "form" : "select",
  );
  const [phone, setPhone] = useState(paramPhone ?? "");
  const [otp, setOtp] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [sandboxMode, setSandboxMode] = useState(false);
  const [gateway, setGateway] = useState<"cinetpay" | "paynote" | null>(null);
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
    if (stage !== "processing" || method === "card") return;
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, stage, method]);

  // Auto-poll CinetPay status (webhook confirms in background)
  useEffect(() => {
    if (stage !== "processing" || !paymentId || sandboxMode || gateway === "paynote") return;

    let cancelled = false;
    const poll = async () => {
      try {
        const status = await api.get<{ status: string }>(`/payments/${paymentId}/status`);
        if (cancelled) return;
        if (status.status === "succeeded") {
          setFinalStatus("succeeded");
          setStage("done");
        }
      } catch { /* ignore */ }
    };

    poll();
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [stage, paymentId, sandboxMode, gateway]);

  // Navigate when webhook/poll confirms payment
  useEffect(() => {
    if (stage !== "done" || finalStatus !== "succeeded" || !paymentId) return;
    if (paymentKind === "certified_report") {
      router.replace({
        pathname: "/certificate-delivery",
        params: { cert_kind: cert_kind ?? "identity", paymentId },
      } as any);
    } else {
      router.replace({
        pathname: "/receipt",
        params: { paymentId, type: paymentKind },
      } as any);
    }
  }, [stage, finalStatus, paymentId, paymentKind, cert_kind, router]);

  // Auto-poll Paynote MTN after USSD push
  useEffect(() => {
    if (stage !== "processing" || method !== "mtn" || gateway !== "paynote" || !paymentId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        await api.post("/payments/paynote/confirm", { payment_id: paymentId });
        if (cancelled) return;
        if (paymentKind === "certified_report") {
          router.replace({
            pathname: "/certificate-delivery",
            params: { cert_kind: cert_kind ?? "identity", paymentId },
          } as any);
        } else {
          router.replace({
            pathname: "/receipt",
            params: { paymentId, type: paymentKind },
          } as any);
        }
      } catch {
        /* still pending on phone */
      }
    };
    const interval = setInterval(poll, 4000);
    poll();
    return () => { cancelled = true; clearInterval(interval); };
  }, [stage, method, gateway, paymentId, paymentKind, cert_kind, router]);

  const selectedMethod = METHODS.find((m) => m.key === method);

  const buildInitPayload = () => ({
    kind: paymentKind,
    amount_xaf: amt,
    label,
    provider: method,
    phone: method === "card" ? undefined : phone,
    ...(tontine_id ? { tontine_id } : {}),
    ...(goal_id ? { goal_id } : {}),
    ...(association_id ? { association_id } : {}),
    ...(cooperative_id ? { cooperative_id } : {}),
    ...(fund_id ? { fund_id } : {}),
    ...(cert_kind ? { cert_kind } : {}),
  });

  const initiatePayment = async () => {
    if (method !== "card" && (!phone || phone.length < 9)) {
      setError("Numéro invalide"); return;
    }
    setError(null); setBusy(true);
    try {
      const r = await api.post<CinetpayInit>("/payments/cinetpay/initiate", buildInitPayload());
      setPaymentId(r.payment_id);
      setSandboxMode(!!r.sandbox_mode);
      setGateway(r.gateway ?? "cinetpay");
      if (r.payment_url) {
        setCheckoutUrl(r.payment_url);
        setStage("processing");
        if (Platform.OS === "web") window.open(r.payment_url, "_blank");
        else setWebviewOpen(true);
      } else {
        setStage("processing");
        setCountdown(120);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur de paiement");
    } finally { setBusy(false); }
  };

  const confirmPayment = async () => {
    if (!paymentId) { setError("Paiement introuvable"); return; }
    if (gateway === "paynote") {
      setError(null); setBusy(true);
      try {
        await api.post("/payments/paynote/confirm", { payment_id: paymentId });
        if (paymentKind === "certified_report") {
          router.replace({
            pathname: "/certificate-delivery",
            params: { cert_kind: cert_kind ?? "identity", paymentId },
          } as any);
        } else {
          router.replace({
            pathname: "/receipt",
            params: { paymentId, type: paymentKind },
          } as any);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.detail : "Paiement MTN MoMo non confirmé — aucun crédit appliqué.");
      } finally { setBusy(false); }
      return;
    }
    if (!otp || otp.length < 4) { setError("Référence de transaction invalide"); return; }
    setError(null); setBusy(true);
    try {
      await api.post("/payments/cinetpay/confirm", {
        payment_id: paymentId,
        transaction_id: otp,
        provider: method,
        phone,
      });
      if (paymentKind === "certified_report") {
        router.replace({
          pathname: "/certificate-delivery",
          params: { cert_kind: cert_kind ?? "identity", paymentId },
        } as any);
      } else {
        router.replace({
          pathname: "/receipt",
          params: { paymentId, type: paymentKind },
        } as any);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Paiement non confirmé — aucun crédit appliqué.");
    } finally { setBusy(false); }
  };

  const onNavChange = (navState: { url: string }) => {
    const u = navState.url || "";
    if (u.includes("cinetpay") || u.includes("return") || u.includes("success")) {
      setWebviewOpen(false);
      setStage("processing");
      setCountdown(120);
    }
  };

  // ---- WEBVIEW ----
  if (webviewOpen && checkoutUrl) {
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
        <WebView source={{ uri: checkoutUrl }} onNavigationStateChange={onNavChange} startInLoadingState />
      </SafeAreaView>
    );
  }

  // ---- DONE ----
  if (stage === "done" && finalStatus) {
    if (finalStatus === "succeeded" && paymentId) {
      if (paymentKind === "certified_report") {
        router.replace({
          pathname: "/certificate-delivery",
          params: { cert_kind: cert_kind ?? "identity", paymentId },
        } as any);
      } else {
        router.replace({
          pathname: "/receipt",
          params: { paymentId, type: paymentKind },
        } as any);
      }
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
              label={goal_id ? "Retour à l'objectif" : tontine_id ? "Retour à la tontine" : "Retour"}
              onPress={() => {
                if (tontine_id) router.replace(`/tontines/${tontine_id}` as any);
                else router.back();
              }}
              testID="pay-done"
            />
            {(finalStatus === "canceled" || finalStatus === "expired" || finalStatus === "failed") && (
              <Button
                label="Réessayer"
                variant="ghost"
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
          <TouchableOpacity onPress={() => router.back()} style={styles.touchBack}>
            <Text style={styles.back}>← Retour</Text>
          </TouchableOpacity>

          {/* Payment card — shows cotisation amount, no fee mention */}
          <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={[styles.hero, Shadow.cardDark]}>
            <Text style={styles.heroLabel}>{paymentTitle(paymentKind)}</Text>
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
          <TouchableOpacity onPress={() => { setStage("select"); setError(null); }} style={styles.touchBack}>
            <Text style={styles.back}>← Changer de méthode</Text>
          </TouchableOpacity>

          <View style={[styles.methodBadge, { backgroundColor: selectedMethod?.color }]}>
            <Text style={{ fontSize: 20 }}>{selectedMethod?.icon}</Text>
            <Text style={styles.methodBadgeText}>{selectedMethod?.label}</Text>
          </View>

          {/* Show only the cotisation amount — no fee breakdown */}
          <Text style={styles.amtDisplay}>{formatXAF(amt)}</Text>
          <Text style={styles.amtSub}>Montant à payer : {formatXAF(amt)}</Text>

          {method === "card" ? (
            <Card style={{ marginTop: 20, gap: 12 }}>
              <Text style={styles.formTitle}>Paiement par carte bancaire (CinetPay)</Text>
              <Text style={styles.formDesc}>
                Vous serez redirigé vers CinetPay. L'opération ne sera créditée qu'après confirmation du débit.
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                testID="pay-card-start"
                label={`Payer ${formatXAF(amt)} par carte`}
                icon={<CreditCard color="#fff" size={16} />}
                loading={busy}
                onPress={initiatePayment}
              />
            </Card>
          ) : (
            <Card style={{ marginTop: 20, gap: 12 }}>
              <Text style={styles.formTitle}>Paiement {selectedMethod?.label}{method === "mtn" && MTN_PAYNOTE ? " (Paynote)" : ""}</Text>
              <View style={[styles.infoBoxOrange, { borderColor: (selectedMethod?.color ?? "#ccc") + "55", backgroundColor: (selectedMethod?.color ?? "#ccc") + "11" }]}>
                <Text style={[styles.infoBoxTitle, { color: selectedMethod?.dark }]}>Comment ça marche ?</Text>
                <Text style={styles.infoBoxStep}>1. Entrez votre numéro Mobile Money ci-dessous</Text>
                <Text style={styles.infoBoxStep}>2. Vous recevrez une demande de paiement sur votre téléphone</Text>
                <Text style={styles.infoBoxStep}>3. Validez avec votre code PIN sur votre téléphone</Text>
                {method === "mtn" && MTN_PAYNOTE ? (
                  <Text style={styles.infoBoxStep}>4. HODIX confirme automatiquement via Paynote</Text>
                ) : (
                  <Text style={styles.infoBoxStep}>4. Entrez le code de confirmation reçu par SMS</Text>
                )}
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
                onPress={initiatePayment}
              />
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- PROCESSING (mobile money OTP) ----
  if (stage === "processing" && method !== "card") {
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

          <Text style={styles.processingTitle}>Paiement en attente</Text>
          <Text style={styles.processingDesc}>
            {gateway === "paynote"
              ? `Une demande de paiement a été envoyée sur votre téléphone MTN (${phone}). Validez avec votre code PIN — nous vérifions automatiquement.`
              : sandboxMode
                ? "Mode test CinetPay : entrez la référence de transaction reçue après paiement."
                : `Validez le paiement ${selectedMethod?.label} sur votre téléphone (${phone}). La confirmation est automatique — vous pouvez aussi entrer la référence manuellement.`}
            {"\n"}Aucun crédit ne sera appliqué sans confirmation.
          </Text>

          {gateway === "paynote" ? (
            <Card style={{ gap: 12, marginTop: 8, alignItems: "center" }}>
              <ActivityIndicator color={selectedMethod?.color ?? Colors.secondary} size="large" />
              <Text style={{ color: Colors.textMuted, textAlign: "center", fontWeight: "600" }}>
                En attente de validation sur votre téléphone MTN MoMo
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                testID="pay-mm-confirm"
                label="J'ai validé sur mon téléphone"
                loading={busy}
                onPress={confirmPayment}
                icon={<CheckCircle2 color="#fff" size={16} />}
              />
              <Button
                label="Annuler"
                variant="ghost"
                onPress={() => { setStage("select"); setMethod(null); setGateway(null); }}
                testID="pay-mm-cancel"
              />
            </Card>
          ) : (
          <Card style={{ gap: 12, marginTop: 8 }}>
            <Field
              label="Référence transaction CinetPay"
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
              onPress={confirmPayment}
              icon={<CheckCircle2 color="#fff" size={16} />}
            />
            <Button
              label="Annuler"
              variant="ghost"
              onPress={() => { setStage("select"); setMethod(null); setOtp(""); }}
              testID="pay-mm-cancel"
            />
          </Card>
          )}
          <Text style={styles.disclaimer}>Le code expire dans {countdown} secondes. Pas reçu ? Vérifiez votre solde {selectedMethod?.label}.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Card processing (webview closed) — enter CinetPay reference
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100 }}>
        <Text style={styles.processingTitle}>Finaliser le paiement carte</Text>
        <Text style={styles.processingDesc}>
          Après paiement sur CinetPay, entrez la référence de transaction pour valider l'opération.
        </Text>
        <Card style={{ gap: 12, marginTop: 12 }}>
          <Field
            label="Référence transaction CinetPay"
            placeholder="Ex: CP-123456"
            value={otp}
            onChangeText={setOtp}
            testID="pay-card-ref"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Confirmer le paiement" loading={busy} onPress={confirmPayment} testID="pay-card-confirm" />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  back: { color: Colors.textMuted, fontWeight: "600" },
  touchBack: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingRight: 12, marginBottom: 8 },
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
