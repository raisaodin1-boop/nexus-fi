/**
 * Play Store listing assets — feature graphic + phone screenshots (store-ready sizes).
 * Usage: node scripts/generate-play-store-assets.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storeDir = path.join(__dirname, "..", "store", "play");

const BRAND = {
  navy: "#0F2847",
  blue: "#1D4ED8",
  green: "#10B981",
  white: "#FFFFFF",
  slate: "#94A3B8",
  light: "#F8FAFC",
  mid: "#132a4f",
};

function featureGraphicSvg() {
  return `<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${BRAND.navy}"/>
      <stop offset="100%" style="stop-color:${BRAND.mid}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <circle cx="880" cy="80" r="160" fill="${BRAND.blue}" opacity="0.18"/>
  <circle cx="120" cy="420" r="180" fill="${BRAND.green}" opacity="0.14"/>
  <text x="64" y="200" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="700">HODIX</text>
  <text x="64" y="270" fill="${BRAND.slate}" font-family="Arial, Helvetica, sans-serif" font-size="32">Tontines · Wallet MoMo · Trust Score</text>
  <rect x="64" y="320" width="260" height="52" rx="12" fill="${BRAND.green}"/>
  <text x="92" y="355" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700">Épargne africaine</text>
</svg>`;
}

function phoneScreenshotSvg(title, subtitle, badge) {
  return `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1920" fill="${BRAND.light}"/>
  <rect width="1080" height="280" fill="${BRAND.navy}"/>
  <text x="72" y="170" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700">HODIX</text>
  <text x="72" y="230" fill="${BRAND.slate}" font-family="Arial, Helvetica, sans-serif" font-size="28">${badge}</text>
  <rect x="72" y="360" width="936" height="420" rx="36" fill="${BRAND.white}" stroke="#E2E8F0" stroke-width="3"/>
  <text x="120" y="500" fill="${BRAND.navy}" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700">${title}</text>
  <text x="120" y="580" fill="#475569" font-family="Arial, Helvetica, sans-serif" font-size="32">${subtitle}</text>
  <rect x="72" y="840" width="936" height="240" rx="28" fill="${BRAND.white}" stroke="#E2E8F0" stroke-width="3"/>
  <rect x="72" y="1140" width="936" height="240" rx="28" fill="${BRAND.white}" stroke="#E2E8F0" stroke-width="3"/>
  <rect x="72" y="1440" width="936" height="240" rx="28" fill="${BRAND.white}" stroke="#E2E8F0" stroke-width="3"/>
  <rect x="72" y="1740" width="936" height="100" rx="24" fill="${BRAND.green}"/>
  <text x="540" y="1805" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700" text-anchor="middle">www.hodix.app</text>
</svg>`;
}

async function renderPng(svg, outPath, width, height) {
  const sharp = (await import("sharp")).default;
  await sharp(Buffer.from(svg)).resize(width, height).png().toFile(outPath);
}

async function main() {
  fs.mkdirSync(storeDir, { recursive: true });
  const shots = [
    ["phone-01-home.png", "Tableau de bord", "Suivez tontines et épargne en un coup d'œil", "Finance participative"],
    ["phone-02-wallet.png", "Wallet sécurisé", "Mobile Money, transferts et retraits contrôlés", "Paiements CEMAC"],
    ["phone-03-tontine.png", "Tontines digitales", "Cotisations, cycles et confiance communautaire", "Communautés"],
    ["phone-04-trust.png", "Trust Score", "Identité financière portable sur 1000 points", "Crédit alternatif"],
  ];

  await renderPng(featureGraphicSvg(), path.join(storeDir, "feature-graphic.png"), 1024, 500);
  console.log("Wrote feature-graphic.png (1024×500)");

  for (const [name, title, sub, badge] of shots) {
    await renderPng(phoneScreenshotSvg(title, sub, badge), path.join(storeDir, name), 1080, 1920);
    console.log(`Wrote ${name} (1080×1920)`);
  }

  console.log(`Play assets ready in ${storeDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
