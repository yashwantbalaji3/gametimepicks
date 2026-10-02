/**
 * NBA finals record builder (Session 6 · NBA foundation) — folds the accepted finals of the rolling
 * results capture into the write-once per-season record (`src/lib/sports/nba/finals-record.mjs`).
 *
 * Reads public/data/nba/results/latest.json through `loadCurrentNbaResults` (schedule lineage, integer
 * non-tied points, seasonType agreement — its quarantines never enter), and writes
 * public/data/nba/results/finals-<season>.json ONLY when a final, conflict or refusal is new. A run
 * that learns nothing writes nothing, so the file's `updatedAt` is the time of its last real change.
 *
 * Run (from app/): node scripts/nba/build-nba-finals-record.mjs --now <ISO> [--dry-run]
 * Exit: 0 ok (including "nothing new") · 1 usage
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCurrentNbaResults } from "../../src/lib/sports/nba/current-results.mjs";
import { mergeFinals, finalRow } from "../../src/lib/sports/nba/finals-record.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(APP, "public", "data", "nba", "results");

const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] ?? null : null; };
const NOW = arg("--now");
const DRY = process.argv.includes("--dry-run");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

process.chdir(APP); // the adapter resolves public/data from the working directory
const current = loadCurrentNbaResults({ nowIso: NOW });
if (!current.results?.length) {
  console.log(`nba finals record: nothing to fold (results state ${current.state}) — no file written`);
  process.exit(0);
}

let raw = [];
try { raw = JSON.parse(fs.readFileSync(path.join(DIR, "latest.json"), "utf8")).rows ?? []; } catch { /* adapter already read it */ }
const rawById = new Map(raw.map((r) => [String(r.providerEventId), r]));
const accepted = current.results.map((r) => rawById.get(r.providerEventId)).filter(Boolean);

const bySeason = new Map();
for (const r of accepted) {
  const built = finalRow(r, NOW);
  const season = built.ok ? built.row.season : null;
  if (!season) { console.log(`refused ${r.providerEventId}: ${built.reason}`); continue; }
  if (!bySeason.has(season)) bySeason.set(season, []);
  bySeason.get(season).push(r);
}

for (const [season, rows] of bySeason) {
  const file = path.join(DIR, `finals-${season}.json`);
  let existing = null;
  try { existing = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* first final of the season */ }
  const { record, changed, added } = mergeFinals(existing, rows, { season, nowIso: NOW });
  const c = record.counts;
  const line = `nba finals ${season}: +${added} new · ${c.finals} total (pre ${c.preseason} · reg ${c.regular} · post ${c.postseason} · play-in ${c.playIn} · exhibition ${c.exhibition}) · conflicts ${c.conflicts} · refused ${c.refused}`;
  if (!changed) { console.log(`${line} — unchanged, not written`); continue; }
  if (DRY) { console.log(`${line} — dry run, not written`); continue; }
  fs.writeFileSync(file, JSON.stringify(record, null, 1) + "\n");
  console.log(`${line} — wrote ${path.relative(APP, file)}`);
}
