// HODIX Payment — MTN Mobile Money via Paynote
// Flow: initiate → PIN on phone → Paynote webhook/status → credit OR clear failure
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { CheckCircle2, Smartphone, Lock, XCircle } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import type { PaymentKind } from "@/src/payment-nav";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";

type Stage = "form" | "processing" | "success" | "failed";

interface PaynoteInit {
  payment_id: string;
  amount_xaf?: number;
  message?: string;
}

type ConfirmRes = {
  status?: string;
  verified?: boolean;
  user_message?: string;
  operator_reason?: string | null;
};

const MTN = {
  label: "MTN Mobile Money",
  sub: "Crédit immédiat après débit MTN · échec expliqué clairement",
  color: "#FFCC00",
  dark: "#CC9900",
  icon: "🟡",
};

function inferKind(params: Record<string, string | undefined>): PaymentKind {
  if (params.kind) return params.kind as PaymentKind;
  if (params.diaspora_request_id) return "diaspora_sponsor";
  if (params.tontine_id && /prime|enchère|enchere|anticip/i.test(params.label ?? "")) {
    return "auction_premium";
  }
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
    case "diaspora_sponsor": return "COTISATION D'UN PROCHE";
    case "auction_premium": return "PRIME TOUR ANTICIPÉ";
    default: return "DÉPÔT ÉPARGNE";
  }
}

