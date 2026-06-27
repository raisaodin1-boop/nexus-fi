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
    hero_badge: "Njangi · Ajo · Chama · Stokvel · Djanguy",
    hero_title: "Transformez votre communauté d'épargne en véritable identité financière.",
    hero_sub: "Épargnez ensemble, développez votre Trust Score, bâtissez votre réputation financière et ouvrez la porte à de nouvelles opportunités partout en Afrique.",
    hero_cta: "Commencer maintenant",
    hero_secondary: "Découvrir HODIX",
    hero_social: "+12 000 membres · 12 pays · 2 400 groupes",
    hero_tagline: "Votre confiance. Votre réputation. Votre avenir financier.",

    stats_members: "12 000+",
    stats_members_label: "Membres actifs",
    stats_groups: "2 400+",
    stats_groups_label: "Groupes d'épargne",
    stats_countries: "12",
    stats_countries_label: "Pays en Afrique",
    stats_collected: "850M+ XAF",
    stats_collected_label: "Collectés ensemble",

    personas_heading: "HODIX est fait pour vous",
    personas_sub: "Des familles aux entrepreneurs — chaque communauté mérite une infrastructure financière moderne.",
    persona_family: "Familles",
    persona_family_desc: "Préparez l'avenir de vos enfants et gérez votre épargne commune en toute sécurité.",
    persona_merchant: "Commerçants",
    persona_merchant_desc: "Développez votre activité grâce à votre communauté et construisez votre réputation.",
    persona_entrepreneur: "Entrepreneurs",
    persona_entrepreneur_desc: "Accédez à des financements communautaires et bâtissez votre crédibilité financière.",
    persona_association: "Associations",
    persona_association_desc: "Organisez vos cotisations, gérez vos membres et suivez chaque contribution.",
    persona_youth: "Jeunes professionnels",
    persona_youth_desc: "Préparez vos projets d'avenir et construisez un historique financier solide dès maintenant.",
    persona_diaspora: "Diaspora",
    persona_diaspora_desc: "Restez connecté à votre communauté et participez aux tontines depuis n'importe où.",

    diaspora_badge: "DIASPORA",
    diaspora_title: "Votre tontine, depuis Paris, Montréal ou Dubai",
    diaspora_sub: "Cotisez en EUR ou XAF, suivez chaque cycle en temps réel et gardez le lien avec votre famille au pays — sans frais HODIX entre membres.",
    diaspora_cta: "Rejoindre depuis l'étranger",
    diaspora_video_label: "Voir la présentation (2 min)",
    diaspora_points: [
      "Paiement Mobile Money ou carte depuis l'étranger",
      "Notifications à chaque cotisation du groupe",
      "Trust Score reconnu par votre communauté au pays",
    ],

    journey_heading: "Construisez votre réputation financière",
    journey_sub: "Chaque cotisation est une brique de votre avenir financier.",
    journey_step1_title: "Cotisez régulièrement",
    journey_step1_desc: "Rejoignez un groupe, établissez un rythme d'épargne et contribuez chaque cycle.",
    journey_step2_title: "Gagnez des points Trust Score",
    journey_step2_desc: "Chaque paiement à temps renforce votre score et votre réputation dans la communauté.",
    journey_step3_title: "Inspirez confiance",
    journey_step3_desc: "Votre score devient votre carte de visite financière reconnue par tous les membres.",
    journey_step4_title: "Accédez à de nouvelles opportunités",
    journey_step4_desc: "Un score élevé ouvre les portes à davantage de groupes, de financement et de partenaires.",

    showcase_heading: "Une application pensée pour la vraie vie",
    showcase_sub: "Simple, sécurisée et pensée pour votre communauté.",

    section_trust_title: "Trust Score",
    section_trust_body: "Chaque cotisation renforce votre réputation. Un score portable, vérifiable, reconnu par la communauté.",
    section_wallet_title: "Portefeuille multi-devises",
    section_wallet_body: "XAF, XOF, NGN, GHS, EUR, USD — cotisez et retirez en toute sécurité.",
    section_community_title: "Tontines digitales",
    section_community_body: "Njangi, Ajo, Chama, Stokvel — une seule plateforme pour vos cercles d'épargne.",
    section_security_title: "Sécurité & conformité",
    section_security_body: "Chiffrement de bout en bout, KYC intégré et transactions protégées pour chaque membre.",
    security_section_title: "Vos fonds, protégés",
    security_eyebrow: "Sécurité",
    fees_eyebrow: "Frais",
    security_section_sub:
      "HODIX combine sécurité bancaire et transparence communautaire — conçu pour la confiance camerounaise.",
    security_items: [
      { emoji: "🔐", title: "KYC & identité vérifiée", body: "Profil validé, CNI niveau 2, certificats PDF officiels." },
      { emoji: "🛡️", title: "Escrow 1er cycle", body: "Les cotisations du premier cycle sont séquestrées jusqu'à validation du groupe." },
      { emoji: "📱", title: "PIN & biométrie", body: "Verrouillage wallet, OTP SMS sur transactions sensibles, détection fraude." },
      { emoji: "⚖️", title: "Conformité CEMAC", body: "Données chiffrées, hébergement sécurisé, respect des principes RGPD." },
    ],
    fees_section_title: "Transparence totale sur les frais",
    fees_section_sub: "Pas de mauvaise surprise au moment du dépôt ou du retrait.",
    fees_rows: [
      { label: "Cotiser dans votre groupe HODIX", value: "0 FCFA", highlight: true },
      { label: "Transfert wallet → wallet (membre HODIX)", value: "0 FCFA", highlight: true },
      { label: "Payer une cotisation depuis le wallet", value: "0 FCFA", highlight: true },
      { label: "Dépôt Mobile Money (MTN / Orange)", value: "Frais opérateur", highlight: false },
      { label: "Retrait vers MoMo", value: "Frais opérateur", highlight: false },
    ],
    fees_note:
      "L'argent circule gratuitement au sein de HODIX. Les frais Mobile Money ne s'appliquent qu'à l'entrée et à la sortie vers votre opérateur.",
    auction_section_title: "Enchères Tontine — le tour de table en urgence",
    auction_section_sub:
      "Besoin urgent ? Un membre peut « acheter » son tour en proposant une prime. Le surplus est redistribué au groupe — comme au Cameroun, en digital.",
    auction_steps: [
      "L'admin lance les enchères pour le cycle en cours",
      "Les membres enchérissent (prime supplémentaire)",
      "Le gagnant reçoit la cagnotte, le groupe partage la prime",
    ],
    auction_cta: "Créer ma tontine",

    final_title: "Votre confiance.\nVotre réputation.\nVotre avenir financier.",
    final_sub: "Rejoignez 12 000 membres qui bâtissent leur identité financière avec HODIX.",
    final_cta: "Créer mon compte gratuitement",

    footer: "© 2026 HODIX — Finance communautaire, identité vérifiable. · Politique de confidentialité · CGU",
  },
  en: {
    nav_cta: "Get started",
    hero_badge: "Njangi · Ajo · Chama · Stokvel · Djanguy",
    hero_title: "Transform your savings community into a real financial identity.",
    hero_sub: "Save together, grow your Trust Score, build your financial reputation and unlock new opportunities across Africa.",
    hero_cta: "Start now",
    hero_secondary: "Discover HODIX",
    hero_social: "+12,000 members · 12 countries · 2,400 groups",
    hero_tagline: "Your trust. Your reputation. Your financial future.",

    stats_members: "12,000+",
    stats_members_label: "Active members",
    stats_groups: "2,400+",
    stats_groups_label: "Savings groups",
    stats_countries: "12",
    stats_countries_label: "African countries",
    stats_collected: "850M+ XAF",
    stats_collected_label: "Collected together",

    personas_heading: "HODIX is made for you",
    personas_sub: "From families to entrepreneurs — every community deserves modern financial infrastructure.",
    persona_family: "Families",
    persona_family_desc: "Secure your children's future and manage your shared savings safely.",
    persona_merchant: "Merchants",
    persona_merchant_desc: "Grow your business through your community and build your reputation.",
    persona_entrepreneur: "Entrepreneurs",
    persona_entrepreneur_desc: "Access community funding and build your financial credibility.",
    persona_association: "Associations",
    persona_association_desc: "Organize contributions, manage members and track every payment.",
    persona_youth: "Young Professionals",
    persona_youth_desc: "Prepare for your future projects and build a solid financial track record now.",
    persona_diaspora: "Diaspora",
    persona_diaspora_desc: "Stay connected to your community and join tontines from anywhere.",

    diaspora_badge: "DIASPORA",
    diaspora_title: "Your tontine — from Paris, Montreal or Dubai",
    diaspora_sub: "Contribute in EUR or XAF, follow every cycle in real time and stay close to family back home — zero HODIX fees between members.",
    diaspora_cta: "Join from abroad",
    diaspora_video_label: "Watch the 2-min intro",
    diaspora_points: [
      "Pay with Mobile Money or card from abroad",
      "Alerts on every group contribution",
      "Trust Score recognized by your community at home",
    ],

    journey_heading: "Build your financial reputation",
    journey_sub: "Every contribution is a brick in your financial future.",
    journey_step1_title: "Contribute regularly",
    journey_step1_desc: "Join a group, establish a savings rhythm and contribute each cycle.",
    journey_step2_title: "Earn Trust Score points",
    journey_step2_desc: "Every on-time payment boosts your score and reputation in the community.",
    journey_step3_title: "Inspire trust",
    journey_step3_desc: "Your score becomes your financial calling card recognized by all members.",
    journey_step4_title: "Access new opportunities",
    journey_step4_desc: "A high score opens doors to more groups, financing and partners.",

    showcase_heading: "An app designed for real life",
    showcase_sub: "Simple, secure and designed for your community.",

    section_trust_title: "Trust Score",
    section_trust_body: "Every contribution builds your reputation. A portable, verifiable score recognized by your community.",
    section_wallet_title: "Multi-currency wallet",
    section_wallet_body: "XAF, XOF, NGN, GHS, EUR, USD — contribute and withdraw securely.",
    section_community_title: "Digital tontines",
    section_community_body: "Njangi, Ajo, Chama, Stokvel — one platform for your savings circles.",
    section_security_title: "Security & compliance",
    section_security_body: "End-to-end encryption, built-in KYC and protected transactions for every member.",
    security_section_title: "Your funds, protected",
    security_eyebrow: "Security",
    fees_eyebrow: "Fees",
    security_section_sub:
      "HODIX combines banking-grade security with community transparency — built for real trust.",
    security_items: [
      { emoji: "🔐", title: "KYC & verified identity", body: "Validated profile, ID level 2, official PDF certificates." },
      { emoji: "🛡️", title: "Cycle 1 escrow", body: "First-cycle contributions held in escrow until the group is validated." },
      { emoji: "📱", title: "PIN & biometrics", body: "Wallet lock, SMS OTP on sensitive transactions, fraud detection." },
      { emoji: "⚖️", title: "CEMAC compliance", body: "Encrypted data, secure hosting, GDPR-aligned principles." },
    ],
    fees_section_title: "Full fee transparency",
    fees_section_sub: "No surprises when you deposit or withdraw.",
    fees_rows: [
      { label: "Contribute within your HODIX group", value: "0 XAF", highlight: true },
      { label: "Wallet → wallet transfer (HODIX member)", value: "0 XAF", highlight: true },
      { label: "Pay contribution from wallet", value: "0 XAF", highlight: true },
      { label: "Mobile Money top-up (MTN / Orange)", value: "Operator fees", highlight: false },
      { label: "Withdraw to MoMo", value: "Operator fees", highlight: false },
    ],
    fees_note:
      "Money moves free inside HODIX. Mobile Money fees apply only when entering or leaving via your operator.",
    auction_section_title: "Tontine Auctions — urgent turn bidding",
    auction_section_sub:
      "Need cash fast? A member can bid for this cycle's pot with a premium. Surplus is shared with the group — familiar culture, digital execution.",
    auction_steps: [
      "Admin opens auctions for the current cycle",
      "Members bid (extra premium)",
      "Winner takes the pot, the group shares the premium",
    ],
    auction_cta: "Create my tontine",

    final_title: "Your trust.\nYour reputation.\nYour financial future.",
    final_sub: "Join 12,000 members building their financial identity with HODIX.",
    final_cta: "Create my free account",

    footer: "© 2026 HODIX — Community finance, verifiable identity. · Privacy Policy · Terms",
  },
};
