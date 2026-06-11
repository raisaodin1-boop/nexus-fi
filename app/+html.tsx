// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/* SEO */}
        <title>HODIX – Épargne & Tontines Africaines</title>
        <meta
          name="description"
          content="Plateforme africaine de finance participative. Gérez vos tontines, épargnez en groupe et effectuez des paiements en toute sécurité."
        />
        <meta name="theme-color" content="#0B1F3A" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="HODIX" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="HODIX – Épargne & Tontines Africaines" />
        <meta
          property="og:description"
          content="Gérez vos tontines, épargnez en groupe et effectuez des paiements en toute sécurité."
        />
        <meta property="og:locale" content="fr_FR" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="HODIX – Épargne & Tontines Africaines" />
        <meta
          name="twitter:description"
          content="Gérez vos tontines, épargnez en groupe et effectuez des paiements en toute sécurité."
        />

        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />

        <ScrollViewStyleReset />
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
              /* Scrollbar styling */
              ::-webkit-scrollbar { width: 6px; height: 6px; }
              ::-webkit-scrollbar-track { background: #F1F5F9; }
              ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
              ::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
              /* Loading state */
              #splash-screen {
                position: fixed;
                inset: 0;
                background: #0B1F3A;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                transition: opacity 0.4s ease;
              }
              #splash-screen.hidden { opacity: 0; pointer-events: none; }
              @media (min-width: 768px) {
                body { background-color: #CBD5E1; }
              }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
