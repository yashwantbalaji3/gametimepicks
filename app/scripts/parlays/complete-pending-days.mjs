#!/usr/bin/env node
/**
 * COMPLETE EVERY FINISHABLE PENDING DAY (P250 · A07).
 *
 *   npx tsx scripts/parlays/complete-pending-days.mjs --now <ISO> [--window-days 30] [--apply]
 *
 * The nightly settler targets ET-yesterday and ONLY ET-yesterday, and the receipt-completion rule
 * (receipt-completion.mjs) makes older days finishable but nothing ever revisits them. That gap is
 * how nine cards sat pending for up to three weeks with their official results already on disk:
 * four UFC cards whose results arrived after the settle run, and five MLB cards stuck on the old
 * scratch-means-pending rule.
 *
 * This sweep scans the bounded window of dated receipts, finds every day still carrying a pending
 * card, and re-runs the settler for exactly those dates. The settler's own completion rule does the
 * rest: pending → decided is accepted and stamped completedAt/completedCards; any other difference
 * is refused as a rewrite, so the sweep can never restate a settled outcome. Idempotent — a second
 * run finds nothing to do.
 *
 * Runs in nightly-settle after the ET-yesterday step. Exit 0 always unless a child settle run
 * refuses with a REWRITE (that is a real defect and must be seen).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RECEIPTS = path.join(APP, "public", "data", "parlays", "lab-settled");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now", new Date().toISOString());
const WINDOW = Number(arg("--window-days", "30"));
const APPLY = process.argv.includes("--apply");

const cutoff = new Date(Date.parse(NOW) - WINDOW * 86_400_000).toISOString().slice(0, 10);
let dates = [];
try {
  dates = fs.readdirSync(RECEIPTS)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .filter((d) => d >= cutoff)
    .sort();
} catch { console.log("no lab-settled receipts directory — nothing to sweep"); process.exit(0); }

const pendingDates = dates.filter((d) => {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(RECEIPTS, `${d}.json`), "utf8"));
    return (doc.cards ?? []).some((c) => c.result === "pending");
  } catch { return false; }
});

if (!pendingDates.length) { console.log(`sweep ${cutoff}..: no pending cards in ${dates.length} receipt(s) — nothing to complete`); process.exit(0); }
console.log(`sweep ${cutoff}..: ${pendingDates.length} day(s) still carry pending cards: ${pendingDates.join(", ")}`);

let failures = 0;
for (const d of pendingDates) {
  const args = ["tsx", "scripts/parlays/settle-lab-cards.mjs", "--now", NOW, "--date", d];
  if (APPLY) args.push("--apply");
  const run = spawnSync("npx", args, { cwd: APP, encoding: "utf8", timeout: 300_000 });
  process.stdout.write(`\n── ${d} ──\n${run.stdout ?? ""}`);
  if (run.stderr) process.stderr.write(run.stderr);
  // Exit 1 from the settler is the REWRITE refusal — a real inconsistency someone must look at.
  if (run.status === 1) failures += 1;
}
if (failures) { console.error(`\n${failures} day(s) REFUSED as rewrites — a settled outcome differs; investigate before touching anything.`); process.exit(1); }
console.log(`\nsweep complete${APPLY ? "" : " (dry-run — re-run with --apply)"}`);
