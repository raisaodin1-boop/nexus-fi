import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft } from "lucide-react-native";

import { openPaymentScreen } from "@/src/payment-nav";
import { useDisplayCurrency } from "@/src/hooks/use-display-currency";
import { Button, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import type { MobileMoneyProvider } from "@/src/wallet-db";
import { getRates, convert, formatAmount, type Currency, type Rates } from "@/src/exchange-rates";

const PROVIDERS: MobileMoneyProvider[] = ["MTN MoMo", "Orange Money", "Moov Money", "Wave"];
const CURRENCIES: Currency[] = ["XAF", "EUR", "USD"];

export default function TopupScreen() {
  const router = useRouter();
  const { currency, setCurrency } = useDisplayCurrency();
  const [amount, setAmount]       = useState("");
  const [provider, setProvider]   = useState<MobileMoneyProvider>("MTN MoMo");
  const [phone, setPhone]         = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [rates, setRates]         = useState<Rates | null>(null);

  useEffect(() => { getRates().then(setRates).catch(() => {}); }, []);

  const parsedAmt = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
  const amountXAF = rates && currency !== "XAF" && parsedAmt > 0
    ? Math.round(convert(parsedAmt, currency, "XAF", rates))
    : null;

  const submit = () => {
    setError(null);
    const amt = parsedAmt;
    if (!amt || amt <= 0) { setError("Entrez un montant valide."); return; }
    // Always send XAF to CinetPay — convert if needed
    const amtXaf = rates && currency !== "XAF" ? Math.round(convert(amt, currency, "XAF", rates)) : amt;
    openPaymentScreen(router, {
      kind: "wallet_topup",
      amount: amtXaf,
      label: `Recharge wallet ${provider}${currency !== "XAF" ? ` (${formatAmount(amt, currency)} → ${formatAmount(amtXaf, "XAF")})` : ""}`,
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={["#0B1F3A", "#10B981"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ChevronLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recharger le wallet</Text>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* Currency */}
        <Text style={styles.label}>Devise</Text>
        <View style={styles.chipRow}>
          {CURRENCIES.map(c => (
            <TouchableOpacity key={c} onPress={() => setCurrency(c)}
              style={[styles.chip, currency === c && styles.chipActive]}>
              <Text style={[styles.chipText, currency === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Montant" value={amount} onChangeText={setAmount}
          keyboardType="decimal-pad" placeholder={currency === "XAF" ? "ex: 25000" : "ex: 50"} />
        {amountXAF !== null && (
          <Text style={styles.conversion}>
            ≈ {new Intl.NumberFormat("fr-FR").format(amountXAF)} FCFA débités via CinetPay
          </Text>
        )}

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
        <Button label="Continuer vers le paiement" onPress={submit} />

        <Text style={styles.note}>
          Paiement électronique CinetPay requis. Après confirmation, votre wallet sera crédité et un reçu s'affichera avec le statut « Confirmé » ou « En attente ».
        </Text>
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
  label: { fontSize: 13, fontWeight: "600", color: Colors.text, marginBottom: 8, marginTop: 8 },
  chipRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  providerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  chip: {
    paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
  },
  providerChip: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border,
  },
  chipActive: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + "15" },
  chipText: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  chipTextActive: { color: Colors.secondary },
  error: { fontSize: 13, color: Colors.danger, marginTop: 4 },
  note: { fontSize: 12, color: Colors.textMuted, textAlign: "center", lineHeight: 18, marginTop: 12 },
  conversion: { fontSize: 12, color: Colors.secondary, fontWeight: "600", marginTop: -8, marginBottom: 8 },
  successBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xxxl, gap: 16 },
  successTitle: { fontSize: 24, fontWeight: "800", color: Colors.text },
  successSub: { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
});
