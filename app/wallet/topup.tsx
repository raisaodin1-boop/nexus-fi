import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, CheckCircle2 } from "lucide-react-native";

import { api } from "@/src/api";
import { Button, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import type { MobileMoneyProvider } from "@/src/wallet-db";
import type { Currency } from "@/src/exchange-rates";

const PROVIDERS: MobileMoneyProvider[] = ["MTN MoMo", "Orange Money", "Moov Money", "Wave"];
const CURRENCIES: Currency[] = ["XAF", "EUR", "USD"];

export default function TopupScreen() {
  const router = useRouter();
  const [amount, setAmount]       = useState("");
  const [currency, setCurrency]   = useState<Currency>("XAF");
  const [provider, setProvider]   = useState<MobileMoneyProvider>("MTN MoMo");
  const [phone, setPhone]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  const submit = async () => {
    setError(null);
    const amt = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    if (!amt || amt <= 0) { setError("Entrez un montant valide."); return; }
    if (!phone.trim()) { setError("Entrez votre numéro Mobile Money."); return; }
    setLoading(true);
    try {
      await api.post("/wallet/topup", { amount: amt, currency, provider, phone: phone.trim() });
      setSuccess(true);
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? "Erreur lors de la recharge.");
    } finally { setLoading(false); }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.successBox}>
          <CheckCircle2 size={64} color="#10B981" />
          <Text style={styles.successTitle}>Recharge réussie !</Text>
          <Text style={styles.successSub}>
            Votre solde a été crédité via {provider}.
          </Text>
          <Button label="Retour au wallet" onPress={() => router.replace("/wallet")} />
        </View>
      </SafeAreaView>
    );
  }

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
        <Button label="Recharger" onPress={submit} loading={loading} />

        <Text style={styles.note}>
          Une demande de paiement sera envoyée à votre numéro {provider}.
          Confirmez sur votre téléphone pour finaliser.
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
  successBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xxxl, gap: 16 },
  successTitle: { fontSize: 24, fontWeight: "800", color: Colors.text },
  successSub: { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
});
