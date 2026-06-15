/**
 * Conseiller financier IA — règles basées sur les données réelles de l'utilisateur.
 * Génère des recommandations personnalisées et actionnables.
 */

export type AdviceCategory = "savings" | "tontines" | "wallet" | "identity" | "budget" | "general";
export type AdvicePriority = "high" | "medium" | "low";

export interface FinancialAdvice {
  id: string;
  category: AdviceCategory;
  priority: AdvicePriority;
  title: string;
  message: string;
  action?: { label: string; route: string };
  emoji: string;
}

export interface AdvisorContext {
  trustScore?: number | null;
  kycStatus?: string | null;
  savingsSummary?: { total_saved: number; total_target: number; active_goals: number; progress_pct: number };
  walletBalance?: number;
  tontineCount?: number;
  streakWeeks?: number;
  lastDepositDaysAgo?: number | null;
  referralCount?: number;
  hasPinSet?: boolean;
  overdueTontines?: number;
}

export function generateAdvice(ctx: AdvisorContext): FinancialAdvice[] {
  const advice: FinancialAdvice[] = [];

  // ── Identité & KYC ─────────────────────────────────────────────────────────
  if (!ctx.kycStatus || ctx.kycStatus === "not_submitted") {
    advice.push({
      id: "kyc_missing",
      category: "identity",
      priority: "high",
      emoji: "🪪",
      title: "Vérifiez votre identité",
      message: "Le KYC débloque les transferts, les retraits et améliore votre Trust Score. Ça prend moins de 3 minutes.",
      action: { label: "Vérifier mon identité", route: "/kyc" },
    });
  }

  if (!ctx.hasPinSet) {
    advice.push({
      id: "pin_missing",
      category: "wallet",
      priority: "high",
      emoji: "🔐",
      title: "Sécurisez votre wallet",
      message: "Créez un code PIN pour protéger vos transactions. Sans PIN, vos fonds ne sont pas sécurisés.",
      action: { label: "Créer mon PIN", route: "/wallet/pin-setup" },
    });
  }

  // ── Épargne ────────────────────────────────────────────────────────────────
  if (!ctx.savingsSummary || ctx.savingsSummary.active_goals === 0) {
    advice.push({
      id: "no_savings",
      category: "savings",
      priority: "high",
      emoji: "🎯",
      title: "Commencez à épargner",
      message: "Créez votre premier objectif d'épargne. Même 5 000 FCFA/semaine fait une grande différence sur un an.",
      action: { label: "Créer un objectif", route: "/savings/create" },
    });
  } else if (ctx.savingsSummary.progress_pct < 20 && ctx.savingsSummary.active_goals > 0) {
    advice.push({
      id: "savings_low",
      category: "savings",
      priority: "medium",
      emoji: "📈",
      title: "Accélérez votre épargne",
      message: `Vous n'avez atteint que ${ctx.savingsSummary.progress_pct}% de votre objectif. Activez l'auto-épargne pour ne plus y penser.`,
      action: { label: "Configurer l'auto-épargne", route: "/auto-savings" },
    });
  }

  if (ctx.lastDepositDaysAgo !== null && ctx.lastDepositDaysAgo !== undefined && ctx.lastDepositDaysAgo > 14) {
    advice.push({
      id: "savings_inactive",
      category: "savings",
      priority: "medium",
      emoji: "⏰",
      title: "Reprenez votre rythme",
      message: `Votre dernier dépôt date de ${ctx.lastDepositDaysAgo} jours. La régularité est clé pour atteindre vos objectifs.`,
      action: { label: "Faire un dépôt", route: "/(tabs)/savings" },
    });
  }

  // ── Tontines ───────────────────────────────────────────────────────────────
  if (!ctx.tontineCount || ctx.tontineCount === 0) {
    advice.push({
      id: "no_tontine",
      category: "tontines",
      priority: "medium",
      emoji: "🤝",
      title: "Rejoignez une tontine",
      message: "Les tontines vous permettent d'accéder à de grandes sommes en groupe. Rejoignez ou créez votre cercle.",
      action: { label: "Explorer les tontines", route: "/tontines/directory" },
    });
  }

  if (ctx.overdueTontines && ctx.overdueTontines > 0) {
    advice.push({
      id: "overdue_tontine",
      category: "tontines",
      priority: "high",
      emoji: "⚠️",
      title: "Cotisation en retard",
      message: `Vous avez ${ctx.overdueTontines} cotisation(s) en retard. Un retard nuit à votre Trust Score et risque l'exclusion.`,
      action: { label: "Voir mes tontines", route: "/(tabs)/groups" },
    });
  }

  // ── Trust Score ─────────────────────────────────────────────────────────────
  if (ctx.trustScore !== null && ctx.trustScore !== undefined) {
    if (ctx.trustScore < 400) {
      advice.push({
        id: "trust_low",
        category: "identity",
        priority: "medium",
        emoji: "⭐",
        title: "Améliorez votre Trust Score",
        message: `Score actuel : ${ctx.trustScore}/1000. Cotisez régulièrement, vérifiez votre KYC et invitez des amis pour progresser.`,
        action: { label: "Voir mon profil", route: "/(tabs)/identity" },
      });
    } else if (ctx.trustScore >= 700) {
      advice.push({
        id: "trust_good",
        category: "identity",
        priority: "low",
        emoji: "🏆",
        title: "Excellent Trust Score !",
        message: `Votre score de ${ctx.trustScore}/1000 vous qualifie pour des prêts. Découvrez les avantages premium.`,
        action: { label: "Voir mes avantages", route: "/(tabs)/identity" },
      });
    }
  }

  // ── Streak ─────────────────────────────────────────────────────────────────
  if (ctx.streakWeeks && ctx.streakWeeks >= 4) {
    advice.push({
      id: "streak_great",
      category: "general",
      priority: "low",
      emoji: "🔥",
      title: `${ctx.streakWeeks} semaines consécutives !`,
      message: "Votre régularité est exemplaire. Partagez votre streak pour inspirer votre réseau et gagner des bonus.",
      action: { label: "Voir mes streaks", route: "/streaks" },
    });
  }

  // ── Referral ───────────────────────────────────────────────────────────────
  if (!ctx.referralCount || ctx.referralCount === 0) {
    advice.push({
      id: "referral",
      category: "general",
      priority: "low",
      emoji: "🎁",
      title: "Invitez et gagnez 500 FCFA",
      message: "Parrainez un ami sur HODIX et recevez 500 FCFA de bonus sur votre wallet dès son inscription.",
      action: { label: "Parrainer des amis", route: "/referral" },
    });
  }

  // ── Wallet vide ─────────────────────────────────────────────────────────────
  if (ctx.walletBalance !== undefined && ctx.walletBalance < 1000) {
    advice.push({
      id: "wallet_empty",
      category: "wallet",
      priority: "medium",
      emoji: "💳",
      title: "Rechargez votre wallet",
      message: "Votre solde est faible. Rechargez via Mobile Money pour payer vos cotisations sans interruption.",
      action: { label: "Recharger", route: "/wallet/topup" },
    });
  }

  // Trier par priorité
  const order: Record<AdvicePriority, number> = { high: 0, medium: 1, low: 2 };
  return advice.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 6);
}

export const CATEGORY_COLORS: Record<AdviceCategory, string> = {
  savings:  "#10B981",
  tontines: "#6366F1",
  wallet:   "#3B82F6",
  identity: "#F59E0B",
  budget:   "#EF4444",
  general:  "#8B5CF6",
};
