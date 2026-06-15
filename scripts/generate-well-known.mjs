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
const sha256 = process.env.ANDROID_SHA256_FINGERPRINT || process.env.EXPO_PUBLIC_ANDROID_SHA256_FINGERPRINT || "REPLACE_WITH_ANDROID_SHA256_FINGERPRINT";
const bundleId = "app.hodix.mobile";
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
