#!/usr/bin/env node
/**
 * NBA MINUTES SHADOW PROJECTIONS — freeze, before tip, the shadow player projections driven by the challenger minutes
 * nba-minutes-current-season@1 (official rates, engine and seed; minutes only differ). PRIVATE research shadow:
 * data/internal/research/nba/minutes-shadow/forecasts/<date>.json — never published, never a build input; the official
 * v0.1 forecasts and every lane are unchanged.
 *
 *   node scripts/nba/build-nba-minutes-shadow.mjs --date 2026-11-11 --now 2026-11-11T15:00:00Z [--write]
 *
 * Write-once per game (the run refuses if it would change a committed entry); a game at or after tip is never added.
 * Exit: 0 ok (including nothing to add / no official forecast yet) · 1 refused.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { minutesShadowDoc } from "../../src/lib/sports/nba/minutes-shadow.mjs";
import { FAMILIES } from "../../src/lib/sports/nba/experimental-forecast.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const OFFICIAL = path.join(NBA, "experimental-v0.1", "forecasts");
const OUT_DIR = path.join(NBA, "minutes-shadow", "forecasts");
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i === -1 ? null : argv[i + 1] ?? null; };
const DATE = opt("--date"), NOW = opt("--now");
if (!/^\d{4}-\d\d-\d\d$/.test(DATE ?? "") || !Number.isFinite(Date.parse(NOW ?? ""))) { console.error("usage: --date YYYY-MM-DD --now ISO [--write]"); process.exit(1); }
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const readBoxDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(dir, f))) : []);

const slateFile = path.join(OFFICIAL, `${DATE}.json`);
if (!fs.existsSync(slateFile)) { console.log(`no official v0.1 forecast for ${DATE} yet — nothing to shadow`); process.exit(0); }
// Current-season box scores: every family's fetched cache (the forecast builder's own union), one doc per event.
const seen = new Set();
const boxscores = Object.values(FAMILIES).flatMap((f) => readBoxDir(path.join(NBA, f.dir, "boxscores"))).filter((b) => !seen.has(String(b.providerEventId)) && seen.add(String(b.providerEventId)));
const outFile = path.join(OUT_DIR, `${DATE}.json`);
const existing = fs.existsSync(outFile) ? readJson(outFile) : null;
const { doc, added, refused } = minutesShadowDoc({
  date: DATE, now: NOW,
  slateGames: readJson(slateFile).games ?? [],
  boxscores,
  corpusBoxscores: readBoxDir(path.join(NBA, "boxscores")),
  existing,
});
for (const g of existing?.games ?? []) {
  const now = doc.games.find((x) => x.providerEventId === g.providerEventId);
  if (JSON.stringify(now) !== JSON.stringify(g)) { console.error(`REFUSED: frozen minutes-shadow entry ${g.providerEventId} would change`); process.exit(1); }
}
for (const r of refused) console.log(`::notice::minutes shadow not frozen for ${r.providerEventId}: ${r.reason}`);
console.log(`minutes shadow ${DATE}: ${doc.games.length} games frozen (${added} added this run)`);
if (argv.includes("--write") && added > 0) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), outFile)}`);
}
