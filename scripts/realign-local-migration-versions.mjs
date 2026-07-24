#!/usr/bin/env node
/**
 * Give date-prefixed local migrations unique versions after the last remote
 * timestamp, then mark them applied (schema already live via db query).
 *
 * Usage: node scripts/realign-local-migration-versions.mjs [--dry-run]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dryRun = process.argv.includes("--dry-run");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "supabase", "migrations");

/** Versions after last known remote history timestamp 20260627185436 */
const BASE = 20260628000001n;

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => !f.includes("_remote_history_stub.sql"))
  .filter((f) => !/^\d{14}_/.test(f))
  .sort((a, b) => a.localeCompare(b));

console.log(`Files to realign: ${files.length}`);

const renames = [];
let seq = 0n;
for (const file of files) {
  const version = (BASE + seq).toString();
  seq += 1n;
  const rest = file.replace(/^\d{8}_/, "");
  const next = `${version}_${rest}`;
  renames.push({ from: file, to: next, version });
}

for (const r of renames) {
  if (dryRun) {
    console.log(`[dry-run] ${r.from} -> ${r.to}`);
    continue;
  }
  fs.renameSync(path.join(dir, r.from), path.join(dir, r.to));
  console.log(`renamed ${r.from} -> ${r.to}`);
}

if (!dryRun && renames.length) {
  const versions = renames.map((r) => r.version);
  const chunkSize = 15;
  for (let i = 0; i < versions.length; i += chunkSize) {
    const chunk = versions.slice(i, i + chunkSize);
    console.log(`repair applied (${chunk.length}): ${chunk[0]}…`);
    const r = spawnSync(
      "npx",
      ["supabase", "migration", "repair", "--status", "applied", "--linked", "--yes", ...chunk],
      { cwd: root, encoding: "utf8", shell: true },
    );
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout);
      process.exit(r.status ?? 1);
    }
  }
}

console.log(dryRun ? "Dry-run complete." : "Local migration versions realigned + marked applied.");
