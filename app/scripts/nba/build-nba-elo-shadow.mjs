#!/usr/bin/env node
/**
 * NBA ELO SHADOW FORECASTS — freeze the two pre-registered Elo challengers (docs/NBA_ELO_WALKFORWARD_PREREGISTRATION_V2.md)
 * for every upcoming game of a slate whose official v0.1 forecast is frozen, before tip. PRIVATE research shadow:
 * data/internal/research/nba/elo-shadow/forecasts/<date>.json — never published, never a build input; the official Elo
 * and every lane are unchanged.
 *
 *   node scripts/nba/build-nba-elo-shadow.mjs --date 2026-11-11 --now 2026-11-11T15:00:00Z [--write]
 *
 * Write-once per game: an entry already committed is carried byte-for-byte (the run refuses if it would change one); a
 * game at or after tip is never added. Exit: 0 ok (including nothing to add / no official forecast yet) · 1 refused.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { shadowForecastDoc } from "../../src/lib/sports/nba/elo-shadow.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const OFFICIAL = path.join(NBA, "experimental-v0.1", "forecasts");
const OUT_DIR = path.join(NBA, "elo-shadow", "forecasts");
const FINALS = path.join(APP, "public", "data", "nba", "results", "finals-2026-27.json");
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i === -1 ? null : argv[i + 1] ?? null; };
const DATE = opt("--date"), NOW = opt("--now");
if (!/^\d{4}-\d\d-\d\d$/.test(DATE ?? "") || !Number.isFinite(Date.parse(NOW ?? ""))) { console.error("usage: --date YYYY-MM-DD --now ISO [--write]"); process.exit(1); }
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const slateFile = path.join(OFFICIAL, `${DATE}.json`);
if (!fs.existsSync(slateFile)) { console.log(`no official v0.1 forecast for ${DATE} yet — nothing to shadow`); process.exit(0); }
const officialGames = fs.readdirSync(OFFICIAL).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort().flatMap((f) => readJson(path.join(OFFICIAL, f)).games ?? []);
const outFile = path.join(OUT_DIR, `${DATE}.json`);
const existing = fs.existsSync(outFile) ? readJson(outFile) : null;
const { doc, added, refused } = shadowForecastDoc({
  date: DATE, now: NOW,
  slateGames: readJson(slateFile).games ?? [],
  officialGames,
  corpusRows: readJson(path.join(NBA, "corpus-v1.json")).rows ?? [],
  finalsRecord: readJson(FINALS),
  existing,
});
// write-once guard: every committed entry must come back byte-identical
for (const g of existing?.games ?? []) {
  const now = doc.games.find((x) => x.providerEventId === g.providerEventId);
  if (JSON.stringify(now) !== JSON.stringify(g)) { console.error(`REFUSED: frozen shadow entry ${g.providerEventId} would change`); process.exit(1); }
}
for (const r of refused) console.log(`::notice::shadow not frozen for ${r.providerEventId}: ${r.reason}`);
console.log(`elo shadow ${DATE}: ${doc.games.length} games frozen (${added} added this run)`);
if (argv.includes("--write") && added > 0) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), outFile)}`);
}
