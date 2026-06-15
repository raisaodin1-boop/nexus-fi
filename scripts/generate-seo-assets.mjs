/**
 * Generates branded PNG assets for OG tags, PWA manifest and image sitemap.
 * Runs before expo export so files land in public/ and dist/.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const BRAND = {
  navy: "#0B1F3A",
  blue: "#1D4ED8",
  green: "#10B981",
  white: "#FFFFFF",
  slate: "#94A3B8",
  light: "#F8FAFC",
};

function ogSvg() {
  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${BRAND.navy}"/>
      <stop offset="100%" style="stop-color:#132a4f"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1050" cy="120" r="180" fill="${BRAND.blue}" opacity="0.15"/>
  <circle cx="150" cy="520" r="220" fill="${BRAND.green}" opacity="0.12"/>
  <text x="72" y="220" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="700">HODIX</text>
  <text x="72" y="290" fill="${BRAND.slate}" font-family="Arial, Helvetica, sans-serif" font-size="36">Tontines Digitales &amp; Épargne Africaine</text>
  <text x="72" y="380" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="28" opacity="0.9">Wallet Mobile Money · Trust Score · CEMAC</text>
  <rect x="72" y="430" width="280" height="56" rx="12" fill="${BRAND.green}"/>
  <text x="102" y="468" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700">www.hodix.app</text>
</svg>`;
}

function iconSvg(size) {
  const fontSize = Math.round(size * 0.28);
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="${BRAND.navy}"/>
  <text x="50%" y="54%" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle" dominant-baseline="middle">H</text>
</svg>`;
}

function screenshotSvg(title, subtitle) {
  return `<svg width="390" height="844" xmlns="http://www.w3.org/2000/svg">
  <rect width="390" height="844" fill="${BRAND.light}"/>
  <rect width="390" height="120" fill="${BRAND.navy}"/>
  <text x="24" y="72" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700">HODIX</text>
  <rect x="24" y="150" width="342" height="200" rx="16" fill="${BRAND.white}" stroke="#E2E8F0" stroke-width="2"/>
  <text x="44" y="210" fill="${BRAND.navy}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700">${title}</text>
  <text x="44" y="250" fill="#475569" font-family="Arial, Helvetica, sans-serif" font-size="16">${subtitle}</text>
  <rect x="24" y="380" width="342" height="120" rx="16" fill="${BRAND.white}" stroke="#E2E8F0" stroke-width="2"/>
  <rect x="24" y="530" width="342" height="120" rx="16" fill="${BRAND.white}" stroke="#E2E8F0" stroke-width="2"/>
  <rect x="24" y="680" width="342" height="56" rx="12" fill="${BRAND.green}"/>
  <text x="195" y="714" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" text-anchor="middle">hodix.app</text>
</svg>`;
}

async function renderPng(svg, outPath, width, height) {
  const sharp = (await import("sharp")).default;
  await sharp(Buffer.from(svg)).resize(width, height).png().toFile(outPath);
}

async function main() {
  try {
    await import("sharp");
  } catch {
    console.warn("[seo-assets] sharp not installed — skipping PNG generation");
    return;
  }

  fs.mkdirSync(publicDir, { recursive: true });

  const jobs = [
    { svg: ogSvg(), file: "og-image.png", w: 1200, h: 630 },
    { svg: iconSvg(32), file: "favicon.png", w: 32, h: 32 },
    { svg: iconSvg(192), file: "icon-192.png", w: 192, h: 192 },
    { svg: iconSvg(512), file: "icon-512.png", w: 512, h: 512 },
    { svg: iconSvg(512), file: "icon.png", w: 512, h: 512 },
    {
      svg: screenshotSvg("Accueil", "Tontines · Épargne · Wallet"),
      file: "screenshot-home.png",
      w: 390,
      h: 844,
    },
    {
      svg: screenshotSvg("Wallet", "XAF · EUR · USD"),
      file: "screenshot-wallet.png",
      w: 390,
      h: 844,
    },
    {
      svg: screenshotSvg("Tontines", "Njangi · Likelemba · Djangui"),
      file: "screenshot-tontine.png",
      w: 390,
      h: 844,
    },
  ];

  for (const { svg, file, w, h } of jobs) {
    const out = path.join(publicDir, file);
    await renderPng(svg, out, w, h);
    console.log(`[seo-assets] ${file}`);
  }

  console.log("[seo-assets] Done → public/");
}

main().catch((err) => {
  console.error("[seo-assets] Failed:", err);
  process.exit(1);
});
