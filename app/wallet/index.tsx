import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated, FlatList, RefreshControl, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
  RefreshCw, Wallet as WalletIcon, Shield,
} from "lucide-react-native";

import { api } from "@/src/api";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { SkeletonBox } from "@/src/ui";
import { formatAmount, type Currency, type Rates } from "@/src/exchange-rates";
import type { WalletBalance, WalletTx } from "@/src/wallet-db";

// ─── Currency toggle ──────────────────────────────────────────────────────────

const CURRENCIES: Currency[] = ["XAF", "EUR", "USD"];

function currencyBalance(wallet: WalletBalance, cur: Currency) {
  if (cur === "XAF") return wallet.balance_xaf;
  if (cur === "EUR") return wallet.balance_eur;
  return wallet.balance_usd;
}

// ─── Transaction row ──────────────────────────────────────────────────────────

interface TxMeta {
  emoji: string;
  categoryLabel: string;
  categoryColor: string;
  sign: "+" | "-" | "";
}

function getTxMeta(tx: WalletTx): TxMeta {
  switch (tx.type) {
    case "topup":
      return { emoji: "💳", categoryLabel: "Rechargement", categoryColor: "#10B981", sign: "+" };
    case "transfer_in":
      return { emoji: "💸", categoryLabel: "Virement reçu", categoryColor: "#10B981", sign: "+" };
    case "transfer_out":
      return { emoji: "🤝", categoryLabel: "Virement envoyé", categoryColor: "#EF4444", sign: "-" };
    case "withdraw":
      return { emoji: "🏧", categoryLabel: "Retrait Mobile", categoryColor: "#EF4444", sign: "-" };
    case "contribution":
      return { emoji: "🤝", categoryLabel: "Cotisation tontine", categoryColor: "#F59E0B", sign: "-" };
    case "deposit":
      return { emoji: "💰", categoryLabel: "Épargne", categoryColor: "#3B82F6", sign: "-" };
    case "bonus":
      return { emoji: "🏆", categoryLabel: "Bonus / Récompense", categoryColor: "#8B5CF6", sign: "+" };
    default:
      return { emoji: "💱", categoryLabel: tx.type, categoryColor: "#94A3B8", sign: "" };
  }
}

