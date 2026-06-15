// Hodix Welcome Screen — African tontine carousel content & i18n

export interface CarouselSlide {
  id: string;
  flag: string;
  country_fr: string;
  country_en: string;
  tontine_name: string;
  greeting_fr: string;
  greeting_en: string;
  // 3-stop gradient for the background
  gradient: [string, string, string];
  // Accent color for geometric pattern overlay
  accent: string;
  // Pattern style key
  pattern: "kente" | "bogolan" | "waves" | "diamonds" | "triangles" | "circles" | "stripes";
}

export const CAROUSEL_SLIDES: CarouselSlide[] = [
  {
    id: "cm",
    flag: "🇨🇲",
    country_fr: "Cameroun",
    country_en: "Cameroon",
    tontine_name: "Njangi",
    greeting_fr: "Bienvenue dans votre Njangi",
    greeting_en: "Welcome to your Njangi",
    gradient: ["#0D2B1A", "#1B4332", "#2D6A4F"],
    accent: "#D4A017",
    pattern: "kente",
  },
  {
    id: "ci",
    flag: "🇨🇮",
    country_fr: "Côte d'Ivoire",
    country_en: "Côte d'Ivoire",
    tontine_name: "Djanguy",
    greeting_fr: "Bienvenue dans votre Djanguy",
    greeting_en: "Welcome to your Djanguy",
    gradient: ["#1A0A00", "#7C3C00", "#FF6B35"],
    accent: "#FFB347",
    pattern: "kente",
  },
  {
    id: "cg",
    flag: "🇨🇬",
    country_fr: "Congo-Brazzaville",
    country_en: "Congo-Brazzaville",
    tontine_name: "Likelemba",
    greeting_fr: "Boyei Malamu na Likelemba",
    greeting_en: "Welcome to your Likelemba",
    gradient: ["#001833", "#023E8A", "#0077B6"],
    accent: "#FBDE4A",
    pattern: "waves",
  },
  {
    id: "cd",
    flag: "🇨🇩",
    country_fr: "RD Congo",
    country_en: "DR Congo",
    tontine_name: "Likelemba",
    greeting_fr: "Boyei Malamu na Likelemba",
    greeting_en: "Welcome to your Likelemba",
    gradient: ["#0A0020", "#2D00F7", "#6A00F4"],
    accent: "#FFD700",
    pattern: "diamonds",
  },
  {
    id: "ga",
    flag: "🇬🇦",
    country_fr: "Gabon",
    country_en: "Gabon",
    tontine_name: "Tontine",
    greeting_fr: "Bienvenue dans votre Tontine",
    greeting_en: "Welcome to your Tontine",
    gradient: ["#001A0D", "#006644", "#009E60"],
    accent: "#FFD700",
    pattern: "stripes",
  },
  {
    id: "sn",
    flag: "🇸🇳",
    country_fr: "Sénégal",
    country_en: "Senegal",
    tontine_name: "Tontine",
    greeting_fr: "Dalal Ak Jamm dans votre Tontine",
    greeting_en: "Welcome to your Tontine",
    gradient: ["#001A00", "#005200", "#007200"],
    accent: "#FBBF24",
    pattern: "bogolan",
  },
  {
    id: "za",
    flag: "🇿🇦",
    country_fr: "Afrique du Sud",
    country_en: "South Africa",
    tontine_name: "Stokvel",
    greeting_fr: "Bienvenue dans votre Stokvel",
    greeting_en: "Welcome to your Stokvel",
    gradient: ["#001A0A", "#007A4D", "#009B60"],
    accent: "#FFB612",
    pattern: "triangles",
  },
  {
    id: "ng",
    flag: "🇳🇬",
    country_fr: "Nigeria",
    country_en: "Nigeria",
    tontine_name: "Ajo",
    greeting_fr: "Bienvenue dans votre Ajo",
    greeting_en: "Welcome to your Ajo",
    gradient: ["#001A0A", "#004D1A", "#008751"],
    accent: "#FFFFFF",
    pattern: "circles",
  },
  {
    id: "gh",
    flag: "🇬🇭",
    country_fr: "Ghana",
    country_en: "Ghana",
    tontine_name: "Susu",
    greeting_fr: "Bienvenue dans votre Susu",
    greeting_en: "Welcome to your Susu",
    gradient: ["#2A0000", "#8B0000", "#CF0921"],
    accent: "#FCD116",
    pattern: "kente",
  },
  {
    id: "ke",
    flag: "🇰🇪",
    country_fr: "Kenya",
    country_en: "Kenya",
    tontine_name: "Chama",
    greeting_fr: "Karibu kwenye Chama",
    greeting_en: "Karibu kwenye Chama",
    gradient: ["#001A00", "#003300", "#006600"],
    accent: "#EF3340",
    pattern: "triangles",
  },
  {
    id: "tz",
    flag: "🇹🇿",
    country_fr: "Tanzanie",
    country_en: "Tanzania",
    tontine_name: "Chama",
    greeting_fr: "Karibu kwenye Chama",
    greeting_en: "Karibu kwenye Chama",
    gradient: ["#001220", "#003366", "#00A3DD"],
    accent: "#1EB53A",
    pattern: "waves",
  },
  {
    id: "sl",
    flag: "🇸🇱",
    country_fr: "Sierra Leone",
    country_en: "Sierra Leone",
    tontine_name: "Osusu",
    greeting_fr: "Bienvenue dans votre Osusu",
    greeting_en: "Welcome to your Osusu",
    gradient: ["#001A09", "#006B28", "#1EB53A"],
    accent: "#0072C6",
    pattern: "stripes",
  },
];

// Final unity slide
export const UNITY_SLIDE = {
  id: "unity",
  gradient: ["#0A0014", "#1A003A", "#2D0066"] as [string, string, string],
  accent: "#F5C842",
};

export const WELCOME_I18N = {
  fr: {
    tagline: "La plateforme panafricaine\nde tontines numériques.",
    cta: "Commencer",
    unity_line1: "Njangi · Djanguy · Likelemba",
    unity_line2: "Stokvel · Ajo · Susu · Chama",
    unity_title: "Des noms différents.",
    unity_sub1: "Une même confiance.",
    unity_sub2: "Une même communauté.",
    unity_brand: "Une seule plateforme.",
  },
  en: {
    tagline: "Africa's Digital\nCommunity Finance Platform.",
    cta: "Get Started",
    unity_line1: "Njangi · Djanguy · Likelemba",
    unity_line2: "Stokvel · Ajo · Susu · Chama",
    unity_title: "Different names.",
    unity_sub1: "One shared trust.",
    unity_sub2: "One community.",
    unity_brand: "One platform.",
  },
};
