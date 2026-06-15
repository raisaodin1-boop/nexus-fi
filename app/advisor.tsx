import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ArrowRight, Brain, Sparkles } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

import { generateAdvice, CATEGORY_COLORS, type FinancialAdvice } from "@/src/financial-advisor";
import { useAuth } from "@/src/auth-context";
import { getSavingsSummary } from "@/src/db";
import { getWallet } from "@/src/wallet-db";
import { isPinSet } from "@/src/security";
import { getStreakData, getReferralInfo } from "@/src/db";
import { Colors, Radius, Spacing } from "@/src/theme";

const PRIORITY_LABELS = { high: "Urgent", medium: "Recommandé", low: "Conseil" };
const PRIORITY_COLORS = { high: "#EF4444", medium: "#F59E0B", low: "#10B981" };

export default function AdvisorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [advice, setAdvice] = useState<FinancialAdvice[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadAdvice = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [savings, wallet, pinSet, streak, referral] = await Promise.allSettled([
        getSavingsSummary(),
        getWallet(),
        isPinSet(),
        getStreakData(),
        getReferralInfo(),
      ]);

      const ctx = {
        trustScore: user.trust_score,
        kycStatus: user.kyc_status,
        savingsSummary: savings.status === "fulfilled" ? savings.value : undefined,
        walletBalance: wallet.status === "fulfilled" ? wallet.value.balance_xaf : undefined,
        hasPinSet: pinSet.status === "fulfilled" ? pinSet.value : undefined,
        streakWeeks: streak.status === "fulfilled" ? (streak.value as any)?.current_streak ?? 0 : 0,
        referralCount: referral.status === "fulfilled" ? (referral.value as any)?.referrals?.length ?? 0 : 0,
      };

      setAdvice(generateAdvice(ctx));
      setLastRefresh(new Date());
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { loadAdvice(); }, [user]);

  if (loading) return (
    <SafeAreaView style={s.safe}>
      <ActivityIndicator color={Colors.primary} style={{ marginTop: 80 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Conseiller IA</Text>
            <Text style={s.subtitle}>Recommandations personnalisées</Text>
          </View>
          <TouchableOpacity onPress={loadAdvice} style={{ padding: 8 }}>
            <Sparkles size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Hero */}
        <LinearGradient colors={["#0B1F3A", "#1E3A5F"]} style={s.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Brain size={32} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>Bonjour, {user?.full_name?.split(" ")[0] ?? "vous"} 👋</Text>
            <Text style={s.heroSub}>
              {advice.length === 0
                ? "Votre situation financière est au point !"
                : `J'ai ${advice.length} recommandation${advice.length > 1 ? "s" : ""} pour vous aujourd'hui.`}
            </Text>
          </View>
        </LinearGradient>

        {/* Advice list */}
        {advice.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>🎉</Text>
            <Text style={s.emptyTitle}>Excellent profil !</Text>
            <Text style={s.emptyText}>Votre situation financière est optimale. Continuez sur cette lancée.</Text>
          </View>
        ) : (
          advice.map(item => (
            <View key={item.id} style={[s.card, { borderLeftColor: CATEGORY_COLORS[item.category], borderLeftWidth: 4 }]}>
              <View style={s.cardTop}>
                <Text style={{ fontSize: 28 }}>{item.emoji}</Text>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={[s.priorityBadge, { backgroundColor: PRIORITY_COLORS[item.priority] + "22" }]}>
                      <Text style={[s.priorityLabel, { color: PRIORITY_COLORS[item.priority] }]}>
                        {PRIORITY_LABELS[item.priority]}
                      </Text>
                    </View>
                    <View style={[s.catBadge, { backgroundColor: CATEGORY_COLORS[item.category] + "18" }]}>
                      <Text style={[s.catLabel, { color: CATEGORY_COLORS[item.category] }]}>
                        {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.cardTitle}>{item.title}</Text>
                </View>
              </View>
              <Text style={s.cardMessage}>{item.message}</Text>
              {item.action && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: CATEGORY_COLORS[item.category] + "18" }]}
                  onPress={() => router.push(item.action!.route as any)}
                >
                  <Text style={[s.actionLabel, { color: CATEGORY_COLORS[item.category] }]}>{item.action.label}</Text>
                  <ArrowRight size={14} color={CATEGORY_COLORS[item.category]} />
                </TouchableOpacity>
              )}
            </View>
          ))
        )}

        {lastRefresh && (
          <Text style={s.refreshNote}>Dernière analyse : {lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 80 },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 4 },
  back: { padding: 8 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 1 },
  hero: { borderRadius: Radius.xl, padding: Spacing.lg, flexDirection: "row", alignItems: "center", gap: 16 },
  heroTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 3 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 20 },
  card: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  priorityBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  priorityLabel: { fontSize: 10, fontWeight: "700" },
  catBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  catLabel: { fontSize: 10, fontWeight: "600" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },
  cardMessage: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: Radius.md, paddingVertical: 9, paddingHorizontal: 14, alignSelf: "flex-start" },
  actionLabel: { fontSize: 13, fontWeight: "700" },
  refreshNote: { fontSize: 11, color: Colors.textMuted, textAlign: "center" },
});
