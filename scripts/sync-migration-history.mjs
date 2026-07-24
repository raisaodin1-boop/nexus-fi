#!/usr/bin/env node
/**
 * Realign linked migration history for remote-only timestamp versions.
 *
 * Creates empty stub files so `supabase db push` no longer fails with
 * "remote migration versions not found in local directory".
 *
 * Local date-prefixed files (e.g. 20260610_*.sql) share truncated versions
 * and must keep being applied via `npm run db:apply -- <file.sql>`.
 *
 * Usage: node scripts/sync-migration-history.mjs [--dry-run]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dryRun = process.argv.includes("--dry-run");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase", "migrations");

function run(args) {
  const r = spawnSync("npx", ["supabase", ...args], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  return (r.stdout || "") + (r.stderr || "");
}

const out = run(["migration", "list", "--linked", "--output-format", "json"]);
const start = out.indexOf("{");
const end = out.lastIndexOf("}");
if (start < 0 || end < 0) {
  console.error("Failed to parse migration list JSON");
  process.exit(1);
}
const payload = JSON.parse(out.slice(start, end + 1));
const rows = payload.migrations ?? [];

const remoteOnly = [...new Set(rows.filter((m) => m.remote && !m.local).map((m) => String(m.remote)))];
const localOnly = rows.filter((m) => m.local && !m.remote).map((m) => String(m.local));
const ambiguousLocal = localOnly.filter((v) => v.length <= 8);
const uniqueLocal = [...new Set(localOnly.filter((v) => v.length > 8))];

console.log(`Remote-only versions: ${remoteOnly.length}`);
console.log(`Local-only (unique long): ${uniqueLocal.length}`);
console.log(`Local-only (ambiguous date): ${ambiguousLocal.length} — use npm run db:apply`);

let created = 0;
for (const version of remoteOnly) {
  const stub = path.join(migrationsDir, `${version}_remote_history_stub.sql`);
  if (fs.existsSync(stub)) continue;
  const body =
    `-- History stub for remote migration ${version}.\n` +
    `-- Schema already applied on linked project; kept so CLI history matches.\n` +
    `select 1;\n`;
  if (dryRun) {
    console.log(`[dry-run] would create ${path.basename(stub)}`);
  } else {
    fs.writeFileSync(stub, body, "utf8");
    created += 1;
    console.log(`created ${path.basename(stub)}`);
  }
}

if (uniqueLocal.length && !dryRun) {
  const chunkSize = 15;
  for (let i = 0; i < uniqueLocal.length; i += chunkSize) {
    const chunk = uniqueLocal.slice(i, i + chunkSize);
    console.log(`repair applied: ${chunk.join(", ")}`);
    run(["migration", "repair", "--status", "applied", "--linked", "--yes", ...chunk]);
  }
} else if (uniqueLocal.length && dryRun) {
  console.log(`[dry-run] would repair applied: ${uniqueLocal.join(", ")}`);
}

console.log(
  dryRun
    ? "Dry-run complete."
    : `Done. Created ${created} stubs. Prefer: npm run db:apply -- path/to/migration.sql`,
);
