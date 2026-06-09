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
  RefreshCw, TrendingUp, Wallet as WalletIcon,
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

const TX_ICONS: Record<string, { icon: any; color: string; sign: string }> = {
  topup:         { icon: ArrowDownLeft,  color: "#10B981", sign: "+" },
  transfer_in:   { icon: ArrowDownLeft,  color: "#10B981", sign: "+" },
  withdraw:      { icon: ArrowUpRight,   color: "#EF4444", sign: "-" },
  transfer_out:  { icon: ArrowUpRight,   color: "#EF4444", sign: "-" },
  contribution:  { icon: TrendingUp,     color: "#F59E0B", sign: "-" },
};

function TxRow({ tx }: { tx: WalletTx }) {
  const cfg = TX_ICONS[tx.type] ?? { icon: ArrowLeftRight, color: Colors.textMuted, sign: "" };
  const Icon = cfg.icon;
  const date = new Date(tx.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: cfg.color + "22" }]}>
        <Icon size={18} color={cfg.color} strokeWidth={2.5} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txLabel} numberOfLines={1}>{tx.note ?? tx.type}</Text>
        {tx.counterpart_name ? <Text style={styles.txSub}>{tx.counterpart_name}</Text> : null}
        <Text style={styles.txDate}>{date}</Text>
      </View>
      <Text style={[styles.txAmount, { color: cfg.color }]}>
        {cfg.sign}{formatAmount(tx.amount, tx.currency as Currency)}
      </Text>
    </View>
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
        renderItem={({ item }) => <TxRow tx={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
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
                  <RateChip label="1 EUR" value={`${rates.XAF_PER_EUR.toFixed(3)} XAF`} fixed />
                  <RateChip label="1 USD" value={`${rates.XAF_PER_USD.toFixed(1)} XAF`} />
                  <RateChip label="1 EUR" value={`${rates.USD_PER_EUR.toFixed(4)} USD`} />
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
  safe: { flex: 1, backgroundColor: Colors.background },
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
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  txLabel: { fontSize: 13, fontWeight: "600", color: Colors.text },
  txSub: { fontSize: 11, color: Colors.textMuted },
  txDate: { fontSize: 11, color: Colors.textSubtle },
  txAmount: { fontSize: 14, fontWeight: "800" },
  sep: { height: 1, backgroundColor: Colors.border, marginLeft: 52 },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 13, color: Colors.textMuted },
});
