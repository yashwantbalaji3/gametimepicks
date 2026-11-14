#!/usr/bin/env node
/**
 * Build one sealed Results Day (gtp.results-day@1, Results V2 pilot).
 *
 *   npx tsx scripts/results/build-results-day.mjs --sport nfl|nba --date YYYY-MM-DD [--out-root <dir>]
 *
 *   NFL   data/internal/nfl/prop-settlement/<date>.json        frozen forecast + official measurement
 *         app/public/data/nfl/reconciliation/<week>.json       final score
 *   NBA   app/public/data/nba/experimental-public/<date>.json  the official prediction (the public lane)
 *         the NBA grade ledger (read-nba-grades.mjs)           the actual, latest entry per key
 *         app/public/data/nba/results/finals-<season>.json     official side result
 *
 *   →  data/results-projection/v1/<sport>/<etDate>.json
 *
 * NOT A BUILD STEP. This runs by hand and the sealed file is committed, so the site never reads the ledger above: the
 * ledger is PRIVATE_RESEARCH and not a build input, and the emit step (emit-results-v2-assets.mjs) reads only the sealed
 * file. Historical sources are read and never written. No network, no clock, no day-level hash: the same inputs give
 * the same bytes, and every timestamp in the output is copied from a source.
 *
 * NO SERVED CHECK RUNS HERE. Option B needs a READY deployment before the start, and the builder cannot prove one, so
 * each game says SURVEY_MEASURED and `evidence: BACKFILL_GITHUB`. The commits behind that word are in the table below
 * and in docs/RESULTS_V2_PILOT_NOTE.md. A day outside this table is refused rather than given a softer label.
 */
import fs from "node:fs";
import path from "node:path";

import { NBA_GRADE_SOURCE, readNbaGrades } from "./read-nba-grades.mjs";
import {
  EVIDENCE, MEASUREMENT, RESULTS_DAY_SCHEMA, VALIDATION, absoluteError, axesForNbaRow, axesForNbaSide, axesForNflRow,
  canonicalDayJson, familySummary, marketRank, nflActual, publicRow, publicSafetyViolations, sideAggregate,
} from "../../src/lib/results/v2/contract.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));

/** Surveyed days only. `forecastCommits` maps a frozen generatedAt to the commit that holds it, committed before kickoff. */
const SURVEYED_DAYS = Object.freeze({
  "nfl/2026-10-11": {
    surveyCommit: "f0ca00de2bcb491b7077de72bc57f3e5218cab55",
    forecastCommits: {
      "2026-10-11T12:36:05Z": "860584f115",
      "2026-10-11T16:53:08Z": "74472849a4",
      "2026-10-11T19:54:49Z": "95f97edfd8",
      "2026-10-12T00:15:15Z": "3fb1d96908",
    },
  },
  "nba/2026-10-28": { surveyCommit: "f0ca00de2bcb491b7077de72bc57f3e5218cab55", laneCommit: "47107e9d9d" },
});

const PROVENANCE_NOTE = "Frozen predictions are copied exactly from the sources named on each game. Pilot days are a backfill from the public GitHub history, labelled BACKFILL_GITHUB and kept apart from any future live capture. A commit is not proof a page was served: validationStatus SURVEY_MEASURED means the served check was not reproduced by this build, so no row here is an official betting result. Side comparisons appear only as per-market day totals, never per row.";

const byRow = (a, b) => a.subject.localeCompare(b.subject, "en") || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0) || marketRank(a.market) - marketRank(b.market);
const byGame = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.eventId < b.eventId ? -1 : 1);

function assertFrozenBeforeCutoff(eventId, generatedAt, cutoff) {
  if (!(Date.parse(generatedAt) < Date.parse(cutoff))) throw new Error(`${eventId}: frozen ${generatedAt} is not before cutoff ${cutoff}`);
}

/* Sealed days are served byte for byte, and the site never prints an internal path. Their real paths: NFL_RESULT_SOURCE
   is data/internal/nfl/prop-settlement/<date>.json, NBA_RESULT_SOURCE is NBA_GRADE_SOURCE. */
const NFL_RESULT_SOURCE = "NFL prop settlement record (internal)";
const NBA_RESULT_SOURCE = "NBA prop grade ledger (private research record)";

/* Families are counted from the mapper's full rows; each row is then sealed through `publicRow`, which drops the per-row
   side and side result (founder ruling 2026-11-03: no record from which a restricted line can be reconstructed). */
