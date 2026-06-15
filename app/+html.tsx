// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// JSON-LD Structured Data — indexé par Google & compris par les IAs
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.hodix.app/#organization",
      name: "HODIX",
      url: "https://www.hodix.app",
      logo: {
        "@type": "ImageObject",
        url: "https://www.hodix.app/icon.png",
        width: 512,
        height: 512,
      },
      description:
        "Plateforme africaine de finance participative. Gérez vos tontines, épargnez en groupe et effectuez des paiements sécurisés en Afrique centrale et subsaharienne.",
      foundingDate: "2024",
      foundingLocation: {
        "@type": "Place",
        name: "Douala, Cameroun",
        addressCountry: "CM",
      },
      contactPoint: [
        {
          "@type": "ContactPoint",
          email: "support@hodix.app",
          contactType: "customer support",
          availableLanguage: ["French", "English"],
        },
        {
          "@type": "ContactPoint",
          email: "privacy@hodix.app",
          contactType: "Data Protection Officer",
        },
      ],
      sameAs: [
        "https://play.google.com/store/apps/details?id=app.hodix.mobile",
        "https://apps.apple.com/app/hodix/id0000000000",
      ],
      areaServed: [
        { "@type": "Country", name: "Cameroon" },
        { "@type": "Country", name: "Ivory Coast" },
        { "@type": "Country", name: "Senegal" },
        { "@type": "Country", name: "Gabon" },
        { "@type": "Country", name: "Congo" },
        { "@type": "Country", name: "Chad" },
        { "@type": "Country", name: "France" },
        { "@type": "Country", name: "Belgium" },
        { "@type": "Country", name: "United States" },
      ],
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.hodix.app/#app",
      name: "HODIX — Tontines & Épargne",
      operatingSystem: ["Android", "iOS", "Web"],
      applicationCategory: "FinanceApplication",
      applicationSubCategory: "Personal Finance, Savings, Group Finance",
      url: "https://www.hodix.app",
      description:
        "HODIX digitalise les tontines africaines (njangi, likelemba, djangui) et offre un wallet multi-devises, un Trust Score, des certificats financiers officiels et des outils d'épargne participative.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "XAF",
        description: "Application gratuite avec services premium optionnels",
      },
      featureList: [
        "Gestion de tontines digitales",
        "Épargne individuelle et collective",
        "Wallet multi-devises XAF/EUR/USD",
        "Mobile Money (MTN, Orange)",
        "Trust Score financier sur 1000 points",
        "Score de crédit sur 5 composantes",
        "Certificats PDF officiels vérifiables",
        "KYC niveau 1 et 2",
        "Transferts instantanés",
        "QR Code de paiement",
        "Gestion de coopératives et associations",
        "Streaks et récompenses de cotisation",
      ],
      screenshot: "https://www.hodix.app/og-image.png",
      inLanguage: "fr-FR",
      author: { "@id": "https://www.hodix.app/#organization" },
      publisher: { "@id": "https://www.hodix.app/#organization" },
      downloadUrl: "https://www.hodix.app",
    },
    {
      "@type": "WebSite",
      "@id": "https://www.hodix.app/#website",
      url: "https://www.hodix.app",
      name: "HODIX",
      description: "Plateforme africaine d'épargne et tontines digitales",
      publisher: { "@id": "https://www.hodix.app/#organization" },
      inLanguage: "fr-FR",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://www.hodix.app/tontines/directory?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "FAQPage",
      "@id": "https://www.hodix.app/#faq",
      mainEntity: [
        {
          "@type": "Question",
          name: "Qu'est-ce qu'une tontine digitale HODIX ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Une tontine digitale HODIX est une modernisation du système d'épargne collective africain traditionnel (njangi au Cameroun, likelemba au Congo). Les membres d'un groupe cotisent une somme fixe à intervalle régulier, et chacun reçoit à tour de rôle la cagnotte totale. HODIX automatise ce processus de manière transparente, sécurisée et accessible depuis votre smartphone.",
          },
        },
        {
          "@type": "Question",
          name: "HODIX est-il disponible en dehors de l'Afrique ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Oui. HODIX est disponible partout dans le monde, notamment pour la diaspora africaine en France, Belgique, Suisse, Canada et aux États-Unis. L'application supporte les devises XAF, EUR et USD avec taux de change en temps réel.",
          },
        },
        {
          "@type": "Question",
          name: "Qu'est-ce que le Trust Score HODIX ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Le Trust Score HODIX est un score sur 1000 points qui mesure votre fiabilité financière. Il se compose d'un bonus d'inscription (5 pts), de points de transaction (0,5 à 1 pt par transaction selon le montant), et d'un bonus annuel d'activité (5 pts/an). Un score élevé donne accès à des niveaux Bronze, Silver, Gold ou Platinum avec des avantages exclusifs.",
          },
        },
        {
          "@type": "Question",
          name: "Comment recharger mon wallet HODIX ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Vous pouvez recharger votre wallet HODIX via MTN Mobile Money ou Orange Money. Dans l'application, allez dans Wallet → Recharger, entrez le montant souhaité, puis confirmez avec votre code Mobile Money. Le solde est crédité instantanément.",
          },
        },
        {
          "@type": "Question",
          name: "Les données personnelles sont-elles sécurisées ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "HODIX respecte le Règlement CEMAC sur la protection des données personnelles et les principes du RGPD européen. Toutes les données sont chiffrées (AES-256), hébergées sur des serveurs sécurisés, et ne sont jamais revendues à des tiers. Un Délégué à la Protection des Données (DPO) est disponible à privacy@hodix.app.",
          },
        },
        {
          "@type": "Question",
          name: "Quels sont les pays supportés par HODIX ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "HODIX est disponible au Cameroun, en Côte d'Ivoire, au Sénégal, au Gabon, au Congo, en RD Congo, au Tchad, en Centrafrique, en Guinée Équatoriale, et dans la diaspora africaine en France, Belgique, Suisse, USA et Canada. Le paiement Mobile Money est disponible pour MTN et Orange dans les pays CEMAC.",
          },
        },
        {
          "@type": "Question",
          name: "Comment fonctionne le KYC sur HODIX ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Le KYC (Know Your Customer) de HODIX comporte 2 niveaux. Niveau 1 : remplissez vos informations de base (nom complet, téléphone, date de naissance, adresse). Niveau 2 : soumettez une photo de votre CNI ou passeport + un selfie, validé par l'équipe HODIX. Un KYC complet débloque des limites de transaction plus élevées et l'accès aux certificats officiels.",
          },
        },
      ],
    },
    {
      "@type": "FinancialService",
      "@id": "https://www.hodix.app/#service",
      name: "HODIX Financial Services",
      provider: { "@id": "https://www.hodix.app/#organization" },
      serviceType: "Digital Savings and Group Finance",
      description: "Épargne participative, tontines digitales, wallet mobile, transferts et certificats financiers pour l'Afrique",
      areaServed: "Afrique subsaharienne, zone CEMAC, diaspora africaine",
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Services HODIX",
        itemListElement: [
          {
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: "Gestion de tontines digitales",
              description: "Créez et gérez des tontines avec gestion automatique des cycles, cotisations et disbursements",
            },
            price: "0",
            priceCurrency: "XAF",
          },
          {
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: "Certificat Authentifié VIP",
              description: "Certificat officiel PDF avec tampon HODIX et code de vérification unique",
            },
            price: "10000",
            priceCurrency: "XAF",
          },
        ],
      },
    },
  ],
};

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* ── Titre & Description ─────────────────────────────────────── */}
        <title>HODIX – Tontines Digitales & Épargne Africaine | Wallet Mobile</title>
        <meta
          name="description"
          content="HODIX digitalise les tontines africaines (njangi, likelemba, djangui). Gérez vos groupes d'épargne, transférez via Mobile Money MTN/Orange, et obtenez votre Trust Score financier. Disponible au Cameroun, Côte d'Ivoire, Sénégal, Gabon et diaspora."
        />
        <meta
          name="keywords"
          content="tontine digitale, tontine cameroun, épargne africaine, njangi, likelemba, djangui, mobile money, MTN money, orange money, wallet africain, fintech afrique, CEMAC, épargne participative, score de crédit africain, hodix"
        />
        <meta name="author" content="HODIX" />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <link rel="canonical" href="https://www.hodix.app/" />

        {/* ── PWA & App ──────────────────────────────────────────────── */}
        <meta name="theme-color" content="#0B1F3A" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="HODIX" />
        <meta name="application-name" content="HODIX" />
        <link rel="manifest" href="/manifest.json" />

        {/* ── Géolocalisation & Langue ────────────────────────────────── */}
        <meta name="geo.region" content="CM" />
        <meta name="geo.placename" content="Douala, Cameroun" />
        <meta name="language" content="French" />
        <meta httpEquiv="content-language" content="fr" />
        <link rel="alternate" hreflang="fr" href="https://www.hodix.app/" />
        <link rel="alternate" hreflang="fr-CM" href="https://www.hodix.app/" />
        <link rel="alternate" hreflang="fr-CI" href="https://www.hodix.app/" />
        <link rel="alternate" hreflang="fr-SN" href="https://www.hodix.app/" />
        <link rel="alternate" hreflang="x-default" href="https://www.hodix.app/" />

        {/* ── Open Graph ─────────────────────────────────────────────── */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="HODIX" />
        <meta property="og:url" content="https://www.hodix.app/" />
        <meta property="og:title" content="HODIX – Tontines Digitales & Épargne Africaine" />
        <meta
          property="og:description"
          content="La première super-app fintech africaine. Gérez vos tontines (njangi, likelemba), épargnez en groupe, transférez via Mobile Money MTN/Orange, et obtenez votre Trust Score. Cameroun, Côte d'Ivoire, Sénégal, diaspora."
        />
        <meta property="og:image" content="https://www.hodix.app/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="HODIX – Tontines digitales africaines" />
        <meta property="og:locale" content="fr_FR" />
        <meta property="og:locale:alternate" content="fr_CM" />

        {/* ── Twitter / X Card ───────────────────────────────────────── */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@hodix_app" />
        <meta name="twitter:creator" content="@hodix_app" />
        <meta name="twitter:title" content="HODIX – Tontines Digitales & Épargne Africaine" />
        <meta
          name="twitter:description"
          content="Digitalisez vos tontines, gérez votre épargne collective et transférez via Mobile Money. Trust Score financier inclus. 🌍"
        />
        <meta name="twitter:image" content="https://www.hodix.app/og-image.png" />

        {/* ── App Store Links ─────────────────────────────────────────── */}
        <meta name="apple-itunes-app" content="app-id=0000000000" />
        <meta name="google-play-app" content="app-id=app.hodix.mobile" />

        {/* ── LLMs & AI crawlers ─────────────────────────────────────── */}
        {/* Décrit HODIX aux IA generatives (ChatGPT, Claude, Perplexity) */}
        <link rel="ai-description" href="https://www.hodix.app/llms.txt" />
        <link rel="alternate" type="text/markdown" href="https://www.hodix.app/hodix.md" title="HODIX Markdown Mirror" />

        {/* ── Sitemap & SEO technique ─────────────────────────────────── */}
        <link rel="sitemap" type="application/xml" href="https://www.hodix.app/sitemap-index.xml" />
        <link rel="alternate" type="text/html" href="https://www.hodix.app/seo.html" title="HODIX — Page SEO" />

        {/* ── Fonts ──────────────────────────────────────────────────── */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />

        {/* ── JSON-LD Structured Data ─────────────────────────────────── */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />

        <ScrollViewStyleReset />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(location.hostname==="hodix.app"){location.replace("https://www.hodix.app"+location.pathname+location.search+location.hash);}if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){});});}})();`,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              *, *::before, *::after { box-sizing: border-box; }
              html, body { height: 100%; margin: 0; padding: 0; }
              body {
                margin: 0;
                min-height: 100%;
                min-height: 100dvh;
                overflow: hidden;
                overflow-x: hidden;
                display: flex;
                flex-direction: column;
                background-color: #F7F8FC;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                -webkit-text-size-adjust: 100%;
                touch-action: manipulation;
                -webkit-tap-highlight-color: transparent;
                padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
              }
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; }
              input, textarea, select { font-size: 16px !important; }
              button, [role="button"], a { touch-action: manipulation; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
              ::-webkit-scrollbar { width: 6px; height: 6px; }
              ::-webkit-scrollbar-track { background: #F1F5F9; }
              ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
              ::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
              #splash-screen {
                position: fixed; inset: 0;
                background: #0B1F3A;
                display: flex; align-items: center; justify-content: center;
                z-index: 9999; transition: opacity 0.4s ease;
              }
              #splash-screen.hidden { opacity: 0; pointer-events: none; }
              @media (min-width: 768px) {
                body { background-color: #CBD5E1; }
              }
            `,
          }}
        />
      </head>
      <body style={{ margin: 0, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <noscript>
          <div style={{ padding: 24, maxWidth: 720, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
            <h1>HODIX — Tontines Digitales &amp; Épargne Africaine</h1>
            <p>
              HODIX digitalise les tontines africaines (njangi, likelemba, djangui). Gérez vos groupes
              d&apos;épargne, transférez via Mobile Money et construisez votre Trust Score financier.
            </p>
            <p>
              <a href="https://www.hodix.app/seo.html">Découvrir HODIX</a>
              {" · "}
              <a href="https://www.hodix.app/register">Créer un compte</a>
              {" · "}
              <a href="https://www.hodix.app/tontines/directory">Annuaire tontines</a>
              {" · "}
              <a href="https://www.hodix.app/privacy">Confidentialité</a>
            </p>
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
