// HODIX — Transaction Receipt Screen
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { CheckCircle2, AlertCircle, Share2, Home, Mail } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import { paymentKindLabel } from "@/src/payment-receipt";
import { useToast } from "@/src/toast";
import { Button, Card } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

interface ReceiptData {
  id: string;
  payment_id?: string;
  receipt_id?: string;
  amount_xaf: number;
  method?: string;
  payment_method?: string;
  type?: string;
  status: string;
  reference?: string;
  commission_xaf?: number;
  created_at: string;
  label?: string;
  kind?: string;
  email_sent?: boolean;
}

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day} à ${time}`;
}

function typeLabel(type?: string, kind?: string, label?: string): string {
  if (label?.trim()) return label;
  if (kind) return paymentKindLabel(kind);
  if (type === "deposit") return "Dépôt";
  if (type === "withdrawal") return "Retrait";
  if (type === "contribution") return "Contribution";
  if (type?.includes("_")) return paymentKindLabel(type);
  return type ?? "Transaction";
}

function statusBadge(status: string): { text: string; bg: string; fg: string } {
  if (status === "succeeded") return { text: "✅ Confirmé", bg: Colors.accent + "22", fg: Colors.accent };
  if (status === "pending") return { text: "⏳ En attente", bg: Colors.warning + "22", fg: Colors.warning };
  if (status === "processing") return { text: "🔄 En cours", bg: Colors.secondary + "22", fg: Colors.secondary };
  if (status === "failed") return { text: "❌ Échoué", bg: Colors.danger + "22", fg: Colors.danger };
  if (status === "rejected") return { text: "🚫 Refusé", bg: Colors.danger + "22", fg: Colors.danger };
  return { text: status, bg: Colors.surfaceAlt, fg: Colors.textMuted };
}

function buildReceiptId(r: ReceiptData): string {
  const src = r.receipt_id ?? r.id ?? r.payment_id ?? "";
  const clean = src.replace(/-/g, "").toUpperCase().slice(0, 8).padEnd(8, "0");
  return `HDX-${clean}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function ReceiptScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { paymentId, type } = useLocalSearchParams<{ paymentId: string; type?: string }>();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!paymentId) { setError("Identifiant de paiement manquant"); setLoading(false); return; }
    try {
      const r = await api.get<ReceiptData>(`/payments/${paymentId}/receipt`);
      setReceipt(r);
      setError(null);
    } catch (e: any) {
      setError(e?.detail || "Reçu introuvable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [paymentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resendEmail = async () => {
    if (!paymentId) return;
    setEmailSending(true);
    try {
      const r = await api.post<{ delivery?: string; email_masked?: string }>(
        `/payments/${paymentId}/receipt/email`,
        { force: true },
      );
      show(
        r.delivery === "email"
          ? `Reçu envoyé à ${r.email_masked ?? "votre email"}`
          : "Reçu disponible dans l'app (email non configuré)",
        "success",
      );
      load();
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Envoi email impossible", "error");
    } finally {
      setEmailSending(false);
    }
  };

  const shareReceipt = async () => {
    if (!receipt) return;
    const txType = typeLabel(type || receipt.type, receipt.kind, receipt.label);
    const st = statusBadge(receipt.status);
    const method = receipt.payment_method ?? receipt.method ?? "—";
    const ref = receipt.reference ?? receipt.id;
    const lines = [
      "— REÇU HODIX —",
      `Réf : ${buildReceiptId(receipt)}`,
      `Type : ${txType}`,
      `Montant : ${formatXAF(receipt.amount_xaf)}`,
      `Méthode : ${method}`,
      `Date : ${formatDateTime(receipt.created_at)}`,
      `Référence : ${ref}`,
      `Statut : ${st.text}`,
      receipt.commission_xaf && receipt.commission_xaf > 0
        ? `Commission Hodix : ${formatXAF(receipt.commission_xaf)}`
        : null,
    ].filter(Boolean).join("\n");
    try {
      await Share.share({ message: lines, title: "Reçu HODIX" });
    } catch {}
  };

  // ---- Loading ----
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <ActivityIndicator color={Colors.secondary} size="large" />
          <Text style={{ color: "rgba(255,255,255,0.7)", fontWeight: "600" }}>Chargement du reçu...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Error ----
  if (error || !receipt) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <LinearGradient colors={[Colors.primary, "#0F2B5B"]} style={styles.header}>
          <Text style={styles.headerBrand}>HODIX</Text>
          <Text style={styles.headerTitle}>REÇU DE TRANSACTION</Text>
        </LinearGradient>
        <View style={styles.body}>
          <View style={{ alignItems: "center", gap: 16, paddingTop: 40 }}>
            <AlertCircle color={Colors.danger} size={56} />
            <Text style={{ color: Colors.text, fontWeight: "800", fontSize: 18 }}>Reçu introuvable</Text>
            <Text style={{ color: Colors.textMuted, fontSize: 14, textAlign: "center" }}>
              {error || "Ce reçu n'existe pas ou a expiré."}
            </Text>
            <Button label="Retour" onPress={() => router.back()} testID="receipt-back-error" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const st = statusBadge(receipt.status);
  const txType = typeLabel(type || receipt.type, receipt.kind, receipt.label);
  const receiptId = buildReceiptId(receipt);
  const method = receipt.payment_method ?? receipt.method ?? "—";
  const ref = receipt.reference ?? receipt.id;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={Colors.secondary}
          />
        }
      >
        {/* Dark blue gradient header */}
        <LinearGradient colors={[Colors.primary, "#0F2B5B"]} style={styles.header}>
          <Text style={styles.headerBrand}>HODIX</Text>
          <Text style={styles.headerTitle}>REÇU DE TRANSACTION</Text>
        </LinearGradient>

        {/* White card body with rounded top corners (modal sheet style) */}
        <View style={styles.body}>
          {/* Large green success checkmark */}
          <View style={styles.checkWrap}>
            <View style={[styles.checkCircle, { backgroundColor: Colors.accent + "20" }]}>
              <CheckCircle2 color={Colors.accent} size={52} />
            </View>
          </View>

          {/* Receipt ID — large, gold, monospace-style */}
          <Text style={styles.receiptId}>{receiptId}</Text>

          {/* Amount — very large, centered */}
          <Text style={styles.amount}>{formatXAF(receipt.amount_xaf)}</Text>
          <Text style={styles.amountSub}>{txType}</Text>

          <View style={styles.emailBanner}>
            <Mail color={Colors.secondary} size={16} />
            <Text style={styles.emailBannerText}>
              {receipt.email_sent
                ? "Une copie de ce reçu a été envoyée à votre adresse email."
                : "Le reçu sera envoyé par email après confirmation du paiement."}
            </Text>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Details grid */}
          <Card style={styles.detailCard}>
            <DetailRow label="Type de transaction" value={txType} />
            <DetailRow label="Méthode de paiement" value={method} />
            <DetailRow label="Date & heure" value={formatDateTime(receipt.created_at)} />
            <DetailRow label="Référence" value={ref.slice(0, 20)} />

            {/* Status badge */}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Statut</Text>
              <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                <Text style={[styles.statusText, { color: st.fg }]}>{st.text}</Text>
              </View>
            </View>

            {receipt.commission_xaf !== undefined && receipt.commission_xaf > 0 && (
              <DetailRow label="Commission HODIX" value={formatXAF(receipt.commission_xaf)} />
            )}
          </Card>

          {/* Action buttons */}
          <View style={{ gap: 12, paddingHorizontal: Spacing.xl, marginTop: 4 }}>
            <Button
              label={emailSending ? "Envoi en cours..." : "Renvoyer par email"}
              variant="secondary"
              onPress={resendEmail}
              loading={emailSending}
              icon={<Mail color={Colors.secondary} size={16} />}
              testID="receipt-email"
            />
            <TouchableOpacity onPress={shareReceipt} style={styles.shareBtn} testID="receipt-share">
              <Share2 color={Colors.secondary} size={16} />
              <Text style={styles.shareBtnText}>Partager ce reçu</Text>
            </TouchableOpacity>
            {/* Primary CTA */}
            <Button
              label={type === "wallet_topup" ? "Retour au wallet" : "Retour à l'accueil"}
              onPress={() => router.replace(type === "wallet_topup" ? "/wallet" : "/(tabs)" as any)}
              icon={<Home color="#fff" size={16} />}
              testID="receipt-home"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.primary },
  header: {
    paddingTop: 24,
    paddingBottom: 56,
    alignItems: "center",
    gap: 6,
  },
  headerBrand: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 4,
  },
  headerTitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 2,
  },
  body: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingBottom: 24,
  },
  checkWrap: {
    alignItems: "center",
    marginTop: -36,
    marginBottom: 12,
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: Colors.bg,
    ...(Shadow.card as any),
  },
  receiptId: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 3,
    color: Colors.gold,
    marginTop: 4,
    fontVariant: ["tabular-nums"] as any,
  },
  amount: {
    textAlign: "center",
    fontSize: 36,
    fontWeight: "900",
    color: Colors.text,
    letterSpacing: -1,
    marginTop: 8,
  },
  amountSub: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textMuted,
    marginTop: 4,
    marginBottom: 12,
  },
  emailBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: Spacing.xl,
    marginBottom: 16,
    padding: 12,
    borderRadius: Radius.lg,
    backgroundColor: Colors.secondary + "12",
    borderWidth: 1,
    borderColor: Colors.secondary + "30",
  },
  emailBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Colors.text,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.xl,
    marginBottom: 16,
  },
  detailCard: {
    marginHorizontal: Spacing.xl,
    gap: 2,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  detailValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.secondary + "12",
    borderWidth: 1.5,
    borderColor: Colors.secondary,
    borderRadius: Radius.xl,
    paddingVertical: 14,
  },
  shareBtnText: {
    color: Colors.secondary,
    fontWeight: "800",
    fontSize: 15,
  },
});
