/** Social badges derived from Trust Score and activity — shareable on WhatsApp. */
export interface SocialBadge {
  id: string;
  emoji: string;
  label: string;
  unlocked: boolean;
}

export function computeSocialBadges(input: {
  trustScore: number;
  totalSaved: number;
  contributionsMade: number;
  referralCount?: number;
}): SocialBadge[] {
  const { trustScore, totalSaved, contributionsMade, referralCount = 0 } = input;
  return [
    { id: "maven", emoji: "🥇", label: "Tontine Maven", unlocked: contributionsMade >= 10 },
    { id: "million", emoji: "💰", label: "Millionnaire XAF", unlocked: totalSaved >= 1_000_000 },
    { id: "network", emoji: "🤝", label: "Network Builder", unlocked: referralCount >= 3 },
    { id: "trusted", emoji: "⭐", label: "Membre de confiance", unlocked: trustScore >= 60 },
    { id: "pillar", emoji: "🏆", label: "Pilier communauté", unlocked: trustScore >= 80 },
  ];
}

export function buildBadgeShareMessage(badges: SocialBadge[], userName: string): string {
  const unlocked = badges.filter((b) => b.unlocked);
  const list = unlocked.length
    ? unlocked.map((b) => `${b.emoji} ${b.label}`).join("\n")
    : "⭐ Membre actif HODIX";
  return `Mon identité financière sur HODIX — ${userName}\n\n${list}\n\nRejoignez-moi : https://www.hodix.app/register`;
}
