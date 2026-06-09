import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, CheckCircle2, Shield } from "lucide-react-native";

import { api } from "@/src/api";
import { Button, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { formatAmount, type Currency } from "@/src/exchange-rates";
import type { WalletBalance, MobileMoneyProvider } from "@/src/wallet-db";
import { PinConfirmModal } from "@/src/pin-modal";
import { OtpModal } from "@/src/otp-modal";

const PROVIDERS: MobileMoneyProvider[] = ["MTN MoMo", "Orange Money", "Moov Money", "Wave"];
const CURRENCIES: Currency[] = ["XAF", "EUR", "USD"];

export default function WithdrawScreen() {
  const router = useRouter();
  const [wallet, setWallet]       = useState<WalletBalance | null>(null);
  const [amount, setAmount]       = useState("");
  const [currency, setCurrency]   = useState<Currency>("XAF");
  const [provider, setProvider]   = useState<MobileMoneyProvider>("MTN MoMo");
  const [phone, setPhone]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);
  const [showPin, setShowPin]     = useState(false);
  const [showOtp, setShowOtp]     = useState(false);
  const [pendingOtp, setPendingOtp] = useState(false);
  const [amountXaf, setAmountXaf] = useState(0);
  const [userId, setUserId]       = useState("");

  useEffect(() => {
    api.get<WalletBalance>("/wallet").then(setWallet).catch(() => {});
    api.get<{ id: string }>("/users/me").then(me => setUserId(me.id)).catch(() => {});
  }, []);

  const maxBal = wallet
    ? currency === "XAF" ? wallet.balance_xaf
    : currency === "EUR" ? wallet.balance_eur
    : wallet.balance_usd
    : 0;

  const doWithdraw = async () => {
    const amt = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    setLoading(true);
    try {
      await api.post("/wallet/withdraw", { amount: amt, currency, provider, phone: phone.trim() });
      setSuccess(true);
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? "Erreur lors du retrait.");
    } finally { setLoading(false); }
  };

  const submit = async () => {
    setError(null);
    const amt = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    if (!amt || amt <= 0) { setError("Entrez un montant valide."); return; }
    if (amt > maxBal) { setError(`Solde insuffisant (max ${formatAmount(maxBal, currency)}).`); return; }
    if (!phone.trim()) { setError("Entrez votre numéro Mobile Money."); return; }
    setLoading(true);
    try {
      const check = await api.post<{ allowed: boolean; reason?: string; requires_pin: boolean; requires_otp: boolean; risk: string }>(
        "/wallet/check-tx",
        { amount_xaf: amt }
      );
      if (!check.allowed) {
        setError(check.reason ?? "Transaction non autorisée.");
        return;
      }
      setAmountXaf(amt);
      if (check.requires_pin) {
        setPendingOtp(check.requires_otp);
        setShowPin(true);
      } else if (check.requires_otp) {
        setShowOtp(true);
      } else {
        await doWithdraw();
      }
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? "Erreur lors du retrait.");
    } finally { setLoading(false); }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.successBox}>
          <CheckCircle2 size={64} color="#10B981" />
          <Text style={styles.successTitle}>Retrait initié !</Text>
          <Text style={styles.successSub}>Les fonds seront envoyés sur votre {provider} sous quelques minutes.</Text>
          <Button label="Retour au wallet" onPress={() => router.replace("/wallet")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* ── Security modals ── */}
      <PinConfirmModal
        visible={showPin}
        userId={userId}
        amount={amountXaf}
        onSuccess={() => {
          setShowPin(false);
          if (pendingOtp) { setShowOtp(true); }
          else { doWithdraw(); }
        }}
        onCancel={() => { setShowPin(false); setLoading(false); }}
      />
      <OtpModal
        visible={showOtp}
        amountXaf={amountXaf}
        onSuccess={() => { setShowOtp(false); doWithdraw(); }}
        onCancel={() => { setShowOtp(false); setLoading(false); }}
      />

      <LinearGradient colors={["#0B1F3A", "#EF4444"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ChevronLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Retirer vers Mobile Money</Text>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* Balance info */}
        {wallet && (
          <View style={styles.balInfo}>
            <Text style={styles.balLabel}>Solde disponible</Text>
            <Text style={styles.balValue}>{formatAmount(maxBal, currency)}</Text>
          </View>
        )}

        {/* Currency */}
        <Text style={styles.label}>Devise à retirer</Text>
        <View style={styles.chipRow}>
          {CURRENCIES.map(c => (
            <TouchableOpacity key={c} onPress={() => setCurrency(c)}
              style={[styles.chip, currency === c && styles.chipActive]}>
              <Text style={[styles.chipText, currency === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.amountRow}>
          <View style={{ flex: 1 }}>
            <Field label="Montant" value={amount} onChangeText={setAmount}
              keyboardType="decimal-pad" placeholder="0" />
          </View>
          <TouchableOpacity style={styles.maxBtn} onPress={() => setAmount(String(maxBal))}>
            <Text style={styles.maxBtnText}>MAX</Text>
          </TouchableOpacity>
        </View>

        {/* Provider */}
        <Text style={styles.label}>Opérateur Mobile Money</Text>
        <View style={styles.providerGrid}>
          {PROVIDERS.map(p => (
            <TouchableOpacity key={p} onPress={() => setProvider(p)}
              style={[styles.providerChip, provider === p && styles.chipActive]}>
              <Text style={[styles.chipText, provider === p && styles.chipTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Numéro de téléphone" value={phone} onChangeText={setPhone}
          keyboardType="phone-pad" placeholder="+237 6XX XXX XXX" />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={{ height: 8 }} />
        <Button label={`Retirer ${amount ? formatAmount(parseFloat(amount) || 0, currency) : ""}`}
          onPress={submit} loading={loading} variant="danger" />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: Spacing.xl, paddingBottom: 20 },
  back: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#fff" },
  body: { padding: Spacing.xl, gap: 4, paddingBottom: 100 },
  balInfo: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.xl,
    padding: Spacing.lg, marginBottom: 16, flexDirection: "row",
    justifyContent: "space-between", alignItems: "center",
  },
  balLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: "600" },
  balValue: { fontSize: 18, fontWeight: "800", color: Colors.text },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text, marginBottom: 8, marginTop: 8 },
  chipRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  amountRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  maxBtn: {
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: Radius.lg,
    backgroundColor: Colors.danger + "20", marginBottom: 16,
  },
  maxBtnText: { fontSize: 12, fontWeight: "800", color: Colors.danger },
  providerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  chip: {
    paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
  },
  providerChip: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border,
  },
  chipActive: { borderColor: "#EF4444", backgroundColor: "#EF444415" },
  chipText: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  chipTextActive: { color: "#EF4444" },
  error: { fontSize: 13, color: Colors.danger, marginTop: 4 },
  successBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xxxl, gap: 16 },
  successTitle: { fontSize: 24, fontWeight: "800", color: Colors.text },
  successSub: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 20 },
});
