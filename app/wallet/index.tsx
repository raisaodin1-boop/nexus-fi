import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated, FlatList, RefreshControl, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
  RefreshCw, Wallet as WalletIcon, Shield, Globe,
} from "lucide-react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { isDiasporaMember } from "@/src/diaspora-enrollment-config";
import { useDisplayCurrency } from "@/src/hooks/use-display-currency";
import { useResponsive } from "@/src/hooks/use-responsive";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { SkeletonBox } from "@/src/ui";
import { formatAmount, type Currency, type Rates } from "@/src/exchange-rates";
import type { WalletBalance, WalletTx } from "@/src/wallet-db";
import { getTxMeta, txStatusLabel } from "@/src/wallet-tx-meta";

const CURRENCIES: Currency[] = ["XAF", "EUR", "USD"];

function currencyBalance(wallet: WalletBalance, cur: Currency) {
  if (cur === "XAF") return wallet.balance_xaf;
  if (cur === "EUR") return wallet.balance_eur;
  return wallet.balance_usd;
}

function txNavigate(tx: WalletTx, router: ReturnType<typeof useRouter>) {
  if (tx.type === "contribution" && tx.tontine_id) {
    router.push(`/tontines/${tx.tontine_id}` as any);
    return;
  }
  router.push(`/wallet/tx/${tx.id}` as any);
}

