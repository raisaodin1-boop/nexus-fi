export interface InsightItem {
  text: string;
  kind: string;
  route: string;
  action_label: string;
}

export function enrichInsight(text: string, kind = "tip"): InsightItem {
  const lower = text.toLowerCase();

  if (lower.includes("kyc") || lower.includes("identité") || lower.includes("profil")) {
    return { text, kind, route: "/kyc", action_label: "Compléter le KYC" };
  }
  if (lower.includes("tontine") || lower.includes("groupe")) {
    return { text, kind, route: "/(tabs)/groups", action_label: "Rejoindre un groupe" };
  }
  if (lower.includes("épargne") || lower.includes("epargne") || lower.includes("objectif")) {
    return { text, kind, route: "/savings/create", action_label: "Créer un objectif" };
  }
  if (lower.includes("cotis") || lower.includes("réguli") || lower.includes("reguli")) {
    return { text, kind, route: "/(tabs)/groups", action_label: "Cotiser maintenant" };
  }
  if (lower.includes("certificat") || lower.includes("document")) {
    return { text, kind, route: "/(tabs)/identity", action_label: "Mes certificats" };
  }
  if (lower.includes("score") || lower.includes("crédit") || lower.includes("credit") || lower.includes("prêt")) {
    return { text, kind, route: "/credit-score", action_label: "Voir mon score" };
  }
  if (lower.includes("wallet") || lower.includes("recharge")) {
    return { text, kind, route: "/wallet/topup", action_label: "Recharger" };
  }
  if (lower.includes("budget")) {
    return { text, kind, route: "/budget", action_label: "Gérer mon budget" };
  }
  if (lower.includes("auto")) {
    return { text, kind, route: "/auto-savings", action_label: "Configurer l'auto-épargne" };
  }
  return { text, kind, route: "/advisor", action_label: "Conseils personnalisés" };
}

export function enrichTips(tips: string[]): InsightItem[] {
  return tips.map((t) => enrichInsight(t));
}
