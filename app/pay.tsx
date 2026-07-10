// HODIX Payment — MTN Mobile Money via Paynote (instant confirm)
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { CheckCircle2, Smartphone, Lock } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import type { PaymentKind } from "@/src/payment-nav";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";

type Stage = "form" | "processing" | "success";

interface PaynoteInit {
  payment_id: string;
  amount_xaf?: number;
  message?: string;
}

const MTN = {
  label: "MTN Mobile Money",
  sub: "Confirmation instantanée via Paynote",
  color: "#FFCC00",
  dark: "#CC9900",
  icon: "🟡",
};

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
    phone?: string;
  }>();
  const { tontine_id, goal_id, association_id, cooperative_id, fund_id, amount, label, cert_kind, phone: paramPhone } = params;
  const paymentKind = inferKind(params);
  const amt = parseFloat(amount || "0");

  const [stage, setStage] = useState<Stage>("form");
  const [phone, setPhone] = useState(paramPhone ?? "");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("En attente de votre validation PIN…");
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

  const markSuccess = (id: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setStage("success");
    setHint("Paiement confirmé — crédit instantané");
    setTimeout(() => goReceipt(id), 900);
  };

  const tryConfirm = async (id: string): Promise<boolean> => {
    try {
      // Fast path: webhook may already have credited
      const st = await api.get<{ status: string }>(`/payments/${id}/status`);
      if (st?.status === "succeeded") {
        markSuccess(id);
        return true;
      }
    } catch { /* continue */ }

    try {
      await api.post("/payments/paynote/confirm", { payment_id: id });
      markSuccess(id);
      return true;
    } catch {
      return false;
    }
  };

  const initiatePayment = async () => {
    if (!phone || phone.replace(/\D/g, "").length < 9) {
      setError("Numéro MTN invalide"); return;
    }
    setError(null); setBusy(true); doneRef.current = false;
    try {
      const r = await api.post<PaynoteInit>("/payments/mtn/initiate", buildInitPayload());
      setPaymentId(r.payment_id);
      setHint("Demande USSD envoyée — validez avec votre PIN");
      setStage("processing");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur de paiement MTN");
    } finally { setBusy(false); }
  };

  const confirmPayment = async () => {
    if (!paymentId) { setError("Paiement introuvable"); return; }
    setError(null); setBusy(true);
    setHint("Vérification Paynote…");
    const ok = await tryConfirm(paymentId);
    if (!ok) {
      setError("Pas encore confirmé. Validez le PIN sur votre téléphone — on réessaie automatiquement.");
    }
    setBusy(false);
  };

  useEffect(() => {
    if (stage !== "processing" || !paymentId) return;
    let cancelled = false;
    let ticks = 0;

    const poll = async () => {
      if (cancelled || doneRef.current) return;
      ticks += 1;
      if (ticks === 3) setHint("Toujours en attente du PIN MTN…");
      if (ticks === 8) setHint("Dès validation, le crédit est instantané");
      const ok = await tryConfirm(paymentId);
      if (ok) cancelled = true;
    };

    const interval = setInterval(poll, 2000);
    // First check quickly after USSD prompt
    const t1 = setTimeout(poll, 1500);
    const t2 = setTimeout(poll, 3500);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [stage, paymentId]);

  if (stage === "success") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl }}>
          <CheckCircle2 color={Colors.success} size={64} />
          <Text style={[styles.processingTitle, { marginTop: 16 }]}>Paiement confirmé</Text>
          <Text style={styles.processingDesc}>Crédit enregistré instantanément.</Text>
        </View>
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
            {`Demande envoyée sur ${phone}. Entrez votre code PIN — HODIX crédite dès confirmation Paynote.`}
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
            <Text style={styles.heroSub}>MTN MoMo · crédit instantané</Text>
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
            <Text style={[styles.infoBoxTitle, { color: MTN.dark }]}>En 3 étapes</Text>
            <Text style={styles.infoBoxStep}>1. Entrez votre numéro MTN</Text>
            <Text style={styles.infoBoxStep}>2. Validez le PIN sur votre téléphone</Text>
            <Text style={styles.infoBoxStep}>3. Le crédit apparaît immédiatement dans HODIX</Text>
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
          <Text style={styles.secureText}>Paiement sécurisé Paynote · confirmation automatique</Text>
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
