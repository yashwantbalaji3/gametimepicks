#!/usr/bin/env node
/**
 * Emit the PUBLIC Results Day files (Results V2 pilot), build step, like emit-forecast-record-assets.mjs.
 *
 *   data/results-projection/v1/<sport>/<date>.json (sealed, committed)
 *     →  app/public/data/results/v2/index.json
 *        app/public/data/results/v2/<sport>/<date>.json            day summary: families, games, player directory, no rows
 *        app/public/data/results/v2/<sport>/<date>/<eventId>.json  one game's rows, fetched when a reader opens that game
 *        app/public/data/results/v2/<sport>/<date>.csv             every row, a download
 *
 * ONLY ELIGIBLE DAYS ARE PUBLISHED (founder ruling, 2026-11-03). A day whose evidence is not in PUBLIC_EVIDENCE (today:
 * every day, since BACKFILL_GITHUB is a backfill and not proof of a live serve) writes no file at all, and the index lists
 * only published days. An empty index is a valid result, not a refusal: /results/day then shows its empty state.
 *
 * This reads nothing but the sealed directory. The output directory is wiped first so a withdrawn day never lingers, and
 * every file is scanned before it is written: a price, a book, a range or a per-row side stops the build. No network, no
 * clock: same sealed files, identical bytes.
 */
import fs from "node:fs";
import path from "node:path";

import {
  PUBLIC_EVIDENCE, RESULTS_DAY_INDEX_SCHEMA, RESULTS_DAY_SCHEMA, canonicalDayJson, publicSafetyViolations, toDayCsv,
} from "../../src/lib/results/v2/contract.mjs";

export const RESULTS_DAY_GAME_SCHEMA = "gtp.results-day-game@1";
export const RESULTS_DAY_SUMMARY_SCHEMA = "gtp.results-day-summary@1";

const APP = process.cwd();
const SEALED = path.resolve(APP, "..", "data/results-projection/v1");
const OUT = path.join(APP, "public/data/results/v2");
const URL_BASE = "/data/results/v2";
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

function refuseIfUnsafe(name, content) {
  const bad = publicSafetyViolations(content);
  if (bad.length) throw new Error(`${name}: ${bad[0]}`);
}

/** The summary a reader loads first: everything but the rows, plus each game's player directory and rows file. */
function summaryOf(doc, sport, date) {
  const games = doc.games.map(({ rows, ...g }) => {
    const seen = new Map();
    for (const r of rows) if (!seen.has(r.playerId)) seen.set(r.playerId, { playerId: r.playerId, subject: r.subject, team: r.team });
    return {
      ...g, rowCount: rows.length, rowsFile: `${URL_BASE}/${sport}/${date}/${g.eventId}.json`,
      players: [...seen.values()].sort((a, b) => a.subject.localeCompare(b.subject, "en") || (a.playerId < b.playerId ? -1 : 1)),
    };
  });
  return { ...doc, schema: RESULTS_DAY_SUMMARY_SCHEMA, daySchema: doc.schema, games };
}

/**
 * Read every sealed day under `sealedDir` and write the public set of eligible days into `outDir` (wiped first).
 * `publicEvidence` exists for tests that exercise the file shapes; the build always uses PUBLIC_EVIDENCE.
 * Returns { days, withheld, files }.
 */
export function emitResultsV2({ sealedDir = SEALED, outDir = OUT, publicEvidence = PUBLIC_EVIDENCE } = {}) {
  const allowed = new Set(publicEvidence);
  const days = [];
  const files = {};
  let withheld = 0;
  const sports = fs.existsSync(sealedDir) ? fs.readdirSync(sealedDir).sort() : [];
  for (const sport of sports) {
    const dir = path.join(sealedDir, sport);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const doc = JSON.parse(raw);
      const date = f.slice(0, 10);
      if (doc.schema !== RESULTS_DAY_SCHEMA || doc.sport !== sport || doc.date !== date) throw new Error(`${sport}/${f}: not a ${RESULTS_DAY_SCHEMA} for this path`);
      /* The sealed file is committed to a public repository, so it is held to the same check even when it is withheld. */
      refuseIfUnsafe(`${sport}/${f}`, doc);
      refuseIfUnsafe(`${sport}/${f}`, raw);
      const evidence = [doc.provenance?.evidence, ...doc.games.map((g) => g.snapshot?.evidence)];
      if (!evidence.every((e) => allowed.has(e))) { withheld += 1; continue; }

      const day = {};
      day[`${sport}/${f}`] = canonicalDayJson(summaryOf(doc, sport, date));
      for (const g of doc.games) {
        day[`${sport}/${date}/${g.eventId}.json`] = canonicalDayJson({ schema: RESULTS_DAY_GAME_SCHEMA, sport, date, eventId: g.eventId, rows: g.rows });
      }
      day[`${sport}/${date}.csv`] = toDayCsv(doc);
      for (const [name, text] of Object.entries(day)) {
        refuseIfUnsafe(name, text);
        if (name.endsWith(".json")) refuseIfUnsafe(name, JSON.parse(text));
      }
      Object.assign(files, day);
      days.push({
        sport, date, ...doc.counts, evidence: doc.provenance.evidence, validationStatus: doc.provenance.validationStatus,
        json: `${URL_BASE}/${sport}/${f}`, csv: `${URL_BASE}/${sport}/${date}.csv`,
      });
    }
  }
  days.sort((a, b) => (a.date === b.date ? (a.sport < b.sport ? -1 : 1) : a.date < b.date ? 1 : -1));
  files["index.json"] = canonicalDayJson({ schema: RESULTS_DAY_INDEX_SCHEMA, days });
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(outDir, f)), { recursive: true });
    fs.writeFileSync(path.join(outDir, f), text);
  }
  return { days: days.length, withheld, files: Object.keys(files).sort() };
}

function main() {
  const out = emitResultsV2({ sealedDir: path.resolve(arg("sealed-dir", SEALED)), outDir: path.resolve(arg("out-dir", OUT)) });
  console.log(`results v2: ${out.days} day(s) published, ${out.withheld} withheld (evidence not public), ${out.files.length} file(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
