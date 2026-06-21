// Hodix Welcome Screen — vision-first copy & i18n

export interface CarouselSlide {
  id: string;
  flag: string;
  country_fr: string;
  country_en: string;
  tontine_name: string;
  greeting_fr: string;
  greeting_en: string;
  gradient: [string, string, string];
  accent: string;
  pattern: "kente" | "bogolan" | "waves" | "diamonds" | "triangles" | "circles" | "stripes";
}

/** Cultural carousel — subtle, not the main message */
export const CAROUSEL_SLIDES: CarouselSlide[] = [
  {
    id: "cm", flag: "🇨🇲", country_fr: "Cameroun", country_en: "Cameroon",
    tontine_name: "Njangi", greeting_fr: "Njangi · Cameroun", greeting_en: "Njangi · Cameroon",
    gradient: ["#0B1F3A", "#0F2847", "#1E56A0"], accent: "#10B981", pattern: "waves",
  },
  {
    id: "ci", flag: "🇨🇮", country_fr: "Côte d'Ivoire", country_en: "Côte d'Ivoire",
    tontine_name: "Djanguy", greeting_fr: "Djanguy · Côte d'Ivoire", greeting_en: "Djanguy · Côte d'Ivoire",
    gradient: ["#0B1F3A", "#132238", "#0F766E"], accent: "#C9A227", pattern: "diamonds",
  },
  {
    id: "sn", flag: "🇸🇳", country_fr: "Sénégal", country_en: "Senegal",
    tontine_name: "Tontine", greeting_fr: "Tontine · Sénégal", greeting_en: "Tontine · Senegal",
    gradient: ["#0A1628", "#0F2847", "#10B981"], accent: "#C9A227", pattern: "circles",
  },
  {
    id: "ng", flag: "🇳🇬", country_fr: "Nigeria", country_en: "Nigeria",
    tontine_name: "Ajo", greeting_fr: "Ajo · Nigeria", greeting_en: "Ajo · Nigeria",
    gradient: ["#0B1F3A", "#1A3A5C", "#0F766E"], accent: "#10B981", pattern: "stripes",
  },
  {
    id: "za", flag: "🇿🇦", country_fr: "Afrique du Sud", country_en: "South Africa",
    tontine_name: "Stokvel", greeting_fr: "Stokvel · Afrique du Sud", greeting_en: "Stokvel · South Africa",
    gradient: ["#0A1628", "#0F2847", "#1E56A0"], accent: "#C9A227", pattern: "triangles",
  },
];

export const UNITY_SLIDE = {
  id: "unity",
  gradient: ["#0B1F3A", "#0F2847", "#132238"] as [string, string, string],
  accent: "#C9A227",
};

export const WELCOME_I18N = {
  fr: {
    hero_line1: "Transformez votre tontine",
    hero_line2: "en historique financier.",
    hero_sub:
      "Épargnez, cotisez, empruntez et bâtissez votre réputation financière partout en Afrique.",
    vision_tag:
      "Ce n'est pas seulement une application — c'est une infrastructure financière communautaire.",
    trust_title: "Votre Trust Score : votre nouvelle réputation financière",
    trust_sub:
      "Plus vous cotisez régulièrement, plus votre score augmente et plus vous inspirez confiance.",
    tagline: "Le pont entre la finance informelle et la finance moderne.",
    cta: "Commencer mon parcours",
    unity_line1: "Njangi · Djanguy · Likelemba · Stokvel",
    unity_line2: "Ajo · Susu · Chama · Osusu",
    unity_title: "Une seule infrastructure.",
    unity_sub1: "Des traditions millénaires.",
    unity_sub2: "Une identité financière vérifiable.",
    unity_brand: "Partout en Afrique.",
  },
  en: {
    hero_line1: "Turn your tontine",
    hero_line2: "into financial history.",
    hero_sub:
      "Save, contribute, borrow, and build your financial reputation across Africa.",
    vision_tag:
      "Not just an app — a community financial infrastructure.",
    trust_title: "Your Trust Score: your new financial reputation",
    trust_sub:
      "The more regularly you contribute, the higher your score — and the more trust you inspire.",
    tagline: "The bridge between informal and modern finance.",
    cta: "Start my journey",
    unity_line1: "Njangi · Djanguy · Likelemba · Stokvel",
    unity_line2: "Ajo · Susu · Chama · Osusu",
    unity_title: "One infrastructure.",
    unity_sub1: "Ancient traditions.",
    unity_sub2: "A verifiable financial identity.",
    unity_brand: "Across Africa.",
  },
};

/** Post-login dashboard hero — same vision narrative, personalized. */
export const DASHBOARD_HERO_I18N = {
  fr: {
    greeting: (name: string) => (name ? `Bonjour, ${name}` : "Bonjour"),
    headline: "Votre identité financière vérifiable",
    subline: "Épargne, tontine et crédit — un seul score de confiance.",
    trust_cta: "Voir mon identité",
    wallet_cta: "Mon portefeuille",
    saved_label: "Épargné",
    score_label: "Trust Score",
    vision_chip: "Njangi · Ajo · Chama · Stokvel",
  },
  en: {
    greeting: (name: string) => (name ? `Hello, ${name}` : "Hello"),
    headline: "Your verifiable financial identity",
    subline: "Savings, tontine and credit — one trust score.",
    trust_cta: "View my identity",
    wallet_cta: "My wallet",
    saved_label: "Saved",
    score_label: "Trust Score",
    vision_chip: "Njangi · Ajo · Chama · Stokvel",
  },
};