export default function PayContribution() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tontine_id?: string; goal_id?: string; association_id?: string;
    cooperative_id?: string; fund_id?: string; plan_id?: string;
    diaspora_request_id?: string;
    amount: string; label?: string; kind?: PaymentKind;
    cert_kind?: "identity" | "trust-score" | "savings";
    phone?: string;
  }>();
  const {
    tontine_id, goal_id, association_id, cooperative_id, fund_id, plan_id,
    diaspora_request_id, amount, label, cert_kind, phone: paramPhone,
  } = params;
  const paymentKind = inferKind(params);
  const amt = parseFloat(amount || "0");

  const [stage, setStage] = useState<Stage>("form");
  const [phone, setPhone] = useState(paramPhone ?? "");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [operatorReason, setOperatorReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("En attente de votre PIN MTN — aucun débit tant que vous n’avez pas validé");
  const doneRef = useRef(false);

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (stage !== "processing") return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [stage, pulse]);

  const buildInitPayload = () => ({
    kind: paymentKind,
    amount_xaf: amt,
    label,
    provider: "mtn" as const,
    phone,
    ...(tontine_id ? { tontine_id } : {}),
    ...(goal_id ? { goal_id } : {}),
    ...(association_id ? { association_id } : {}),
    ...(cooperative_id ? { cooperative_id } : {}),
    ...(fund_id ? { fund_id } : {}),
    ...(plan_id ? { plan_id } : {}),
    ...(diaspora_request_id ? { diaspora_request_id } : {}),
    ...(cert_kind ? { cert_kind } : {}),
  });

  const goReceipt = (id: string) => {
    if (paymentKind === "certified_report") {
      router.replace({
        pathname: "/certificate-delivery",
        params: { cert_kind: cert_kind ?? "identity", paymentId: id },
      } as any);
    } else {
      router.replace({
        pathname: "/receipt",
        params: { paymentId: id, type: paymentKind },
      } as any);
    }
  };

  const markSuccess = async (id: string, message?: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (paymentKind === "subscription" && plan_id) {
      try {
        const { subscribeToPlan } = await import("@/src/db/subscriptions");
        await subscribeToPlan(plan_id as any, id);
      } catch {
        // Payment already succeeded — user can retry activation from /subscription if needed
      }
    }
    setHint(message ?? "Paiement confirmé — MTN a débité votre compte");
    setStage("success");
    setTimeout(() => goReceipt(id), 900);
  };

  const markFailed = (message: string, reason?: string | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFailMessage(message);
    setOperatorReason(reason?.trim() || null);
    setError(message);
    setStage("failed");
  };

  const tryConfirm = async (id: string): Promise<"success" | "failed" | "pending"> => {
    try {
      const st = await api.get<{
        status: string;
        user_message?: string;
        operator_reason?: string | null;
      }>(`/payments/${id}/status`);
      if (st?.status === "succeeded") {
        await markSuccess(id, st.user_message);
        return "success";
      }
      if (st?.status === "failed") {
        markFailed(
          st.user_message
            ?? "Le paiement MTN a échoué. Aucun crédit n’a été enregistré sur HODIX.",
          st.operator_reason,
        );
        return "failed";
      }
    } catch { /* continue to confirm */ }

    try {
      const res = await api.post<ConfirmRes>("/payments/paynote/confirm", { payment_id: id });
      // Success ONLY if verified + succeeded (operator debit confirmed)
      if (res?.verified === true && res?.status === "succeeded") {
        await markSuccess(id, res.user_message);
        return "success";
      }
      if (res?.status === "failed") {
        markFailed(
          res.user_message
            ?? "Le paiement MTN a échoué. Aucun crédit n’a été enregistré sur HODIX.",
          res.operator_reason,
        );
        return "failed";
      }
      if (res?.user_message) setHint(res.user_message);
      return "pending";
    } catch (e) {
      if (e instanceof ApiError && e.detail) setHint(e.detail);
      return "pending";
    }
  };

  const initiatePayment = async () => {
    if (!phone || phone.replace(/\D/g, "").length < 9) {
      setError("Numéro MTN invalide"); return;
    }
    setError(null); setFailMessage(null); setOperatorReason(null); setBusy(true); doneRef.current = false;
    try {
      const r = await api.post<PaynoteInit>("/payments/mtn/initiate", buildInitPayload());
      setPaymentId(r.payment_id);
      setHint("Demande envoyée à Paynote. MTN doit d’abord débiter — HODIX attend la réponse positive ou la raison d’échec.");
      setStage("processing");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.pending_payment && e.payment_id) {
        setPaymentId(e.payment_id);
        setError(null);
        setHint("Paiement déjà en cours — validez le PIN MTN. Ne relancez pas (anti double débit).");
        setStage("processing");
      } else {
        setError(e instanceof ApiError ? e.detail : "Erreur de paiement MTN");
      }
    } finally { setBusy(false); }
  };

  const confirmPayment = async () => {
    if (!paymentId) { setError("Paiement introuvable"); return; }
    setError(null); setBusy(true);
    setHint("Vérification du débit MTN auprès de Paynote…");
    const outcome = await tryConfirm(paymentId);
    if (outcome === "pending") {
      setError("Pas encore débité. Validez le PIN sur votre téléphone — la confirmation est automatique.");
    }
    setBusy(false);
  };

  useEffect(() => {
    if (stage !== "processing" || !paymentId) return;
    let cancelled = false;
    let ticks = 0;
    const maxTicks = 120; // ~3 min at 1.5s

    const poll = async () => {
      if (cancelled || doneRef.current) return;
      ticks += 1;
      if (ticks === 2) setHint("Attente du PIN MTN… ouvrez la notification USSD / MoMo");
      if (ticks === 8) setHint("Dès validation, Paynote notifie HODIX — crédit immédiat");
      if (ticks === 20) setHint("Toujours en attente — sans PIN, aucun paiement. Solde insuffisant ? Rechargez MTN.");
      if (ticks >= maxTicks) {
        markFailed(
          "Délai dépassé (Expiré). Aucun débit confirmé par MTN — vous pouvez réessayer sans double paiement.",
          "EXPIRED / TIMEOUT — PIN non validé à temps",
        );
        cancelled = true;
        return;
      }
      const outcome = await tryConfirm(paymentId);
      if (outcome !== "pending") cancelled = true;
    };

    // Fast poll so webhook success/failure appears in the app within ~1–2s
    const interval = setInterval(poll, 1500);
    const t1 = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(t1);
    };
  }, [stage, paymentId]);

  if (stage === "success") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl }}>
          <CheckCircle2 color={Colors.success} size={64} />
          <Text style={[styles.processingTitle, { marginTop: 16 }]}>Paiement confirmé</Text>
          <Text style={styles.processingDesc}>
            {hint || "MTN a débité votre compte. Crédit HODIX enregistré."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (stage === "failed") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100, flexGrow: 1, justifyContent: "center" }}>
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <XCircle color={Colors.danger} size={64} />
            <Text style={[styles.processingTitle, { marginTop: 16 }]}>Paiement échoué</Text>
            <Text style={styles.processingDesc}>
              {failMessage
                ?? "Le paiement MTN n’a pas abouti. Aucun crédit n’a été enregistré sur HODIX."}
            </Text>
          </View>
          <Card style={{ gap: 12 }}>
            {operatorReason ? (
              <View style={styles.operatorBox}>
                <Text style={styles.operatorLabel}>Raison exacte de l’opérateur</Text>
                <Text style={styles.operatorText}>{operatorReason}</Text>
              </View>
            ) : (
              <Text style={styles.failHint}>
                Aucun crédit HODIX sans débit MTN. Réessayez après avoir vérifié solde et PIN.
              </Text>
            )}
            <Button
              testID="pay-mm-retry"
              label="Réessayer le paiement"
              onPress={() => {
                doneRef.current = false;
                setPaymentId(null);
                setFailMessage(null);
                setOperatorReason(null);
                setError(null);
                setStage("form");
              }}
              icon={<Smartphone color="#fff" size={16} />}
            />
            <Button label="Retour" variant="ghost" onPress={() => router.back()} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (stage === "processing") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100 }}>
          <Animated.View style={[styles.processingHero, { transform: [{ scale: pulse }] }]}>
            <LinearGradient colors={[MTN.color, MTN.dark]} style={styles.processingCircle}>
              <Smartphone color="#fff" size={44} />
            </LinearGradient>
          </Animated.View>

          <Text style={styles.processingTitle}>Validez sur MTN MoMo</Text>
          <Text style={styles.processingDesc}>
            {`Notification envoyée sur ${phone}. Paynote doit d’abord faire débiter MTN, puis renvoyer succès ou la raison exacte d’échec.`}
          </Text>

          <Card style={{ gap: 12, marginTop: 8, alignItems: "center" }}>
            <ActivityIndicator color={MTN.color} size="large" />
            <Text style={{ color: Colors.textMuted, textAlign: "center", fontWeight: "700" }}>
              {hint}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              testID="pay-mm-confirm"
              label="J'ai validé mon PIN"
              loading={busy}
              onPress={confirmPayment}
              icon={<CheckCircle2 color="#fff" size={16} />}
            />
            <Button
              label="Retour"
              variant="ghost"
              onPress={() => { setStage("form"); setPaymentId(null); setError(null); doneRef.current = false; }}
              testID="pay-mm-cancel"
            />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100 }}>
        <TouchableOpacity onPress={() => router.back()} style={styles.touchBack}>
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>

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
            <Text style={styles.heroSub}>MTN MoMo · réponse immédiate après débit</Text>
          </View>
        </LinearGradient>

        <View style={[styles.methodBadge, { backgroundColor: MTN.color }]}>
          <Text style={{ fontSize: 20 }}>{MTN.icon}</Text>
          <Text style={styles.methodBadgeText}>{MTN.label}</Text>
        </View>
        <Text style={styles.amtSub}>{MTN.sub}</Text>

        <Card style={{ marginTop: 20, gap: 12 }}>
          <Text style={styles.formTitle}>Payer avec MTN Mobile Money</Text>
          <View style={[styles.infoBox, { borderColor: MTN.color + "55", backgroundColor: MTN.color + "11" }]}>
            <Text style={[styles.infoBoxTitle, { color: MTN.dark }]}>Comment ça marche</Text>
            <Text style={styles.infoBoxStep}>1. Entrez votre numéro MTN</Text>
            <Text style={styles.infoBoxStep}>2. Validez le PIN sur votre téléphone</Text>
            <Text style={styles.infoBoxStep}>3. Paynote débite d’abord via MTN, puis répond : succès → crédit, ou échec → raison exacte opérateur</Text>
          </View>

          <Field
            label="Numéro MTN Mobile Money"
            placeholder="6X XX XX XX XX"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            testID="pay-mm-phone"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            testID="pay-mm-send"
            label={`Payer ${formatXAF(amt)} via MTN`}
            icon={<Smartphone color="#fff" size={16} />}
            loading={busy}
            onPress={initiatePayment}
          />
        </Card>

        <View style={styles.secureBar}>
          <Lock size={12} color={Colors.accent} />
          <Text style={styles.secureText}>Paynote → HODIX en direct · solde insuffisant = message explicite</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  back: { color: Colors.textMuted, fontWeight: "600" },
  touchBack: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingRight: 12, marginBottom: 8 },
  hero: { borderRadius: Radius.xxl, padding: 24, gap: 6, marginBottom: 20, alignItems: "center" },
  heroLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  heroAmt: { color: "#fff", fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "600" },
  methodBadge: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radius.xl, marginBottom: 8, alignSelf: "flex-start",
  },
  methodBadgeText: { color: "#1a1a1a", fontWeight: "900", fontSize: 16 },
  amtSub: { color: Colors.textMuted, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  formTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  infoBox: { borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 6 },
  infoBoxTitle: { fontWeight: "900", fontSize: 13, marginBottom: 4 },
  infoBoxStep: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", lineHeight: 18 },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: "600" },
  failHint: { color: Colors.textMuted, fontSize: 13, fontWeight: "600", lineHeight: 20, textAlign: "center" },
  operatorBox: {
    borderWidth: 1, borderColor: Colors.danger + "55", backgroundColor: "#FEF2F2",
    borderRadius: Radius.lg, padding: 14, gap: 6,
  },
  operatorLabel: { color: Colors.danger, fontSize: 11, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
  operatorText: { color: Colors.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  secureBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, marginTop: 20, padding: 12, backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md,
  },
  secureText: { color: Colors.textMuted, fontSize: 11, fontWeight: "600" },
  processingHero: { alignItems: "center", marginVertical: 32 },
  processingCircle: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center" },
  processingTitle: { color: Colors.text, fontSize: 24, fontWeight: "900", textAlign: "center", marginBottom: 10 },
  processingDesc: { color: Colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 20 },
});
