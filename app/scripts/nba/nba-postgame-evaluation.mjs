#!/usr/bin/env node
/**
 * NBA daily postgame evaluation — forecast vs actual for one ET date (PRIVATE research). DRY RUN BY DEFAULT.
 *
 *   node scripts/nba/nba-postgame-evaluation.mjs --date YYYY-MM-DD [--out FILE] [--now ISO] [--boxscore-dir DIR ...]
 *
 * Reads only committed files: each family's frozen forecasts (data/internal/research/nba/<family dir>/forecasts/<date>.json),
 * the season finals record (app/public/data/nba/results/finals-<season>.json), box scores where present (the same
 * locator the top-board grader uses), and the promotion record if one is committed. Receipt integrity is verified here
 * (forecast-receipt.mjs needs node:crypto) and passed to the pure module.
 *
 * Prints the JSON report and the Markdown. Writes ONLY to --out (a .md path gets the Markdown, anything else the JSON),
 * and refuses an --out inside the repo's data directories. Makes no network call and writes no repo data.
 * Exit: 0 ok · 1 usage / refused
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FAMILIES } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { nbaSeasonLabel } from "../../src/lib/sports/nba/finals-record.mjs";
import { receiptIntegrity } from "../../src/lib/sports/nba/forecast-receipt.mjs";
import { buildPostgameEvaluation, postgameMarkdown } from "../../src/lib/sports/nba/postgame-evaluation.mjs";
import { boxscoreLocator } from "./grade-nba-top-boards.mjs";
import { parseArgs } from "./top-board-families.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const NBA = path.join(REPO, "data", "internal", "research", "nba");
const PROTECTED = [path.join(REPO, "data"), path.join(APP, "public", "data")];
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const rel = (f) => path.relative(REPO, f);

/** Everything the module needs for `date`, read from committed files. Exported for the CLI test. */
export function loadInputs(date, { boxscoreDirs = [] } = {}) {
  const forecasts = {}, forecastSources = {}, receiptStates = {};
  for (const [fam, spec] of Object.entries(FAMILIES)) {
    const f = path.join(NBA, spec.dir, "forecasts", `${date}.json`);
    if (!fs.existsSync(f)) continue;
    const doc = readJson(f);
    forecasts[fam] = doc;
    forecastSources[fam] = rel(f);
    receiptStates[fam] = Object.fromEntries((doc.games ?? []).map((g) => [String(g.providerEventId), receiptIntegrity(g).state]));
  }
  const season = nbaSeasonLabel(date);
  const finalsFile = path.join(APP, "public", "data", "nba", "results", `finals-${season}.json`);
  const finalsRecord = fs.existsSync(finalsFile) ? readJson(finalsFile) : null;
  const promoFile = path.join(NBA, "promotion-record.json");
  const promotionRecord = fs.existsSync(promoFile) ? readJson(promoFile) : null;
  const find = boxscoreLocator(boxscoreDirs);
  const boxSources = {};
  const boxscoreOf = (id) => { const hit = find(id); if (hit) boxSources[id] = hit.file; return hit?.doc ?? null; };
  return {
    forecasts, forecastSources, receiptStates,
    finalsRecord, finalsSource: finalsRecord ? rel(finalsFile) : null,
    promotionRecord, promotionSource: promotionRecord ? rel(promoFile) : null,
    boxscoreOf, boxSources,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const { opt } = parseArgs(argv);
  const date = opt("--date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) { console.error("REFUSED: --date YYYY-MM-DD is required"); process.exit(1); }
  const now = opt("--now") ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(now))) { console.error("REFUSED: --now must be ISO"); process.exit(1); }
  const outArg = opt("--out");
  const out = outArg ? path.resolve(outArg) : null;
  if (out && PROTECTED.some((d) => out === d || out.startsWith(d + path.sep))) { console.error(`REFUSED: --out ${rel(out)} is inside repo data — this tool never writes repo data`); process.exit(1); }
  const boxscoreDirs = argv.flatMap((a, i) => (a === "--boxscore-dir" && argv[i + 1] ? [argv[i + 1]] : []));

  const inp = loadInputs(date, { boxscoreDirs });
  if (!inp.finalsRecord) { console.error(`REFUSED: no committed finals record for season ${nbaSeasonLabel(date)}`); process.exit(1); }
  const report = buildPostgameEvaluation({ date, generatedAt: now, ...inp });
  const md = postgameMarkdown(report);
  console.log(JSON.stringify(report, null, 1));
  console.log(md);
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, out.endsWith(".md") ? md : JSON.stringify(report, null, 1) + "\n");
    console.error(`wrote ${out}`);
  } else console.error("dry run — nothing written (pass --out FILE to save the report outside repo data)");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
