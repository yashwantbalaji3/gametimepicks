#!/usr/bin/env node
/**
 * UFC ODDS COVERAGE — recompute against the CURRENT card, free (Session 9 · main-health).
 *
 *   node app/scripts/ufc/recompute-ufc-odds-coverage.mjs --now <ISO> [--dry-run]
 *
 * Runs after the free daily card rebuild. When the card's bout universe changed since the last paid price
 * capture, rewrites ONLY the coverage metadata of public/data/ufc/odds-latest.json (lib/sports/ufc/
 * card-coverage.mjs · recomputeCoverageAgainstCard). No provider call, no credit, no price row touched.
 * Nothing to do (same universe, different event, no snapshot) is a clean exit 0.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coverageReconciles, recomputeCoverageAgainstCard } from "../../src/lib/sports/ufc/card-coverage.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const ODDS = path.join(APP, "public/data/ufc/odds-latest.json");
const snapshot = read(ODDS);
const card = read(path.join(APP, "public/data/ufc/card-latest.json"));

const next = recomputeCoverageAgainstCard({ snapshot, card, nowIso: NOW });
if (!next) { console.log("ufc odds coverage: nothing to recompute (no snapshot, a different event, or the same bout universe)"); process.exit(0); }
if (!coverageReconciles(next.coverage)) { console.error(`REFUSED: recomputed coverage does not reconcile: ${JSON.stringify(next.coverage)}`); process.exit(1); }
const before = JSON.stringify(snapshot.bouts);
if (JSON.stringify([...next.bouts, ...(next.droppedFromCard ?? [])].map((b) => JSON.stringify(b)).sort()) !== JSON.stringify([...(snapshot.bouts ?? []), ...(snapshot.droppedFromCard ?? [])].map((b) => JSON.stringify(b)).sort())) {
  console.error("REFUSED: a price row would change — the recompute may only move rows, never edit them"); process.exit(1);
}
console.log(`ufc odds coverage: ${snapshot.coverage?.priced}/${snapshot.coverage?.cardBouts} → ${next.coverage.priced}/${next.coverage.cardBouts} priced · added after capture ${next.coverage.addedAfterCapture} · dropped from card ${(next.droppedFromCard ?? []).length} · 0 provider calls${before === JSON.stringify(next.bouts) ? " · price rows unchanged" : " · price rows moved, not edited"}`);
if (process.argv.includes("--dry-run")) process.exit(0);
fs.writeFileSync(ODDS, JSON.stringify(next, null, 1) + "\n");
