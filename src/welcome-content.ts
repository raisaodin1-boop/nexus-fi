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
    hero_title: "L'infrastructure financière de la diaspora africaine",
    hero_sub: "Épargne collective, portefeuille multi-devises et score de confiance — de la tradition à la finance moderne.",
    hero_cta: "Créer mon compte",
    hero_secondary: "Découvrir la vision",
    section_trust_title: "Trust Score",
    section_trust_body: "Chaque cotisation renforce votre réputation. Un score portable, vérifiable, reconnu par la communauté.",
    section_wallet_title: "Portefeuille CEMAC & diaspora",
    section_wallet_body: "XAF, XOF, NGN, GHS, EUR, USD — cotisez et retirez en toute sécurité.",
    section_community_title: "Tontines digitales",
    section_community_body: "Njangi, Ajo, Chama, Stokvel — une seule plateforme pour vos cercles d'épargne.",
    footer: "Hodix — Finance communautaire, identité verifiable.",
  },
  en: {
    nav_cta: "Get started",
    hero_title: "Financial infrastructure for the African diaspora",
    hero_sub: "Collective savings, multi-currency wallet and trust score — from tradition to modern finance.",
    hero_cta: "Create account",
    hero_secondary: "Explore the vision",
    section_trust_title: "Trust Score",
    section_trust_body: "Every contribution builds your reputation. A portable, verifiable score recognized by your community.",
    section_wallet_title: "CEMAC & diaspora wallet",
    section_wallet_body: "XAF, XOF, NGN, GHS, EUR, USD — contribute and withdraw securely.",
    section_community_title: "Digital tontines",
    section_community_body: "Njangi, Ajo, Chama, Stokvel — one platform for your savings circles.",
    footer: "Hodix — Community finance, verifiable identity.",
  },
};