function dayOf({ sport, date, dataClass, surveyCommit, sourceFiles, games, extra = {} }) {
  const rows = games.flatMap((g) => g.rows);
  return {
    schema: RESULTS_DAY_SCHEMA, sport, date, dataClass, ...extra,
    counts: { games: games.length, players: new Set(rows.map((r) => r.playerId)).size, rows: rows.length },
    families: familySummary(rows),
    provenance: { evidence: EVIDENCE.BACKFILL_GITHUB, validationStatus: VALIDATION.SURVEY_MEASURED, surveyCommit, sourceFiles, rowKey: "date|eventId|playerId|market", note: PROVENANCE_NOTE },
    games: games.sort(byGame).map((g) => ({ ...g, rows: g.rows.map(publicRow) })),
  };
}

/** The ET date's season, e.g. 2026-10-28 → 2026-27 and 2099-11-01 → 2099-00. Seasons start in August. */
export function nbaSeasonOf(date) {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 8 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The final score per event, from whichever week reconciliation holds the game. */
function nflFinals() {
  const dir = "app/public/data/nfl/reconciliation";
  const finals = new Map();
  for (const f of fs.readdirSync(path.join(REPO, dir)).sort()) {
    if (f === "index.json") continue;
    for (const g of readJson(`${dir}/${f}`).games ?? []) if (g.state === "FINAL" && g.final) finals.set(g.providerEventId, { file: `${dir}/${f}`, score: { away: g.final.away, home: g.final.home } });
  }
  return finals;
}

export function buildNfl(date, surveyed) {
  const settledFrom = `data/internal/nfl/prop-settlement/${date}.json`;
  const doc = readJson(settledFrom);
  const finals = nflFinals();
  const events = new Map();
  for (const r of doc.rows) {
    if (r.slateDateEt !== date) throw new Error(`${r.settlementId}: slate ${r.slateDateEt} is not ${date}`);
    const a = events.get(r.eventId) ?? [];
    a.push(r);
    events.set(r.eventId, a);
  }
  const finalFiles = new Set();
  const games = [...events].map(([eventId, rows]) => {
    const first = rows[0];
    const generated = new Set(rows.map((r) => r.frozen.forecastGeneratedAt));
    if (generated.size !== 1) throw new Error(`${eventId}: ${generated.size} frozen generatedAt values in one game`);
    const generatedAt = first.frozen.forecastGeneratedAt;
    assertFrozenBeforeCutoff(eventId, generatedAt, first.kickoffUtc);
    const commit = surveyed.forecastCommits[generatedAt];
    if (!commit) throw new Error(`${eventId}: no surveyed commit for frozen ${generatedAt}`);
    const final = finals.get(eventId);
    if (!final) throw new Error(`${eventId}: no final score in the reconciliation`);
    finalFiles.add(final.file);
    return {
      eventId, start: first.kickoffUtc, cutoff: first.kickoffUtc, matchup: first.matchup,
      final: { state: "FINAL", score: final.score },
      snapshot: {
        servedFrom: `app/public/data/nfl/player-board/${eventId}.json`, settledFrom: NFL_RESULT_SOURCE, generatedAt,
        sourceVersion: `nfl-player-board@${commit}`, validationStatus: VALIDATION.SURVEY_MEASURED, evidence: EVIDENCE.BACKFILL_GITHUB,
      },
      rows: rows.map((r) => {
        const a = axesForNflRow(r);
        const isTd = r.family === "anytime_td";
        const prediction = isTd ? r.frozen.projection.probability : r.frozen.projection.median;
        if (typeof prediction !== "number") throw new Error(`${r.settlementId}: no frozen prediction`);
        const actual = nflActual(r, a);
        return {
          subject: r.playerName, playerId: r.playerId, team: r.teamAbbr, market: r.family,
          predictionKind: isTd ? "PROBABILITY" : "MEDIAN", prediction, actual,
          absoluteError: absoluteError(prediction, actual), ...a,
        };
      }).sort(byRow),
    };
  });
  return dayOf({ sport: "nfl", date, dataClass: "PUBLIC_DERIVED", surveyCommit: surveyed.surveyCommit, sourceFiles: { forecast: "app/public/data/nfl/player-board/", settlement: NFL_RESULT_SOURCE, finals: [...finalFiles].sort() }, games });
}

export function buildNba(date, surveyed) {
  const laneFile = `app/public/data/nba/experimental-public/${date}.json`;
  const ledgerFile = NBA_GRADE_SOURCE;
  const lane = readJson(laneFile);
  const current = readNbaGrades(REPO);
  const season = nbaSeasonOf(date);
  const finalsFile = `app/public/data/nba/results/finals-${season}.json`;
  const finalsDoc = readJson(finalsFile);
  const finals = new Map(finalsDoc.finals.map((f) => [f.providerEventId, f]));
  const disputed = new Set((finalsDoc.conflicts ?? []).map((c) => c.providerEventId));

  const games = lane.games.map((g) => {
    const eventId = g.providerEventId;
    if (g.etDate !== date) throw new Error(`${eventId}: etDate ${g.etDate} is not ${date}`);
    if (disputed.has(eventId)) throw new Error(`${eventId}: the recorded final is disputed`);
    assertFrozenBeforeCutoff(eventId, g.frozenAt, g.tipUtc);
    const final = finals.get(eventId);
    if (!final) throw new Error(`${eventId}: no final in ${finalsFile}`);
    const side = axesForNbaSide(g, final);
    const rows = [];
    for (const homeAway of ["away", "home"]) {
      for (const p of g.players[homeAway]) {
        const medians = { ...p.medians, ...p.comboMedians };
        for (const [market, prediction] of Object.entries(medians)) {
          const entry = current.get(`${date}|${eventId}|${p.providerAthleteId}|${market}`);
          if (!entry) throw new Error(`${eventId}/${p.providerAthleteId}/${market}: no ledger entry`);
          const a = axesForNbaRow(entry);
          const actual = a.measurement === MEASUREMENT.MEASURED ? entry.measurement.actual : null;
          rows.push({
            subject: p.name, playerId: p.providerAthleteId, team: g[homeAway].abbr, market, predictionKind: "MEDIAN",
            prediction, actual, absoluteError: absoluteError(prediction, actual), ...a,
          });
        }
      }
    }
    return {
      eventId, start: g.tipUtc, cutoff: g.tipUtc, matchup: `${g.away.abbr} @ ${g.home.abbr}`,
      final: {
        state: "FINAL", score: { away: final.ftAway, home: final.ftHome }, officialSide: g.elo.favoured, sideResult: side.sideResult, claim: side.claim,
        winner: final.ftHome > final.ftAway ? g.home.abbr : g.away.abbr,
      },
      snapshot: {
        servedFrom: laneFile, settledFrom: NBA_RESULT_SOURCE, generatedAt: g.frozenAt,
        sourceVersion: `${g.receipt.modelVersion}@sha256:${g.receipt.payloadSha256}`,
        validationStatus: VALIDATION.SURVEY_MEASURED, evidence: EVIDENCE.BACKFILL_GITHUB,
      },
      rows: rows.sort(byRow),
    };
  });
  const sideResults = games.map((g) => g.final.sideResult);
  const count = (c) => sideResults.filter((x) => x === c).length;
  return dayOf({
    sport: "nba", date, dataClass: lane.dataClass, surveyCommit: surveyed.surveyCommit,
    sourceFiles: { forecast: laneFile, forecastCommit: surveyed.laneCommit, settlement: NBA_RESULT_SOURCE, finals: [finalsFile] }, games,
    extra: { label: lane.label, validation: lane.validation, officialSide: { ...sideAggregate(count("CORRECT"), count("INCORRECT")), push: count("PUSH"), noSide: count("NO_SIDE") } },
  });
}

function main() {
  const sport = arg("sport");
  const date = arg("date");
  if (!["nfl", "nba"].includes(sport) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    console.error("REFUSED: --sport nfl|nba --date YYYY-MM-DD required");
    process.exit(2);
  }
  const surveyed = SURVEYED_DAYS[`${sport}/${date}`];
  if (!surveyed) {
    console.error(`REFUSED: ${sport} ${date} has no surveyed evidence (SURVEYED_DAYS)`);
    process.exit(2);
  }
  const doc = sport === "nfl" ? buildNfl(date, surveyed) : buildNba(date, surveyed);
  const bad = publicSafetyViolations(doc);
  if (bad.length) {
    console.error(`REFUSED: ${bad.length} public-safety violation(s), first: ${bad[0]}`);
    process.exit(1);
  }
  const root = path.resolve(arg("out-root") ?? path.join(REPO, "data/results-projection/v1"));
  const out = path.join(root, sport, `${date}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, canonicalDayJson(doc));
  console.log(`results day: ${sport} ${date} · ${doc.counts.games} games · ${doc.counts.players} players · ${doc.counts.rows} rows → ${path.relative(REPO, out)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