const TxRow = memo(function TxRow({ tx, router }: { tx: WalletTx; router: ReturnType<typeof useRouter> }) {
  const meta = getTxMeta(tx);
  const st = txStatusLabel(tx.status);
  const date = new Date(tx.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const isPending = tx.status === "pending" || tx.status === "processing";

  return (
    <TouchableOpacity activeOpacity={0.75} onPress={() => txNavigate(tx, router)} style={styles.txRow}>
      <View style={[styles.txEmoji, { backgroundColor: meta.categoryColor + "18" }]}>
        <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <View style={[styles.catBadge, { backgroundColor: meta.categoryColor + "22" }]}>
            <Text style={[styles.catLabel, { color: meta.categoryColor }]}>{meta.categoryLabel}</Text>
          </View>
          {isPending ? (
            <View style={[styles.catBadge, { backgroundColor: st.color + "22" }]}>
              <Text style={[styles.catLabel, { color: st.color }]}>{st.label}</Text>
            </View>
          ) : null}
          <Text style={{ fontSize: 10, color: "#94A3B8" }}>›</Text>
        </View>
        <Text style={styles.txLabel} numberOfLines={1}>
          {tx.note ?? (tx.counterpart_name ? `Avec ${tx.counterpart_name}` : meta.categoryLabel)}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Text style={styles.txDate}>{date}</Text>
          {tx.balance_after != null && (
            <Text style={styles.txBalance}>
              Solde : {formatAmount(tx.balance_after, tx.currency as Currency)}
            </Text>
          )}
        </View>
      </View>

      <Text style={[styles.txAmount, { color: meta.categoryColor }]}>
        {meta.sign}{formatAmount(tx.amount, tx.currency as Currency)}
      </Text>
    </TouchableOpacity>
  );
});

export default function WalletScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { currency, setCurrency } = useDisplayCurrency();
  const { horizontalPad, heroSize, isCompact } = useResponsive();
  const [wallet, setWallet]   = useState<WalletBalance | null>(null);
  const [txs, setTxs]         = useState<WalletTx[]>([]);
  const [rates, setRates]     = useState<Rates | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isDiasporaMember(user) && user?.diaspora_currency) {
      const c = user.diaspora_currency as Currency;
      if (CURRENCIES.includes(c)) setCurrency(c);
    }
  }, [user?.diaspora_status, user?.diaspora_currency, setCurrency]);

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
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    setLoading(false);
    setRefreshing(false);
  }, [fadeAnim]);

  useEffect(() => { load(); }, [load]);

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

  if (!wallet) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 16 }}>
          <WalletIcon color={Colors.textMuted} size={48} />
          <Text style={{ color: Colors.text, fontWeight: "800", fontSize: 16, textAlign: "center" }}>Wallet indisponible</Text>
          <Text style={{ color: Colors.textMuted, fontSize: 13, textAlign: "center" }}>Impossible de charger votre wallet. Vérifiez votre connexion.</Text>
          <TouchableOpacity onPress={() => load()} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.secondary }}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Réessayer</Text>
          </TouchableOpacity>
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
            <LinearGradient colors={["#0B1F3A", "#1D4ED8"]} style={[styles.balanceCard, { marginHorizontal: horizontalPad }]}>
              <View style={styles.balanceHeader}>
                <WalletIcon color="rgba(255,255,255,0.7)" size={18} />
                <Text style={styles.balanceHeaderText}>Solde disponible</Text>
                <TouchableOpacity onPress={() => load(true)} style={styles.refreshHit} accessibilityLabel="Actualiser le solde">
                  <RefreshCw color="rgba(255,255,255,0.5)" size={18} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.balanceAmount, { fontSize: heroSize }]}>{formatAmount(balance, currency)}</Text>

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

            <View style={[styles.feeStrip, { marginHorizontal: horizontalPad }]}>
              <Text style={styles.feeStripText}>
                Transferts et cotisations entre membres HODIX : 0 FCFA. Frais MoMo uniquement à l'entrée et à la sortie.
              </Text>
            </View>

            <View style={[styles.actions, { marginHorizontal: horizontalPad }]}>
              {[
                { label: "Recharger",  icon: ArrowDownLeft,  route: "/wallet/topup",    color: "#10B981" },
                { label: "Retirer",    icon: ArrowUpRight,   route: "/wallet/withdraw",  color: "#EF4444" },
                { label: "Transférer", icon: ArrowLeftRight, route: "/wallet/transfer",  color: "#1D4ED8" },
                { label: "Diaspora",  icon: Globe,         route: isDiasporaMember(user) ? "/(tabs)" : "/diaspora", color: "#0F766E" },
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

            {rates && (
              <View style={[styles.ratesCard, Shadow.card, { marginHorizontal: horizontalPad }]}>
                <Text style={styles.ratesTitle}>Taux de change en direct</Text>
                {rates.source !== "live" ? (
                  <Text style={styles.ratesWarn}>
                    {rates.source === "stale" ? "⚠️ Taux en cache — API indisponible" : "⚠️ Taux estimés — API indisponible"}
                  </Text>
                ) : null}
                <View style={[styles.ratesRow, isCompact && styles.ratesRowWrap]}>
                  <RateChip label="1 EUR" value={`${(rates.rates?.XAF ?? 655.957).toFixed(0)} XAF`} fixed />
                  <RateChip label="1 USD" value={`${((rates.rates?.XAF ?? 655.957) / (rates.rates?.EUR ?? 1)).toFixed(0)} XAF`} />
                  <RateChip label="1 EUR" value={`${(1 / (rates.rates?.EUR ?? 1)).toFixed(4)} USD`} />
                </View>
                <Text style={styles.ratesNote}>
                  XAF indexé à l'EUR · mis à jour le {new Date(rates.fetched_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            )}

            <Text style={[styles.histTitle, { paddingHorizontal: horizontalPad }]}>Historique des transactions</Text>
            {txs.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Aucune transaction pour l'instant.</Text>
              </View>
            )}
          </Animated.View>
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        style={{ paddingHorizontal: horizontalPad }}
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
    borderRadius: Radius.xxl, padding: Spacing.xl,
    marginBottom: Spacing.md, gap: 8,
  },
  balanceHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  refreshHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: "auto" },
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
  feeStrip: {
    backgroundColor: "rgba(16,185,129,0.1)",
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)",
  },
  feeStripText: { fontSize: 12, color: "#0F766E", fontWeight: "600", lineHeight: 18, textAlign: "center" },
  actions: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.xl },
  actionBtn: { flex: 1, alignItems: "center", gap: 6, minWidth: 0 },
  actionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 11, fontWeight: "600", color: Colors.text, textAlign: "center" },
  ratesCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.lg, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: Colors.border,
  },
  ratesTitle: { fontSize: 13, fontWeight: "700", color: Colors.text, marginBottom: 10 },
  ratesWarn: { fontSize: 11, color: Colors.warning, fontWeight: "600", marginBottom: 8 },
  ratesRow: { flexDirection: "row", gap: 8 },
  ratesRowWrap: { flexWrap: "wrap" },
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
  txDate: { fontSize: 11, color: Colors.textSubtle },
  txBalance: { fontSize: 10, color: Colors.textMuted, fontWeight: "500" },
  txAmount: { fontSize: 14, fontWeight: "800" },
  sep: { height: 1, backgroundColor: Colors.border, marginLeft: 52 },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 13, color: Colors.textMuted },
});
