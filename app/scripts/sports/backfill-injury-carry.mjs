#!/usr/bin/env node
/**
 * ONE-OFF BACKFILL (founder-approved 2026-09-10): recover long-term injury designations that aged
 * out of ESPN's rolling feed BEFORE the carry-forward shipped, from the committed git history of the
 * NFL injuries file. Same rules as the live carry (lib/sports/injuries/carry-forward.mjs) — it calls
 * the same function — so a backfilled row is indistinguishable in meaning from a carried one, and is
 * additionally marked `backfilled` so it can be audited or reverted.
 *
 * Dry-run by default. --write replaces the committed file. Idempotent: a second run recovers nothing
 * new, because rows already carried are part of the current file.
 *
 * Usage: node app/scripts/sports/backfill-injury-carry.mjs [--now <iso>] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ABSENT_DESIGNATION_CARRY_H, recoverFromHistory } from "../../src/lib/sports/injuries/carry-forward.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const REL = "data/internal/research/injuries/nfl/latest.json";
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now", new Date().toISOString());
const WRITE = process.argv.includes("--write");

const shas = execFileSync("git", ["log", "--format=%H", "--", REL], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean).reverse();
const captures = [];
for (const sha of shas) {
  try { captures.push(JSON.parse(execFileSync("git", ["show", `${sha}:${REL}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1e8 }))); } catch { /* unreadable revision: skipped, never guessed */ }
}
// The working-tree file is the current one. When it is the SAME capture as the last commit (same
// generatedAt) it REPLACES that commit rather than being skipped: after a --write the rows it carried
// live only in the working tree, and ignoring them made a second run report the same recoveries again
// — the output was stable, but the report could not prove it.
const current = JSON.parse(fs.readFileSync(path.join(ROOT, REL), "utf8"));
if (captures.length && captures[captures.length - 1].generatedAt === current.generatedAt) captures[captures.length - 1] = current;
else captures.push(current);

const result = recoverFromHistory({ captures, nowIso: NOW });
const fresh = new Set(result.carried.map((e) => String(e.athleteId)));
const entries = result.entries.map((e) => (fresh.has(String(e.athleteId)) && e.carriedForward ? { ...e, backfilled: true, backfilledAt: NOW } : e));
const marked = entries.filter((e) => e.carriedForward === true).length;

console.log(`history: ${captures.length} captures (${captures[0]?.generatedAt} → ${current.generatedAt})`);
console.log(`recovered: ${result.carried.length} · skipped ${JSON.stringify(result.skipped)} · window ${ABSENT_DESIGNATION_CARRY_H}h`);
for (const e of result.carried) console.log(`  + ${e.athleteName} — ${e.status} (stated ${e.statedAt}, missing since ${e.absentFromFeedSince})`);

if (!WRITE) { console.log("\ndry run — nothing written (pass --write)"); process.exit(0); }
const out = {
  ...current,
  entries,
  carryForward: {
    ...(current.carryForward ?? {}),
    carried: marked,
    windowHours: ABSENT_DESIGNATION_CARRY_H,
    backfill: { source: "git history of this file", captures: captures.length, recovered: result.carried.length, at: NOW },
  },
};
fs.writeFileSync(path.join(ROOT, REL), JSON.stringify(out, null, 1));
console.log(`\nwrote ${REL}: ${entries.length} entries = ${current.reconciliation.kept} from the feed + ${marked} carried`);
