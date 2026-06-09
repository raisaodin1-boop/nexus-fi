import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, CheckCircle2, Info } from "lucide-react-native";

import { api } from "@/src/api";
import { Button, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { formatAmount, type Currency } from "@/src/exchange-rates";

const CURRENCIES: Currency[] = ["XAF", "EUR", "USD"];

export default function TransferScreen() {
  const router = useRouter();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount]       = useState("");
  const [currency, setCurrency]   = useState<Currency>("XAF");
  const [note, setNote]           = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const amt = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    if (!recipient.trim()) { setError("Entrez l'email ou le téléphone du destinataire."); return; }
    if (!amt || amt <= 0) { setError("Entrez un montant valide."); return; }
    setLoading(true);
    try {
      await api.post("/wallet/transfer", {
        to_phone_or_email: recipient.trim(),
        amount: amt,
        currency,
        note: note.trim() || undefined,
      });
      setSuccess(`${formatAmount(amt, currency)} transféré avec succès.`);
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? "Erreur lors du transfert.");
    } finally { setLoading(false); }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.successBox}>
          <CheckCircle2 size={64} color="#10B981" />
          <Text style={styles.successTitle}>Transfert effectué !</Text>
          <Text style={styles.successSub}>{success}</Text>
          <Button label="Retour au wallet" onPress={() => router.replace("/wallet")} />
          <Button label="Nouveau transfert" onPress={() => setSuccess(null)} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={["#0B1F3A", "#1D4ED8"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ChevronLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Virement membre à membre</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Info size={16} color={Colors.secondary} />
          <Text style={styles.infoText}>
            Transfert instantané entre membres Hodix. Aucun frais.
          </Text>
        </View>

        <Field
          label="Destinataire (email ou téléphone)"
          value={recipient}
          onChangeText={setRecipient}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="ex: marie@example.com ou +237 6XX XXX XXX"
        />

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

        <Field
          label="Montant"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder={currency === "XAF" ? "ex: 10000" : "ex: 20"}
        />

        <Field
          label="Note (optionnel)"
          value={note}
          onChangeText={setNote}
          placeholder="ex: Part cotisation mars"
          maxLength={120}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={{ height: 8 }} />
        <Button
          label={amount ? `Transférer ${formatAmount(parseFloat(amount) || 0, currency)}` : "Transférer"}
          onPress={submit}
          loading={loading}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: Spacing.xl, paddingBottom: 20 },
  back: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#fff" },
  body: { padding: Spacing.xl, gap: 4 },
  infoBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.secondary + "15", borderRadius: Radius.lg,
    padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.secondary + "30",
  },
  infoText: { fontSize: 12, color: Colors.secondary, fontWeight: "600", flex: 1 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text, marginBottom: 8, marginTop: 4 },
  chipRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  chip: {
    paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
  },
  chipActive: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + "15" },
  chipText: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  chipTextActive: { color: Colors.secondary },
  error: { fontSize: 13, color: Colors.danger, marginTop: 4 },
  successBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xxxl, gap: 16 },
  successTitle: { fontSize: 24, fontWeight: "800", color: Colors.text },
  successSub: { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
});
