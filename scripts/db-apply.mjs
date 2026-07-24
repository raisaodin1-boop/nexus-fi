#!/usr/bin/env node
/**
 * Apply a SQL migration file to the linked Supabase project without db push.
 * Usage: node scripts/db-apply.mjs supabase/migrations/20260724_wallet_freeze_rpc.sql
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/db-apply.mjs <migration.sql>");
  process.exit(1);
}
const abs = path.resolve(file);
if (!fs.existsSync(abs)) {
  console.error("File not found:", abs);
  process.exit(1);
}

const r = spawnSync(
  "npx",
  ["supabase", "db", "query", "--linked", "-f", abs],
  { stdio: "inherit", shell: true },
);
process.exit(r.status ?? 1);
