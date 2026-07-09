import { useCallback, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, CheckCircle2, Share2 } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { Button, Card } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { formatDateTime } from "@/app/receipt";

interface Receipt {
  receipt_id: string;
  member_name: string;
  tontine_name: string;
  amount: number;
  currency: string;
  payment_method: string;
  reference: string;
  validated_at?: string;
  status: string;
  verify_url: string;
}

export default function DiasporaReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<Receipt>(`/diaspora/requests/${id}/receipt`);
      setReceipt(data);
    } catch {
      setReceipt(null);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const share = async () => {
    if (!receipt) return;
    await Share.share({
      message: [
        "Reçu de cotisation HODIX",
        `N° ${receipt.receipt_id}`,
        `${receipt.member_name} — ${receipt.tontine_name}`,
        `${receipt.amount.toLocaleString("fr-FR")} ${receipt.currency}`,
        `Réf. ${receipt.reference}`,
        receipt.verify_url,
      ].join("\n"),
    });
  };

  if (!receipt) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.loading}>Chargement du reçu…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <LinearGradient colors={[Colors.gradStart, Colors.gradMid]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft color="#fff" size={22} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Reçu de cotisation HODIX</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.receiptCard}>
          <View style={styles.validRow}>
            <CheckCircle2 color={Colors.success} size={28} />
            <Text style={styles.validText}>{receipt.status}</Text>
          </View>
          <Text style={styles.receiptId}>{receipt.receipt_id}</Text>
          <Detail label="Membre" value={receipt.member_name} />
          <Detail label="Tontine" value={receipt.tontine_name} />
          <Detail label="Montant" value={formatXAF(receipt.amount)} />
          <Detail label="Méthode" value={receipt.payment_method} />
          <Detail label="Référence" value={receipt.reference} />
          {receipt.validated_at ? (
            <Detail label="Validé le" value={formatDateTime(receipt.validated_at)} />
          ) : null}
          <Text style={styles.mention}>
            Ce reçu confirme la validation de la cotisation dans HODIX.
          </Text>
        </Card>

        <Button label="Télécharger / Partager" onPress={share} icon={<Share2 color="#fff" size={16} />} />
        <Button label="Voir ma tontine" variant="outline" onPress={() => router.push("/diaspora/contributions" as any)} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  loading: { textAlign: "center", marginTop: 80, color: Colors.textMuted },
  header: { padding: Spacing.lg, flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "900", flex: 1 },
  scroll: { padding: Spacing.lg, gap: 12, paddingBottom: 48 },
  receiptCard: { padding: Spacing.lg },
  validRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  validText: { fontSize: 16, fontWeight: "900", color: Colors.success },
  receiptId: { fontSize: 12, color: Colors.secondary, fontWeight: "800", marginBottom: 16 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  detailLabel: { fontSize: 13, color: Colors.textMuted },
  detailValue: { fontSize: 13, fontWeight: "800", color: Colors.text, maxWidth: "60%", textAlign: "right" },
  mention: { fontSize: 11, color: Colors.textSubtle, marginTop: 16, textAlign: "center", lineHeight: 16 },
});
