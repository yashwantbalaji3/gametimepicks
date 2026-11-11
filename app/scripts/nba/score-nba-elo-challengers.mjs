#!/usr/bin/env node
/**
 * NBA ELO CHALLENGER LEDGER — after finals, the pre-registered confirmatory record of the two Elo challengers
 * (docs/NBA_ELO_WALKFORWARD_PREREGISTRATION_V2.md, approved 2026-11-11T00:09:14Z). PRIVATE research:
 * data/internal/research/nba/elo-shadow/ledger.json — per-game rows from the FROZEN pre-tip shadow entries and the
 * frozen official forecasts, a running n against 300, and the verdict: null until the single look at n ≥ 300, then
 * frozen (this run refuses to change a committed verdict). Deterministic: no build-time field; promotes nothing.
 *
 *   node scripts/nba/score-nba-elo-challengers.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { challengerLedger } from "../../src/lib/sports/nba/elo-shadow.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const OFFICIAL = path.join(NBA, "experimental-v0.1", "forecasts");
const SHADOW = path.join(NBA, "elo-shadow", "forecasts");
const LEDGER = path.join(NBA, "elo-shadow", "ledger.json");
const FINALS = path.join(APP, "public", "data", "nba", "results", "finals-2026-27.json");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const days = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort() : []);

const shadowDocs = days(SHADOW).map((f) => readJson(path.join(SHADOW, f)));
if (!shadowDocs.length) { console.log("no shadow forecasts yet — nothing to score"); process.exit(0); }
const previous = fs.existsSync(LEDGER) ? readJson(LEDGER) : null;
const ledger = challengerLedger({
  shadowDocs,
  officialGames: days(OFFICIAL).flatMap((f) => readJson(path.join(OFFICIAL, f)).games ?? []),
  finalsRecord: readJson(FINALS),
  previous,
});
if (previous?.verdict != null && JSON.stringify(previous.verdict) !== JSON.stringify(ledger.verdict)) { console.error("REFUSED: the frozen verdict would change"); process.exit(1); }
console.log(`elo challenger ledger: ${ledger.progress} confirmatory games; verdict ${ledger.verdict ? ledger.verdict.result.primary.verdict : "null (no look yet)"}; ${JSON.stringify(ledger.counts)}`);
const text = `${JSON.stringify(ledger, null, 1)}\n`;
if (process.argv.includes("--write") && (!fs.existsSync(LEDGER) || fs.readFileSync(LEDGER, "utf8") !== text)) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, text);
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), LEDGER)}`);
}