function TxRow({ tx, router }: { tx: WalletTx; router: ReturnType<typeof useRouter> }) {
  const meta = getTxMeta(tx);
  const date = new Date(tx.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const hasGroupLink = !!tx.tontine_id || !!tx.reference_id;

  return (
    <TouchableOpacity
      activeOpacity={hasGroupLink ? 0.75 : 1}
      onPress={() => {
        if (tx.tontine_id) router.push(`/tontines/${tx.tontine_id}` as any);
      }}
      style={styles.txRow}
    >
      {/* Emoji avatar */}
      <View style={[styles.txEmoji, { backgroundColor: meta.categoryColor + "18" }]}>
        <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
      </View>

      {/* Main content */}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={[styles.catBadge, { backgroundColor: meta.categoryColor + "22" }]}>
            <Text style={[styles.catLabel, { color: meta.categoryColor }]}>{meta.categoryLabel}</Text>
          </View>
          {hasGroupLink && <Text style={{ fontSize: 10, color: "#94A3B8" }}>›</Text>}
        </View>
        <Text style={styles.txLabel} numberOfLines={1}>
          {tx.note ?? (tx.counterpart_name ? `Avec ${tx.counterpart_name}` : meta.categoryLabel)}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Text style={styles.txDate}>{date}</Text>
          {tx.balance_after != null && (
            <Text style={styles.txBalance}>
              Solde : {formatAmount(tx.balance_after, tx.currency as any)}
            </Text>
          )}
        </View>
      </View>

      {/* Amount */}
      <Text style={[styles.txAmount, { color: meta.categoryColor }]}>
        {meta.sign}{formatAmount(tx.amount, tx.currency as any)}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WalletScreen() {
  const router = useRouter();
  const [wallet, setWallet]   = useState<WalletBalance | null>(null);
  const [txs, setTxs]         = useState<WalletTx[]>([]);
  const [rates, setRates]     = useState<Rates | null>(null);
  const [currency, setCurrency] = useState<Currency>("XAF");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [w, t, r] = await Promise.all([
        api.get<WalletBalance>("/wallet"),
        api.get<WalletTx[]>("/wallet/transactions"),
        api.get<Rates>("/wallet/rates"),
      ]);
      setWallet(w);
      setTxs(Array.isArray(t) ? t : []);
      setRates(r);
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={{ padding: Spacing.xl, gap: 16 }}>
          <SkeletonBox height={200} borderRadius={Radius.xxl} />
          <SkeletonBox height={80} borderRadius={Radius.xl} />
          <SkeletonBox height={300} borderRadius={Radius.xl} />
        </View>
      </SafeAreaView>
    );
  }

  const balance = wallet ? currencyBalance(wallet, currency) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={txs}
        keyExtractor={t => t.id}
        renderItem={({ item }) => <TxRow tx={item} router={router} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* ── Balance card ── */}
            <LinearGradient colors={["#0B1F3A", "#1D4ED8"]} style={styles.balanceCard}>
              <View style={styles.balanceHeader}>
                <WalletIcon color="rgba(255,255,255,0.7)" size={18} />
                <Text style={styles.balanceHeaderText}>Solde disponible</Text>
                <TouchableOpacity onPress={() => load(true)}>
                  <RefreshCw color="rgba(255,255,255,0.5)" size={16} />
                </TouchableOpacity>
              </View>

              <Text style={styles.balanceAmount}>{formatAmount(balance, currency)}</Text>

              {/* Currency toggle */}
              <View style={styles.currencyRow}>
                {CURRENCIES.map(c => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCurrency(c)}
                    style={[styles.currencyChip, currency === c && styles.currencyChipActive]}
                  >
                    <Text style={[styles.currencyChipText, currency === c && styles.currencyChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* All balances in small */}
              {wallet && (
                <View style={styles.allBalances}>
                  <Text style={styles.balSub}>{formatAmount(wallet.balance_xaf, "XAF")}</Text>
                  <Text style={styles.balSub}>·</Text>
                  <Text style={styles.balSub}>{formatAmount(wallet.balance_eur, "EUR")}</Text>
                  <Text style={styles.balSub}>·</Text>
                  <Text style={styles.balSub}>{formatAmount(wallet.balance_usd, "USD")}</Text>
                </View>
              )}
            </LinearGradient>

            {/* ── Quick actions ── */}
            <View style={styles.actions}>
              {[
                { label: "Recharger",  icon: ArrowDownLeft,  route: "/wallet/topup",    color: "#10B981" },
                { label: "Retirer",    icon: ArrowUpRight,   route: "/wallet/withdraw",  color: "#EF4444" },
                { label: "Transférer", icon: ArrowLeftRight, route: "/wallet/transfer",  color: "#1D4ED8" },
                { label: "Sécurité",  icon: Shield,        route: "/wallet/security", color: "#8B5CF6" },
              ].map(({ label, icon: Icon, route, color }) => (
                <TouchableOpacity
                  key={label}
                  style={styles.actionBtn}
                  onPress={() => router.push(route as any)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionIcon, { backgroundColor: color + "1A" }]}>
                    <Icon size={20} color={color} strokeWidth={2.5} />
                  </View>
                  <Text style={styles.actionLabel}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Exchange rates ── */}
            {rates && (
              <View style={[styles.ratesCard, Shadow.card]}>
                <Text style={styles.ratesTitle}>Taux de change en direct</Text>
                <View style={styles.ratesRow}>
                  <RateChip label="1 EUR" value={`${(rates.rates?.XAF ?? 655.957).toFixed(0)} XAF`} fixed />
                  <RateChip label="1 USD" value={`${((rates.rates?.XAF ?? 655.957) / (rates.rates?.EUR ?? 1)).toFixed(0)} XAF`} />
                  <RateChip label="1 EUR" value={`${(1 / (rates.rates?.EUR ?? 1)).toFixed(4)} USD`} />
                </View>
                <Text style={styles.ratesNote}>
                  XAF indexé à l'EUR · USD mis à jour le {new Date(rates.fetched_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            )}

            {/* ── History header ── */}
            <Text style={styles.histTitle}>Historique des transactions</Text>
            {txs.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Aucune transaction pour l'instant.</Text>
              </View>
            )}
          </Animated.View>
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        style={{ paddingHorizontal: Spacing.xl }}
      />
    </SafeAreaView>
  );
}

function RateChip({ label, value, fixed }: { label: string; value: string; fixed?: boolean }) {
  return (
    <View style={styles.rateChip}>
      <Text style={styles.rateLabel}>{label}</Text>
      <Text style={styles.rateValue}>{value}</Text>
      {fixed && <Text style={styles.rateFixed}>fixe</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  balanceCard: {
    borderRadius: Radius.xxl, padding: Spacing.xl, margin: Spacing.xl,
    marginBottom: Spacing.md, gap: 8,
  },
  balanceHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  balanceHeaderText: { flex: 1, fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  balanceAmount: { fontSize: 42, fontWeight: "900", color: "#fff", letterSpacing: -1.5, marginVertical: 4 },
  currencyRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  currencyChip: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: Radius.full,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
  },
  currencyChipActive: { backgroundColor: "#fff" },
  currencyChipText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.7)" },
  currencyChipTextActive: { color: "#0B1F3A" },
  allBalances: { flexDirection: "row", gap: 8, marginTop: 2, flexWrap: "wrap" },
  balSub: { fontSize: 11, color: "rgba(255,255,255,0.45)" },
  actions: { flexDirection: "row", gap: Spacing.md, marginHorizontal: Spacing.xl, marginBottom: Spacing.xl },
  actionBtn: { flex: 1, alignItems: "center", gap: 8 },
  actionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 12, fontWeight: "600", color: Colors.text },
  ratesCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.lg, marginHorizontal: Spacing.xl, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: Colors.border,
  },
  ratesTitle: { fontSize: 13, fontWeight: "700", color: Colors.text, marginBottom: 10 },
  ratesRow: { flexDirection: "row", gap: 8 },
  rateChip: {
    flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: Radius.lg,
    padding: 10, alignItems: "center", gap: 2,
  },
  rateLabel: { fontSize: 10, color: Colors.textMuted },
  rateValue: { fontSize: 13, fontWeight: "800", color: Colors.text, textAlign: "center" },
  rateFixed: { fontSize: 9, color: Colors.secondary, fontWeight: "600" },
  ratesNote: { fontSize: 10, color: Colors.textSubtle, marginTop: 8, textAlign: "center" },
  histTitle: { fontSize: 17, fontWeight: "800", color: Colors.text, marginBottom: Spacing.md, letterSpacing: -0.3 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  txEmoji: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  catLabel: { fontSize: 10, fontWeight: "700" },
  txLabel: { fontSize: 13, fontWeight: "600", color: Colors.text },
  txSub: { fontSize: 11, color: Colors.textMuted },
  txDate: { fontSize: 11, color: Colors.textSubtle },
  txBalance: { fontSize: 10, color: Colors.textMuted, fontWeight: "500" },
  txAmount: { fontSize: 14, fontWeight: "800" },
  sep: { height: 1, backgroundColor: Colors.border, marginLeft: 52 },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 13, color: Colors.textMuted },
});
