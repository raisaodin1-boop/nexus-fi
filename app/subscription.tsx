/**
 * HODIX — Page abonnements Premium
 * Free | Basic (1 500 XAF) | Pro (5 000 XAF) | Elite (15 000 XAF)
 */
import { useCallback, useState } from "react";
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Check, Crown, Zap, Star, Shield, ChevronLeft, X,
} from "lucide-react-native";

import {
  getActivePlans, getMyPlan, cancelSubscription,
  PLAN_PERKS, planLabel,
  type PlanId, type SubscriptionPlan, type UserSubscription,
} from "@/src/db/subscriptions";
import { initiateCinetpayPayment } from "@/src/db/payments";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { SkeletonBox } from "@/src/ui";

const PLAN_ICONS: Record<PlanId, React.ComponentType<any>> = {
  free: Shield, basic: Star, pro: Zap, elite: Crown,
};

const PLAN_GRADIENTS: Record<PlanId, [string, string]> = {
  free:  ["#475569", "#334155"],
  basic: ["#059669", "#10B981"],
  pro:   ["#1D4ED8", "#3B82F6"],
  elite: ["#92400E", "#C9A227"],
};

function PlanCard({
  plan, isCurrent, onSelect,
}: {
  plan: SubscriptionPlan;
  isCurrent: boolean;
  onSelect: (p: SubscriptionPlan) => void;
}) {
  const Icon = PLAN_ICONS[plan.id as PlanId];
  const [g1, g2] = PLAN_GRADIENTS[plan.id as PlanId];
  const perks = PLAN_PERKS[plan.id as PlanId];
  const popular = plan.features.popular;

  return (
    <View style={[styles.card, isCurrent && styles.cardActive, Shadow.card]}>
      {popular && !isCurrent ? (
        <View style={styles.popularBadge}><Text style={styles.popularText}>LE PLUS POPULAIRE</Text></View>
      ) : null}
      {isCurrent ? (
        <View style={[styles.popularBadge, { backgroundColor: plan.features.color }]}>
          <Text style={styles.popularText}>VOTRE PLAN ACTUEL</Text>
        </View>
      ) : null}

      <LinearGradient colors={[g1, g2]} style={styles.cardHeader}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.planIconWrap}><Icon color="#fff" size={20} /></View>
          <View>
            <Text style={styles.planName}>{plan.name}</Text>
            {plan.price_xaf === 0
              ? <Text style={styles.planPrice}>Gratuit</Text>
              : <Text style={styles.planPrice}>{plan.price_xaf.toLocaleString()} XAF<Text style={styles.planPriceSub}> /mois</Text></Text>
            }
          </View>
        </View>
        <Text style={styles.planLimit}>
          {plan.max_tontines === null
            ? "✦ Tontines illimitées"
            : `Jusqu'à ${plan.max_tontines} tontine${plan.max_tontines > 1 ? "s" : ""}`}
        </Text>
      </LinearGradient>

      <View style={styles.cardBody}>
        {perks.map((perk) => (
          <View key={perk} style={styles.perkRow}>
            <Check color={plan.features.color} size={14} strokeWidth={3} />
            <Text style={styles.perkText}>{perk}</Text>
          </View>
        ))}
      </View>

      {!isCurrent && plan.price_xaf > 0 ? (
        <TouchableOpacity
          onPress={() => onSelect(plan)}
          style={[styles.ctaBtn, { backgroundColor: plan.features.color }]}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaBtnText}>Choisir {plan.name}</Text>
        </TouchableOpacity>
      ) : isCurrent && plan.price_xaf > 0 ? (
        <View style={[styles.ctaBtn, { backgroundColor: plan.features.color + "30" }]}>
          <Text style={[styles.ctaBtnText, { color: plan.features.color }]}>Plan actif ✓</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [current, setCurrent] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([getActivePlans(), getMyPlan()]);
      setPlans(p);
      setCurrent(c);
    } catch {
      /* best-effort */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const handleSelect = async (plan: SubscriptionPlan) => {
    if (paying) return;
    Alert.alert(
      `Passer au plan ${plan.name}`,
      `${plan.price_xaf.toLocaleString()} XAF/mois — paiement via Mobile Money (MTN / Orange).`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Payer maintenant",
          onPress: async () => {
            setPaying(true);
            try {
              const result = await initiateCinetpayPayment({
                amount: plan.price_xaf,
                description: `Abonnement HODIX ${plan.name} — 1 mois`,
                metadata: { type: "subscription", plan_id: plan.id },
              });
              if (result.payment_url) {
                router.push({
                  pathname: "/cinetpay-webview" as any,
                  params: {
                    url: result.payment_url,
                    payment_id: result.payment_id,
                    return_path: "/subscription",
                    success_action: "subscription",
                    plan_id: plan.id,
                  },
                });
              }
            } catch (e: any) {
              Alert.alert("Erreur", e?.detail ?? "Impossible d'initier le paiement.");
            } finally {
              setPaying(false);
            }
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    Alert.alert(
      "Annuler l'abonnement",
      "Votre plan actuel restera actif jusqu'à la fin de la période en cours, puis vous reviendrez sur le plan Gratuit.",
      [
        { text: "Garder mon abonnement", style: "cancel" },
        {
          text: "Confirmer l'annulation",
          style: "destructive",
          onPress: async () => {
            try {
              await cancelSubscription();
              await load();
              Alert.alert("Abonnement annulé", "Vous reviendrez sur le plan Gratuit à expiration.");
            } catch {
              Alert.alert("Erreur", "Impossible d'annuler l'abonnement.");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={{ padding: Spacing.xl, gap: 16 }}>
          <SkeletonBox width={200} height={28} borderRadius={8} />
          {[0, 1, 2, 3].map((i) => <SkeletonBox key={i} height={260} borderRadius={20} />)}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft color={Colors.text} size={22} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Plans Premium</Text>
            <Text style={styles.headerSub}>Choisissez le plan adapté à votre croissance</Text>
          </View>
        </View>

        {/* Current plan banner */}
        {current && current.plan_id !== "free" ? (
          <View style={[styles.currentBanner, { borderColor: current.features.color }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.currentBannerTitle, { color: current.features.color }]}>
                Plan {planLabel(current.plan_id)} actif
              </Text>
              {current.expires_at ? (
                <Text style={styles.currentBannerSub}>
                  Renouvellement le {new Date(current.expires_at).toLocaleDateString("fr-FR")}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
              <X color={Colors.textMuted} size={16} />
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Hero */}
        <LinearGradient colors={["#0B1F3A", "#1a3a5c"]} style={styles.hero}>
          <Text style={styles.heroTitle}>Débloquez tout le potentiel de HODIX</Text>
          <Text style={styles.heroSub}>
            Des tontines illimitées, des analytics puissantes et des certificats officiels pour bâtir votre identité financière.
          </Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}><Text style={styles.heroStatVal}>+2 400</Text><Text style={styles.heroStatLbl}>groupes actifs</Text></View>
            <View style={styles.heroStatDiv} />
            <View style={styles.heroStat}><Text style={styles.heroStatVal}>850M+</Text><Text style={styles.heroStatLbl}>XAF épargnés</Text></View>
            <View style={styles.heroStatDiv} />
            <View style={styles.heroStat}><Text style={styles.heroStatVal}>12 pays</Text><Text style={styles.heroStatLbl}>couverts</Text></View>
          </View>
        </LinearGradient>

        {/* Plan cards */}
        <View style={styles.cards}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={current?.plan_id === plan.id}
              onSelect={handleSelect}
            />
          ))}
        </View>

        {/* FAQ */}
        <View style={styles.faq}>
          <Text style={styles.faqTitle}>Questions fréquentes</Text>
          {[
            {
              q: "Puis-je changer de plan à tout moment ?",
              a: "Oui. Vous pouvez upgrader ou downgrader à tout moment. La facturation est mensuelle.",
            },
            {
              q: "Que se passe-t-il si j'annule ?",
              a: "Votre plan reste actif jusqu'à la fin de la période en cours, puis vous repassez sur Gratuit. Vos données sont conservées.",
            },
            {
              q: "Les certificats Elite sont-ils officiels ?",
              a: "Oui. Les certificats Elite sont signés et vérifiables avec un code unique HODIX, reconnus par nos partenaires financiers.",
            },
            {
              q: "Comment fonctionne l'auto-épargne Elite ?",
              a: "Programmez des dépôts automatiques quotidiens, hebdomadaires ou mensuels avec des règles conditionnelles avancées.",
            },
          ].map((item) => (
            <View key={item.q} style={styles.faqItem}>
              <Text style={styles.faqQ}>{item.q}</Text>
              <Text style={styles.faqA}>{item.a}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", padding: Spacing.xl, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  headerTitle: { color: Colors.text, fontSize: 20, fontWeight: "900" },
  headerSub: { color: Colors.textMuted, fontSize: 12, fontWeight: "500", marginTop: 2 },
  currentBanner: { marginHorizontal: Spacing.xl, marginBottom: 16, padding: 14, borderRadius: Radius.xl, backgroundColor: Colors.surface, borderWidth: 1.5, flexDirection: "row", alignItems: "center" },
  currentBannerTitle: { fontSize: 14, fontWeight: "800" },
  currentBannerSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  cancelBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.surfaceAlt },
  cancelBtnText: { color: Colors.textMuted, fontSize: 12, fontWeight: "700" },
  hero: { marginHorizontal: Spacing.xl, borderRadius: Radius.xxl, padding: 24, marginBottom: 24 },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.5, lineHeight: 28, marginBottom: 10 },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 20, marginBottom: 20 },
  heroStats: { flexDirection: "row", justifyContent: "space-between" },
  heroStat: { alignItems: "center", flex: 1 },
  heroStatDiv: { width: 1, backgroundColor: "rgba(255,255,255,0.15)" },
  heroStatVal: { color: "#C9A227", fontSize: 16, fontWeight: "900" },
  heroStatLbl: { color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: "600", marginTop: 2, textAlign: "center" },
  cards: { paddingHorizontal: Spacing.xl, gap: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xxl, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  cardActive: { borderWidth: 2, borderColor: "#C9A227" },
  popularBadge: { backgroundColor: "#3B82F6", paddingVertical: 6, alignItems: "center" },
  popularText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  cardHeader: { padding: 20 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  planIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  planName: { color: "#fff", fontSize: 20, fontWeight: "900" },
  planPrice: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 2 },
  planPriceSub: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "500" },
  planLimit: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.15)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, alignSelf: "flex-start" },
  cardBody: { padding: 20, gap: 10 },
  perkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  perkText: { color: Colors.text, fontSize: 13, fontWeight: "600", flex: 1 },
  ctaBtn: { marginHorizontal: 20, marginBottom: 20, paddingVertical: 15, borderRadius: Radius.xl, alignItems: "center" },
  ctaBtnText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  faq: { margin: Spacing.xl, gap: 16 },
  faqTitle: { color: Colors.primary, fontSize: 16, fontWeight: "900", marginBottom: 4 },
  faqItem: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  faqQ: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  faqA: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },
});
