/**
 * Generates Apple App Site Association + Android Asset Links for universal links.
 * Set APPLE_TEAM_ID and ANDROID_SHA256_FINGERPRINT in env (or Vercel project settings).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", ".well-known");

const teamId = process.env.APPLE_TEAM_ID || process.env.EXPO_PUBLIC_APPLE_TEAM_ID || "REPLACE_WITH_APPLE_TEAM_ID";
const sha256 = process.env.ANDROID_SHA256_FINGERPRINT || process.env.EXPO_PUBLIC_ANDROID_SHA256_FINGERPRINT || "B0:9C:FC:94:88:E4:CC:C6:D3:A7:20:3C:9F:52:CE:45:02:68:42:64:59:8D:18:2A:F0:45:9C:24:31:E2:B0:02";
const bundleId = "com.hodix.app";
const appId = `${teamId}.${bundleId}`;

const linkPaths = [
  "/tontines/join*",
  "/associations/join*",
  "/cooperatives/join*",
  "/pay*",
  "/auth/callback*",
  "/credit-score",
  "/welcome",
  "/login",
  "/register",
  "/tontines/directory*",
  "/wallet*",
  "/notifications",
];

const aasa = {
  applinks: {
    apps: [],
    details: [
      {
        appID: appId,
        paths: linkPaths,
      },
    ],
  },
  webcredentials: {
    apps: [appId],
  },
};

const assetlinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: bundleId,
      sha256_cert_fingerprints: [sha256],
    },
  },
];

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "apple-app-site-association"), JSON.stringify(aasa, null, 2));
fs.writeFileSync(path.join(outDir, "assetlinks.json"), JSON.stringify(assetlinks, null, 2));

console.log(`[well-known] Generated for ${appId} → public/.well-known/`);
