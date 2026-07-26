import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, HeartHandshake } from "lucide-react-native";
import { TouchableOpacity } from "react-native";

import { api, ApiError } from "@/src/api";
import type { DiasporaRequest } from "@/src/db/diaspora";
import { openPaymentScreen } from "@/src/payment-nav";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { useDiasporaGuard, DiasporaGuardSpinner } from "@/src/use-diaspora-guard";
import { useAuth } from "@/src/auth-context";
import { DiasporaAmount } from "@/src/diaspora-amount";
import type { Currency } from "@/src/exchange-rates";

type SponsorRes = DiasporaRequest & { beneficiary_name?: string };

export default function DiasporaSponsorScreen() {
  const router = useRouter();
  const { checking } = useDiasporaGuard();
  const { user } = useAuth();
  const displayCur = (user?.diaspora_currency ?? "EUR") as Currency;
  const { show } = useToast();
  const [inviteCode, setInviteCode] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<SponsorRes | null>(null);

  const createAndPay = async () => {
    setBusy(true);
    try {
      const req = await api.post<SponsorRes>("/diaspora/sponsor", {
        invite_code: inviteCode.trim(),
        beneficiary_phone: phone.trim(),
        relation: relation.trim() || undefined,
      });
      setPreview(req);
      openPaymentScreen(router, {
        amount: req.amount_expected,
        kind: "diaspora_sponsor",
        label: `Cotisation ${req.beneficiary_name ?? "proche"} — ${req.tontine_name ?? "tontine"}`,
        tontine_id: req.tontine_id,
        diaspora_request_id: req.id,
      });
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Impossible de créer la demande", "error");
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <SafeAreaView style={styles.safe}>
        <DiasporaGuardSpinner checking />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Payer pour un proche</Text>
            <Text style={styles.sub}>Cotisation tontine locale depuis l’étranger — 1 geste</Text>
          </View>
        </View>

        <Card style={styles.card}>
          <View style={styles.iconRow}>
            <HeartHandshake size={22} color={Colors.primary} />
            <Text style={styles.cardTitle}>Diaspora → tontine Cameroun</Text>
          </View>
          <Text style={styles.hint}>
            Entrez le code d’invitation de la tontine et le numéro HODIX du membre local.
            Après débit MTN confirmé, sa cotisation est créditée automatiquement.
          </Text>
          <Field
            label="Code invitation tontine"
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="characters"
            placeholder="ex: ABC12XYZ"
          />
          <Field
            label="Téléphone du proche (Cameroun)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="6XX XXX XXX"
          />
          <Field
            label="Lien de parenté (optionnel)"
            value={relation}
            onChangeText={setRelation}
            placeholder="frère, sœur, parent…"
          />
          {preview ? (
            <View style={styles.preview}>
              <Text style={{ fontWeight: "800", color: Colors.text }}>
                {preview.beneficiary_name} · {preview.tontine_name}
              </Text>
              <DiasporaAmount amountXaf={preview.amount_expected} currency={displayCur} size="md" />
            </View>
          ) : null}
          <Button
            label={busy ? "Préparation…" : "Payer la cotisation"}
            onPress={createAndPay}
            loading={busy}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 48 },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  back: { padding: 8 },
  title: { fontSize: 20, fontWeight: "800", color: Colors.text },
  sub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  card: { gap: 12, borderRadius: Radius.lg },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  hint: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  preview: { gap: 4, paddingVertical: 4 },
});
