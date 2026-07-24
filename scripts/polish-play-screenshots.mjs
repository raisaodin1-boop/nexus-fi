/**
 * Build premium Play Store screenshots from desktop captures of the phone-framed web UI.
 * Crops browser chrome carefully, keeps full UI visible, 1080×1920 brand frame.
 *
 * Usage: node scripts/polish-play-screenshots.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const rawDir = path.join(root, "store", "play", "raw", "screenshots");
const outDir = path.join(root, "store", "play");

const W = 1080;
const H = 1920;
const BRAND = {
  navy: "#0F2847",
  mid: "#132a4f",
  blue: "#1D4ED8",
  green: "#10B981",
  white: "#FFFFFF",
  slate: "#94A3B8",
};

function listRawPngs() {
  return fs
    .readdirSync(rawDir)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort()
    .map((f) => path.join(rawDir, f));
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Find the centered phone panel: columns whose luminance profile
 * differs from the light browser backdrop.
 */
async function findPhoneBounds(filePath) {
  const img = sharp(filePath);
  const { width, height } = await img.metadata();
  const { data } = await img
    .clone()
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const lumAt = (x, y) => {
    const i = (Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };

  // Backdrop from far corners
  const bg =
    (lumAt(8, 8) + lumAt(width - 9, 8) + lumAt(8, height - 9) + lumAt(width - 9, height - 9)) / 4;

  // Column activity: share of pixels clearly not backdrop (step 3 for speed)
  const colAct = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    let hit = 0;
    let n = 0;
    for (let y = Math.floor(height * 0.12); y < height; y += 3) {
      n++;
      if (Math.abs(lumAt(x, y) - bg) > 14) hit++;
    }
    colAct[x] = hit / n;
  }

  // Smooth columns
  const smooth = new Float64Array(width);
  const k = 12;
  for (let x = 0; x < width; x++) {
    let s = 0;
    let c = 0;
    for (let d = -k; d <= k; d++) {
      const xx = x + d;
      if (xx < 0 || xx >= width) continue;
      s += colAct[xx];
      c++;
    }
    smooth[x] = s / c;
  }

  const thr = 0.12;
  let left = 0;
  let right = width - 1;
  for (let x = 0; x < width; x++) {
    if (smooth[x] >= thr) {
      left = x;
      break;
    }
  }
  for (let x = width - 1; x >= 0; x--) {
    if (smooth[x] >= thr) {
      right = x;
      break;
    }
  }

  // Top: skip browser chrome (toolbar ~80–140px on 1800h shots)
  let top = Math.round(height * 0.08);
  // Walk down until phone content density rises
  for (let y = top; y < height * 0.35; y += 2) {
    let hit = 0;
    let n = 0;
    for (let x = left; x <= right; x += 4) {
      n++;
      if (Math.abs(lumAt(x, y) - bg) > 14) hit++;
    }
    if (hit / n > 0.15) {
      top = Math.max(0, y - 4);
      break;
    }
  }

  let bottom = height - 1;
  for (let y = height - 1; y > top; y -= 2) {
    let hit = 0;
    let n = 0;
    for (let x = left; x <= right; x += 4) {
      n++;
      if (Math.abs(lumAt(x, y) - bg) > 14) hit++;
    }
    if (hit / n > 0.08) {
      bottom = y;
      break;
    }
  }

  // Expand slightly so we never clip UI (shadow fringe ok)
  const expandX = Math.round((right - left + 1) * 0.015);
  const expandY = Math.round((bottom - top + 1) * 0.008);
  left = Math.max(0, left - expandX);
  right = Math.min(width - 1, right + expandX);
  top = Math.max(0, top - expandY);
  bottom = Math.min(height - 1, bottom + expandY);

  const cropW = right - left + 1;
  const cropH = bottom - top + 1;

  return { left, top, width: cropW, height: cropH, srcW: width, srcH: height };
}

async function extractPhone(filePath) {
  const b = await findPhoneBounds(filePath);
  console.log(
    `  crop ${path.basename(filePath)} → ${b.width}×${b.height} @ (${b.left},${b.top}) of ${b.srcW}×${b.srcH}`,
  );
  const buf = await sharp(filePath).extract({
    left: b.left,
    top: b.top,
    width: b.width,
    height: b.height,
  }).png().toBuffer();
  const info = await sharp(buf).metadata();
  return { buf, info, bounds: b };
}

