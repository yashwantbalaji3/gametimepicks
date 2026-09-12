#!/usr/bin/env node
/**
 * PUBLISH THE PREGAME WEATHER AS CONTEXT (P277). Zero network calls, zero credits.
 *
 * The NWS capture is private research; this derives the public view of it — the conditions beside
 * each game, with the source attribution and the sentence that keeps it out of the model. It reads
 * the week file whose games are still ahead of `--now`, so a finished week never republishes as if
 * it were the slate.
 *
 *   node scripts/nfl/build-nfl-weather-public.mjs --now <ISO>
 *
 * Exit 0 when an artifact is written or when there is honestly nothing to publish (the public file
 * is then REMOVED rather than left stale — a page reading yesterday's wind is worse than a page
 * with no wind). Exit 1 on a refusal.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPublicWeather } from "../../src/lib/sports/weather/public-view.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const privateDir = path.join(ROOT, "data", "internal", "research", "nfl", "weather");
const outDir = path.join(APP, "public", "data", "nfl", "weather");
const outPath = path.join(outDir, "latest.json");

let weeks = [];
try { weeks = fs.readdirSync(privateDir).filter((f) => /^\d{4}-wk\d{2}\.json$/.test(f)).sort(); } catch { weeks = []; }
if (!weeks.length) { console.log("no captured weather on file — nothing to publish"); process.exit(0); }

/* The week to publish is the one whose games are still ahead. Picking "the newest file" would keep
   a finished week on the page all the way to the next capture. */
let chosen = null;
for (const f of weeks) {
  const doc = JSON.parse(fs.readFileSync(path.join(privateDir, f), "utf8"));
  const ahead = (doc.games ?? []).filter((g) => Date.parse(g.kickoffUtc ?? "") > Date.parse(NOW));
  if (ahead.length) { chosen = { file: f, doc }; break; }
}
if (!chosen) {
  if (fs.existsSync(outPath)) { fs.rmSync(outPath); console.log("every captured week has kicked off — removed the stale public artifact"); }
  else console.log("every captured week has kicked off — nothing to publish");
  process.exit(0);
}

const publicDoc = buildPublicWeather(chosen.doc, { nowIso: NOW, week: chosen.doc.week ?? chosen.file.replace(/\.json$/, "") });
if (!publicDoc.eventCount) {
  if (fs.existsSync(outPath)) { fs.rmSync(outPath); console.log(`${chosen.file}: no row survived the pregame checks — removed the stale public artifact`); }
  else console.log(`${chosen.file}: no row survived the pregame checks — nothing to publish`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(publicDoc, null, 2)}\n`);
const indoors = publicDoc.rows.filter((r) => r.indoors).length;
const windy = publicDoc.rows.filter((r) => r.notableWind).length;
console.log(`weather: ${publicDoc.eventCount} game(s) from ${chosen.file} · ${indoors} indoors · ${windy} with notable wind · captured ${publicDoc.capturedAt}`);