/** Marketing landing sections (web). */
export const LANDING_I18N = {
  fr: {
    nav_cta: "Commencer",
    slogan: "Votre confiance. Votre réputation. Votre avenir financier.",
    hero_title: "Transformez votre communauté d'épargne en véritable identité financière.",
    hero_sub:
      "Épargnez ensemble, développez votre Trust Score, bâtissez votre réputation financière et ouvrez la porte à de nouvelles opportunités partout en Afrique.",
    hero_cta: "Commencer maintenant",
    hero_secondary: "Découvrir HODIX",
    hero_chip: "Infrastructure financière communautaire",
    emotional_title: "Fait pour vous, où que vous soyez",
    emotional_sub:
      "Familles, commerçants, entrepreneurs, associations et jeunes professionnels — construisez votre avenir financier ensemble.",
    personas: [
      { label: "Familles", emoji: "👨‍👩‍👧" },
      { label: "Commerçants", emoji: "🏪" },
      { label: "Entrepreneurs", emoji: "💼" },
      { label: "Associations", emoji: "🤝" },
      { label: "Jeunes pros", emoji: "🎓" },
    ],
    trust_section_title: "Construisez votre réputation financière",
    trust_section_sub:
      "Chaque cotisation compte. Votre Trust Score grandit avec vous et ouvre de nouvelles portes.",
    trust_steps: [
      { emoji: "📈", title: "Cotisez régulièrement", body: "Chaque dépôt et chaque cycle renforce votre historique." },
      { emoji: "⭐", title: "Gagnez des points de Trust Score", body: "Un score portable sur 1000 points, vérifiable." },
      { emoji: "🤝", title: "Inspirez confiance", body: "Votre communauté et vos partenaires vous reconnaissent." },
      { emoji: "🚀", title: "Accédez à plus d'opportunités", body: "Crédit, épargne premium et services exclusifs demain." },
    ],
    app_section_title: "L'application HODIX en action",
    app_section_sub: "Tableau de bord, portefeuille, Trust Score et cotisations — une expérience fintech premium.",
    app_screens: [
      { id: "dashboard", label: "Tableau de bord" },
      { id: "wallet", label: "Portefeuille" },
      { id: "trust", label: "Trust Score" },
      { id: "contributions", label: "Cotisations" },
      { id: "groups", label: "Groupes" },
    ],
    section_trust_title: "Trust Score",
    section_trust_body:
      "Chaque cotisation renforce votre réputation. Un score portable, vérifiable, reconnu par la communauté.",
    section_wallet_title: "Portefeuille CEMAC & diaspora",
    section_wallet_body: "XAF, XOF, NGN, GHS, EUR, USD — cotisez et retirez en toute sécurité.",
    section_community_title: "Communautés d'épargne",
    section_community_body:
      "Njangi, Ajo, Chama, Stokvel — une infrastructure moderne pour vos cercles de confiance.",
    final_cta_title: "Rejoignez l'infrastructure financière communautaire africaine",
    final_cta_sub: "Cotisez aujourd'hui. Construisez votre avenir demain.",
    footer: "HODIX — Votre confiance. Votre réputation. Votre avenir financier.",
  },
  en: {
    nav_cta: "Get started",
    slogan: "Your trust. Your reputation. Your financial future.",
    hero_title: "Turn your savings community into a true financial identity.",
    hero_sub:
      "Save together, grow your Trust Score, build your financial reputation and unlock new opportunities across Africa.",
    hero_cta: "Start now",
    hero_secondary: "Discover HODIX",
    hero_chip: "Community financial infrastructure",
    emotional_title: "Built for you, wherever you are",
    emotional_sub:
      "Families, merchants, entrepreneurs, associations and young professionals — build your financial future together.",
    personas: [
      { label: "Families", emoji: "👨‍👩‍👧" },
      { label: "Merchants", emoji: "🏪" },
      { label: "Entrepreneurs", emoji: "💼" },
      { label: "Associations", emoji: "🤝" },
      { label: "Young pros", emoji: "🎓" },
    ],
    trust_section_title: "Build your financial reputation",
    trust_section_sub:
      "Every contribution counts. Your Trust Score grows with you and opens new doors.",
    trust_steps: [
      { emoji: "📈", title: "Contribute regularly", body: "Every deposit and cycle strengthens your track record." },
      { emoji: "⭐", title: "Earn Trust Score points", body: "A portable, verifiable score out of 1000." },
      { emoji: "🤝", title: "Inspire confidence", body: "Your community and partners recognize your reliability." },
      { emoji: "🚀", title: "Access more opportunities", body: "Credit, premium savings and exclusive services tomorrow." },
    ],
    app_section_title: "HODIX in action",
    app_section_sub: "Dashboard, wallet, Trust Score and contributions — a premium fintech experience.",
    app_screens: [
      { id: "dashboard", label: "Dashboard" },
      { id: "wallet", label: "Wallet" },
      { id: "trust", label: "Trust Score" },
      { id: "contributions", label: "Contributions" },
      { id: "groups", label: "Groups" },
    ],
    section_trust_title: "Trust Score",
    section_trust_body:
      "Every contribution builds your reputation. A portable, verifiable score recognized by your community.",
    section_wallet_title: "CEMAC & diaspora wallet",
    section_wallet_body: "XAF, XOF, NGN, GHS, EUR, USD — contribute and withdraw securely.",
    section_community_title: "Savings communities",
    section_community_body:
      "Njangi, Ajo, Chama, Stokvel — modern infrastructure for your circles of trust.",
    final_cta_title: "Join Africa's community financial infrastructure",
    final_cta_sub: "Contribute today. Build your tomorrow.",
    footer: "HODIX — Your trust. Your reputation. Your financial future.",
  },
};