function backdropSvg(caption, sub) {
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${BRAND.navy}"/>
      <stop offset="55%" style="stop-color:${BRAND.mid}"/>
      <stop offset="100%" style="stop-color:#0a1a30"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="980" cy="140" r="240" fill="${BRAND.blue}" opacity="0.14"/>
  <circle cx="60" cy="1750" r="280" fill="${BRAND.green}" opacity="0.11"/>
  <text x="64" y="96" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="700">HODIX</text>
  <text x="64" y="150" fill="${BRAND.green}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700">${escapeXml(caption)}</text>
  <text x="64" y="190" fill="${BRAND.slate}" font-family="Arial, Helvetica, sans-serif" font-size="20">${escapeXml(sub)}</text>
</svg>`;
}

async function composeStoreShot({ source, outName, caption, sub }) {
  const { buf: phoneBuf, info } = await extractPhone(source);

  const headerH = 230;
  const sidePad = 56;
  const bottomPad = 56;
  const availW = W - sidePad * 2;
  const availH = H - headerH - bottomPad;

  // Fit entire UI inside safe area (contain)
  const scale = Math.min(availW / info.width, availH / info.height);
  const finalW = Math.round(info.width * scale);
  const finalH = Math.round(info.height * scale);
  const left = Math.round((W - finalW) / 2);
  const top = headerH + Math.round((availH - finalH) / 2);

  const radius = Math.max(28, Math.round(finalW * 0.055));

  const phoneResized = await sharp(phoneBuf)
    .resize(finalW, finalH, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  // Rounded clip WITHOUT eating content — mask matches exact size
  const rounded = await sharp(phoneResized)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${finalW}" height="${finalH}"><rect width="${finalW}" height="${finalH}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
        ),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  // Thin brand bezel
  const bezel = Buffer.from(
    `<svg width="${finalW + 8}" height="${finalH + 8}" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="${finalW + 4}" height="${finalH + 4}" rx="${radius + 2}" ry="${radius + 2}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="3"/>
    </svg>`,
  );

  const shadow = await sharp({
    create: {
      width: finalW + 40,
      height: finalH + 40,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${finalW + 40}" height="${finalH + 40}"><rect x="12" y="16" width="${finalW}" height="${finalH}" rx="${radius}" fill="rgba(0,0,0,0.4)"/></svg>`,
        ),
      },
    ])
    .blur(12)
    .png()
    .toBuffer();

  const backdrop = await sharp(Buffer.from(backdropSvg(caption, sub))).png().toBuffer();

  await sharp(backdrop)
    .composite([
      { input: shadow, left: left - 12, top: top - 8 },
      { input: bezel, left: left - 4, top: top - 4 },
      { input: rounded, left, top },
    ])
    .png({ quality: 100, compressionLevel: 8 })
    .toFile(path.join(outDir, outName));

  console.log(`✓ ${outName} (${finalW}×${finalH} UI on ${W}×${H})`);
}

function featureSvg() {
  return `<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${BRAND.navy}"/>
      <stop offset="100%" style="stop-color:${BRAND.mid}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <circle cx="900" cy="70" r="170" fill="${BRAND.blue}" opacity="0.2"/>
  <circle cx="100" cy="430" r="190" fill="${BRAND.green}" opacity="0.14"/>
  <text x="64" y="200" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="700">HODIX</text>
  <text x="64" y="270" fill="${BRAND.slate}" font-family="Arial, Helvetica, sans-serif" font-size="30">Tontines · Wallet MoMo · Trust Score</text>
  <rect x="64" y="320" width="300" height="54" rx="14" fill="${BRAND.green}"/>
  <text x="92" y="356" fill="${BRAND.white}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700">Épargne de confiance</text>
</svg>`;
}

async function main() {
  const raw = listRawPngs();
  if (raw.length < 3) {
    console.error("Need at least 3 PNGs in store/play/raw/screenshots");
    process.exit(1);
  }

  const plan = [
    {
      source: raw[0],
      outName: "phone-01-home.png",
      caption: "Épargne communautaire",
      sub: "Le réseau mondial de tontines et de réputation financière",
    },
    {
      source: raw[3] ?? raw[1],
      outName: "phone-02-identity.png",
      caption: "Identité financière",
      sub: "Certificat vérifiable · Trust Score portable",
    },
    {
      source: raw[4] ?? raw[2],
      outName: "phone-03-trust.png",
      caption: "Trust Score",
      sub: "Progressez de Bronze à Platinum en toute transparence",
    },
    {
      source: raw[2] ?? raw[1],
      outName: "phone-04-communities.png",
      caption: "Vos communautés",
      sub: "Tontines actives, cotisations et suivi en temps réel",
    },
  ];

  fs.mkdirSync(outDir, { recursive: true });
  for (const stale of ["phone-02-wallet.png", "phone-03-tontine.png", "phone-04-trust.png"]) {
    const p = path.join(outDir, stale);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  for (const item of plan) await composeStoreShot(item);

  await sharp(Buffer.from(featureSvg())).png().toFile(path.join(outDir, "feature-graphic.png"));
  console.log("✓ feature-graphic.png (1024×500)");
  console.log(`Done → ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
