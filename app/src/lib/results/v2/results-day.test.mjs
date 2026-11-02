/**
 * RESULTS DAY (gtp.results-day@1), the two pilot days measured end to end.
 *
 * Counts are pinned to the survey at f0ca00de2b. A count that moves is a finding, never a number to re-pin: these are
 * settled historical days and their sources are append-only. `actual` is recomputed from a source the builder never reads
 * (official-stats for NFL, the stored box scores for NBA), and the public files are checked by key and by text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { CLAIM, MEASUREMENT, axesForNbaRow, axesForNbaSide, axesForNflRow, absoluteError, canonicalDayJson, familySummary, nflActual, publicSafetyViolations, toDayCsv } from "./contract.mjs";
import { emitResultsV2 } from "../../../../scripts/results/emit-results-v2-assets.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));
const NFL_FILE = "data/results-projection/v1/nfl/2026-10-11.json";
const NBA_FILE = "data/results-projection/v1/nba/2026-10-28.json";
const nfl = json(NFL_FILE);
const nba = json(NBA_FILE);
const rowsOf = (d) => d.games.flatMap((g) => g.rows.map((r) => ({ ...r, eventId: g.eventId })));
const nflRows = rowsOf(nfl);
const nbaRows = rowsOf(nba);
const count = (rows, f) => rows.filter(f).length;
const family = (d, m) => d.families.find((f) => f.market === m);
const nflSource = json("data/internal/nfl/prop-settlement/2026-10-11.json").rows;
const nflKey = (eventId, playerId, market) => `${eventId}:${playerId}:${market}`;
const nflById = new Map(nflSource.map((r) => [r.settlementId, r]));

function tmpDir(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "results-day-"));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

/* ── the exact counts ─────────────────────────────────────────────────────────────────────── */

test("NFL 2026-10-11: 13 games, 246 players, 695 rows; 581 measured, 114 none; 145 W, 111 L, 0 push, per family", () => {
  assert.deepEqual(nfl.counts, { games: 13, players: 246, rows: 695 });
  assert.equal(count(nflRows, (r) => r.measurement === MEASUREMENT.MEASURED), 581);
  assert.equal(count(nflRows, (r) => r.measurement === MEASUREMENT.NO_MEASUREMENT), 114);
  assert.equal(count(nflRows, (r) => r.claim === CLAIM.WIN), 145);
  assert.equal(count(nflRows, (r) => r.claim === CLAIM.LOSS), 111);
  assert.equal(count(nflRows, (r) => r.claim === CLAIM.PUSH), 0);
  assert.deepEqual(nfl.families.map((f) => [f.market, f.rows]), [["player_receptions", 177], ["player_reception_yds", 157], ["player_rush_yds", 96], ["player_pass_yds", 24], ["anytime_td", 241]]);
  assert.deepEqual([family(nfl, "player_receptions").win, family(nfl, "player_receptions").loss, family(nfl, "player_receptions").decided], [74, 56, 130]);
  assert.deepEqual([family(nfl, "player_reception_yds").win, family(nfl, "player_reception_yds").loss, family(nfl, "player_reception_yds").decided], [71, 55, 126]);
  for (const m of ["player_rush_yds", "player_pass_yds", "anytime_td"]) {
    const f = family(nfl, m);
    assert.deepEqual([f.win, f.loss, f.push, f.decided, f.winRate], [0, 0, 0, 0, null], `${m} makes no directional claim`);
    assert.equal(f.noClaim, f.rows);
  }
});

test("NFL source: the survey's 561 is rows with a frozen market object; 355 of them hold a numeric reference, and all 256 decided rows do", () => {
  const market = nflSource.filter((r) => r.frozen.market);
  const numeric = nflSource.filter((r) => typeof r.frozen.market?.line === "number");
  assert.equal(market.length, 561);
  assert.equal(numeric.length, 355);
  assert.equal(market.length - numeric.length, count(nflSource, (r) => r.family === "anytime_td" && r.frozen.market));
  assert.equal(count(nflSource, (r) => ["WIN", "LOSS"].includes(r.forecastResult)), 256);
});

test("NBA 2026-10-28: 12 games, 237 players, 1,659 rows in 7 families; 1,379 measured, 280 none (182 DNP, 98 not in the box score)", () => {
  assert.deepEqual(nba.counts, { games: 12, players: 237, rows: 1659 });
  assert.deepEqual(nba.families.map((f) => [f.market, f.rows]), ["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst"].map((m) => [m, 237]));
  assert.equal(count(nbaRows, (r) => r.measurement === MEASUREMENT.MEASURED), 1379);
  assert.equal(count(nbaRows, (r) => r.measurement === MEASUREMENT.NO_MEASUREMENT), 280);
  assert.equal(count(nbaRows, (r) => r.reason === "DID_NOT_PLAY"), 182);
  assert.equal(count(nbaRows, (r) => r.reason === "NOT_IN_BOX_SCORE"), 98);
});

test("NBA: the official side is 8–4 from the finals record, and every prop row is NO_CLAIM (the ledger's W/L is a median, not a claim)", () => {
  assert.deepEqual(nba.officialSide, { win: 8, loss: 4, push: 0, noPick: 0, decided: 12 });
  assert.equal(count(nbaRows, (r) => r.claim !== CLAIM.NO_CLAIM), 0);
  assert.ok(nba.families.every((f) => f.decided === 0 && f.winRate === null));
  const finals = new Map(json("app/public/data/nba/results/finals-2026-27.json").finals.map((f) => [f.providerEventId, f]));
  for (const g of nba.games) {
    const f = finals.get(g.eventId);
    assert.deepEqual(g.final.score, { away: f.ftAway, home: f.ftHome });
    const winnerSide = f.ftHome > f.ftAway ? "home" : "away";
    const [awayAbbr, homeAbbr] = g.matchup.split(" @ ");
    assert.equal(g.final.claim === CLAIM.WIN, g.final.officialSide === (winnerSide === "home" ? homeAbbr : awayAbbr), g.eventId);
  }
});

/* ── the mappers ──────────────────────────────────────────────────────────────────────────── */

test("a real forecast PUSH with the median on the reference has no side: NO_PICK (10-04: 37.5 on 37.5, final 13)", () => {
  const rows = json("data/internal/nfl/prop-settlement/2026-10-04.json").rows.filter((r) => r.forecastResult === "PUSH");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].settlementId, "401872968:nfl-athlete-4567750:player_reception_yds");
  assert.deepEqual(axesForNflRow(rows[0]), { measurement: "MEASURED", claim: "NO_PICK", reason: "ON_THE_REFERENCE" });
});

const base = {
  settlementId: "e:p:player_receptions", measurementState: "OBSERVED", finality: "CANONICAL", family: "player_receptions", familyState: "PUBLISHED",
  finalStat: 5, lineResult: "OVER", forecastResult: "WIN", frozen: { projection: { median: 6, probability: null }, market: { line: 4.5 } },
};

test("NFL mapper: each branch, in order", () => {
  const claim = (x) => axesForNflRow({ ...base, ...x }).claim;
  assert.equal(claim({}), "WIN");
  assert.equal(claim({ forecastResult: "LOSS" }), "LOSS");
  assert.equal(claim({ forecastResult: "PUSH", lineResult: "PUSH", finalStat: 4.5 }), "PUSH", "a side that landed on the reference is a real push");
  assert.equal(claim({ forecastResult: "NOT_PUBLISHED", familyState: "NOT_THE_PUBLISHED_STATE" }), "NO_CLAIM");
  assert.equal(claim({ family: "anytime_td", forecastResult: "NOT_APPLICABLE" }), "NO_CLAIM");
  assert.equal(claim({ forecastResult: null, frozen: { projection: { median: 6 }, market: null } }), "NO_CLAIM");
  assert.deepEqual(axesForNflRow({ ...base, measurementState: "NO_MEASUREMENT", finalStat: null, forecastResult: null }), { measurement: "NO_MEASUREMENT", claim: "NO_CLAIM", reason: "NO_STAT_ROW" });
  assert.equal(axesForNflRow({ ...base, finality: "PROVISIONAL" }).measurement, "PENDING", "not final is pending, never a result");
  assert.equal(axesForNflRow({ ...base, measurementState: "VOID" }).measurement, "VOID");
  assert.throws(() => axesForNflRow({ ...base, measurementState: "SOMETHING_NEW" }), /unknown measurementState/);
  assert.throws(() => axesForNflRow({ ...base, forecastResult: "SOMETHING_NEW" }), /unknown forecastResult/);
  assert.throws(() => axesForNflRow({ ...base, forecastResult: "PUSH", lineResult: "OVER" }), /with a side/);
});

test("NFL actual: anytime TD is YES or NO, and an unmeasured row has no actual at all", () => {
  assert.equal(nflActual({ family: "anytime_td", finalStat: 2 }, { measurement: "MEASURED" }), "YES");
  assert.equal(nflActual({ family: "anytime_td", finalStat: 0 }, { measurement: "MEASURED" }), "NO");
  assert.equal(nflActual({ family: "player_receptions", finalStat: 0 }, { measurement: "MEASURED" }), 0, "a measured zero is a result");
  assert.equal(nflActual({ family: "player_receptions", finalStat: null }, { measurement: "NO_MEASUREMENT" }), null);
  assert.equal(absoluteError(0.45, "NO"), null);
});

test("NBA mappers: every ledger state maps, an unknown one stops the build, and a W/L in the entry changes nothing", () => {
  const graded = { key: "k", state: "GRADED", measurement: { actual: 13, syntheticMedianLine: { outcome: "WIN" } } };
  assert.deepEqual(axesForNbaRow(graded), { measurement: "MEASURED", claim: "NO_CLAIM", reason: "EXPERIMENTAL_LANE" });
  assert.equal(axesForNbaRow({ state: "PENDING_FINAL" }).measurement, "PENDING");
  assert.equal(axesForNbaRow({ state: "PENDING_BOXSCORE" }).measurement, "PENDING");
  assert.equal(axesForNbaRow({ state: "VOID_PENDING_REVIEW" }).measurement, "VOID");
  assert.throws(() => axesForNbaRow({ state: "NEW" }), /unknown ledger state/);
  assert.throws(() => axesForNbaRow({ state: "NO_MEASUREMENT", code: "NEW" }), /unknown NO_MEASUREMENT/);
  const game = { elo: { favoured: "NY", state: "FAVOURED" }, home: { abbr: "CHI" }, away: { abbr: "NY" } };
  assert.equal(axesForNbaSide(game, { ftHome: 127, ftAway: 133 }).claim, "WIN");
  assert.equal(axesForNbaSide(game, { ftHome: 133, ftAway: 127 }).claim, "LOSS");
  assert.equal(axesForNbaSide(game, null).measurement, "PENDING");
  assert.equal(axesForNbaSide({ ...game, elo: { favoured: null, state: "NO_SIDE" } }, { ftHome: 1, ftAway: 2 }).claim, "NO_PICK");
});

test("familySummary: only WIN and LOSS enter the rate, each market alone, and there is no total to pool", () => {
  const r = (market, measurement, claim) => ({ market, measurement, claim });
  const out = familySummary([
    r("pts", "MEASURED", "WIN"), r("pts", "MEASURED", "LOSS"), r("pts", "MEASURED", "LOSS"), r("pts", "MEASURED", "PUSH"), r("pts", "MEASURED", "NO_PICK"),
    r("pts", "PENDING", "NO_CLAIM"), r("pts", "VOID", "NO_CLAIM"), r("pts", "NO_MEASUREMENT", "NO_CLAIM"), r("anytime_td", "MEASURED", "NO_CLAIM"),
  ]);
  assert.deepEqual(out.map((f) => f.market), ["anytime_td", "pts"], "display order, one entry per market");
  assert.deepEqual([out[1].win, out[1].loss, out[1].push, out[1].noPick, out[1].pending, out[1].void, out[1].noMeasurement, out[1].decided, out[1].winRate], [1, 2, 1, 1, 1, 1, 1, 3, 0.3333]);
  assert.equal(out[0].winRate, null);
  assert.equal(nfl.total ?? nfl.overall ?? nfl.winRate ?? null, null, "no day-level rate");
});

/* ── frozen predictions and actuals against independent sources ───────────────────────────── */

test("NFL: every prediction, claim and missing stat is the settlement row's own, unchanged", () => {
  assert.equal(nflRows.length, nflSource.length);
  for (const r of nflRows) {
    const s = nflById.get(nflKey(r.eventId, r.playerId, r.market));
    assert.ok(s, r.playerId);
    assert.equal(r.prediction, r.market === "anytime_td" ? s.frozen.projection.probability : s.frozen.projection.median);
    if (r.claim === CLAIM.WIN || r.claim === CLAIM.LOSS) {
      assert.equal(typeof s.frozen.market?.line, "number", `${s.settlementId}: a WIN or LOSS needs a frozen reference`);
      assert.equal(s.forecastResult, r.claim);
      assert.equal(s.familyState, "PUBLISHED");
    }
  }
});

test("NFL: 385 yardage and reception actuals recompute from official-stats; anytime TD agrees with the touchdown scorers", () => {
  const key = { player_pass_yds: "passYds", player_rush_yds: "rushYds", player_reception_yds: "recYds", player_receptions: "receptions" };
  const stats = new Map(nfl.games.map((g) => [g.eventId, json(`data/internal/nfl/official-stats/${g.eventId}.json`)]));
  let checked = 0;
  let touchdowns = 0;
  for (const r of nflRows) {
    if (r.measurement !== MEASUREMENT.MEASURED) continue;
    const o = stats.get(r.eventId);
    const id = r.playerId.replace("nfl-athlete-", "");
    if (r.market === "anytime_td") {
      const scored = o.scorers.some((s) => s.playerId === id && s.creditType !== "PASS");
      if (scored) assert.equal(r.actual, "YES", `${r.subject} is a credited scorer in ${r.eventId}`);
      if (scored) touchdowns += 1;
      continue;
    }
    assert.equal(r.actual, o.players[id][key[r.market]], `${r.subject} ${r.market}`);
    checked += 1;
  }
  assert.equal(checked, 385);
  assert.ok(touchdowns > 0, "the scorer check ran");
  for (const g of nfl.games) assert.deepEqual(g.final.score, { away: stats.get(g.eventId).finalScore.away, home: stats.get(g.eventId).finalScore.home }, g.eventId);
});

test("NO_MEASUREMENT never has an actual: not 0 and not any other number, including the 9 rows official-stats fills with 0", () => {
  for (const r of [...nflRows, ...nbaRows]) {
    if (r.measurement === MEASUREMENT.MEASURED) continue;
    assert.equal(r.actual, null, `${r.subject} ${r.market}`);
    assert.equal(r.absoluteError, null);
  }
  const key = { player_pass_yds: "passYds", player_rush_yds: "rushYds", player_reception_yds: "recYds", player_receptions: "receptions" };
  const zeroFilled = nflRows.filter((r) => {
    if (r.measurement !== MEASUREMENT.NO_MEASUREMENT || !key[r.market]) return false;
    const p = json(`data/internal/nfl/official-stats/${r.eventId}.json`).players[r.playerId.replace("nfl-athlete-", "")];
    return p?.[key[r.market]] === 0;
  });
  assert.equal(zeroFilled.length, 9, "official-stats reports 0 for these, and the settlement says no stat row: the settlement stands");
});

test("NBA: all 1,379 actuals recompute from the stored box scores, all 280 absences hold, and predictions are the lane's medians", () => {
  const lane = new Map();
  for (const g of json("app/public/data/nba/experimental-public/2026-10-28.json").games) {
    for (const p of [...g.players.away, ...g.players.home]) for (const [m, v] of Object.entries({ ...p.medians, ...p.comboMedians })) lane.set(`${g.providerEventId}|${p.providerAthleteId}|${m}`, v);
  }
  const box = new Map(nba.games.map((g) => [g.eventId, new Map(json(`data/internal/research/nba/experimental/boxscores/${g.eventId}.json`).players.map((p) => [p.providerAthleteId, p]))]));
  const value = (p, m) => ({ pts: p.pts, reb: p.reb, ast: p.ast, threePm: p.threePm, pra: p.pts + p.reb + p.ast, ptsReb: p.pts + p.reb, ptsAst: p.pts + p.ast })[m];
  let measured = 0;
  let absent = 0;
  for (const r of nbaRows) {
    assert.equal(r.prediction, lane.get(`${r.eventId}|${r.playerId}|${r.market}`), `${r.subject} ${r.market}`);
    const p = box.get(r.eventId).get(r.playerId);
    if (r.measurement === MEASUREMENT.MEASURED) {
      assert.equal(r.actual, value(p, r.market), `${r.subject} ${r.market}`);
      assert.equal(r.absoluteError, Number(Math.abs(r.prediction - r.actual).toFixed(2)));
      measured += 1;
    } else {
      if (r.reason === "NOT_IN_BOX_SCORE") assert.equal(p, undefined, r.subject);
      else assert.ok(p?.didNotPlay || !p?.minutes, r.subject);
      absent += 1;
    }
  }
  assert.deepEqual([measured, absent], [1379, 280]);
});

test("every game was frozen before its cutoff and carries traceable provenance labelled as a backfill", () => {
  for (const d of [nfl, nba]) {
    assert.equal(d.provenance.evidence, "BACKFILL_GITHUB");
    assert.equal(d.provenance.validationStatus, "SURVEY_MEASURED");
    for (const g of d.games) {
      assert.ok(Date.parse(g.snapshot.generatedAt) < Date.parse(g.cutoff), g.eventId);
      assert.deepEqual([g.snapshot.evidence, g.snapshot.validationStatus], ["BACKFILL_GITHUB", "SURVEY_MEASURED"]);
      assert.ok(fs.existsSync(path.join(REPO, g.snapshot.servedFrom)), g.snapshot.servedFrom);
      assert.ok(fs.existsSync(path.join(REPO, g.snapshot.settledFrom)), g.snapshot.settledFrom);
      assert.ok(g.snapshot.sourceVersion, g.eventId);
    }
  }
  assert.match(read("docs/RESULTS_V2_PILOT_NOTE.md"), new RegExp(nfl.provenance.surveyCommit));
});

/* ── public files ─────────────────────────────────────────────────────────────────────────── */

const FIELD_BAN = /"(line|odds|sportsbook|book|bookmaker|overOdds|underOdds|yesOdds|overPrice|underPrice|price|p10|p90|band80|low|high|range|frozen|teamScores|projectedScore|syntheticMedianLine)"\s*:/i;
const TEXT_BAN = /\bline\b|\bodds\b|sportsbook|draftkings|fanduel|betmgm|betrivers|caesars|synthetic|[+-]\d{3}\b/i;

test("the public JSON and CSV carry no price, no book, no reference, no NBA range and no team-score forecast", (t) => {
  const dir = tmpDir(t);
  const out = emitResultsV2({ outDir: dir });
  assert.deepEqual(out.files, ["index.json", "nba/2026-10-28.csv", "nba/2026-10-28.json", "nfl/2026-10-11.csv", "nfl/2026-10-11.json"]);
  for (const f of out.files) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    assert.doesNotMatch(text, FIELD_BAN, f);
    assert.doesNotMatch(text, TEXT_BAN, f);
    assert.deepEqual(publicSafetyViolations(text), [], f);
  }
  /* The sealed file is the public file, byte for byte: the guard above covers both. */
  assert.equal(fs.readFileSync(path.join(dir, "nfl/2026-10-11.json"), "utf8"), read(NFL_FILE));
  assert.equal(fs.readFileSync(path.join(dir, "nba/2026-10-28.json"), "utf8"), read(NBA_FILE));
  assert.equal(fs.readFileSync(path.join(dir, "nfl/2026-10-11.csv"), "utf8").trimEnd().split("\n").length, 696);
  assert.equal(fs.readFileSync(path.join(dir, "nba/2026-10-28.csv"), "utf8").trimEnd().split("\n").length, 1660);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8")).days.map((d) => [d.sport, d.date, d.rows]), [["nba", "2026-10-28", 1659], ["nfl", "2026-10-11", 695]]);
});

test("the safety check catches a planted price, book or range, by key and by text, and the emit step refuses it", (t) => {
  for (const planted of [{ line: 5.5 }, { overOdds: -110 }, { sportsbook: "x" }, { p10: 1 }, { band80: {} }, { nested: [{ price: 1 }] }, { note: "draftkings" }, { note: "the line moved" }, { note: "-110" }]) {
    assert.notDeepEqual(publicSafetyViolations({ ...nfl, ...planted }), [], JSON.stringify(planted));
  }
  assert.deepEqual(publicSafetyViolations(nfl), []);
  const sealed = tmpDir(t);
  fs.mkdirSync(path.join(sealed, "nfl"));
  fs.writeFileSync(path.join(sealed, "nfl", "2026-10-11.json"), canonicalDayJson({ ...nfl, games: [{ ...nfl.games[0], rows: [{ ...nfl.games[0].rows[0], line: 5.5 }] }] }));
  assert.throws(() => emitResultsV2({ sealedDir: sealed, outDir: path.join(sealed, "o") }), /forbidden key/);
});

test("delete → regenerate → identical bytes, spawned the way CI runs it, and two emits match", (t) => {
  const dir = tmpDir(t);
  const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");
  const builder = path.join("scripts", "results", "build-results-day.mjs");
  for (const [sport, date, committed] of [["nfl", "2026-10-11", NFL_FILE], ["nba", "2026-10-28", NBA_FILE]]) {
    const run = spawnSync("npx", ["tsx", builder, "--sport", sport, "--date", date, "--out-root", dir], { cwd: APP, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(sha(fs.readFileSync(path.join(dir, sport, `${date}.json`))), sha(read(committed)), `${sport} ${date} regenerated differently`);
  }
  const refused = spawnSync("npx", ["tsx", builder, "--sport", "nfl", "--date", "2026-10-18", "--out-root", dir], { cwd: APP, encoding: "utf8" });
  assert.equal(refused.status, 2, "a day with no surveyed evidence is refused, never softened");
  assert.equal(fs.existsSync(path.join(dir, "nfl", "2026-10-18.json")), false);
  const a = emitResultsV2({ outDir: path.join(dir, "a") });
  const b = emitResultsV2({ outDir: path.join(dir, "b") });
  assert.deepEqual(a, b);
  for (const f of a.files) assert.equal(sha(fs.readFileSync(path.join(dir, "a", f))), sha(fs.readFileSync(path.join(dir, "b", f))), f);
  assert.equal(toDayCsv(nfl), fs.readFileSync(path.join(dir, "a", "nfl/2026-10-11.csv"), "utf8"));
});

test("no wall clock and no day-level hash in the builder, the emit step or the day files", () => {
  for (const f of ["app/scripts/results/build-results-day.mjs", "app/scripts/results/emit-results-v2-assets.mjs", "app/src/lib/results/v2/contract.mjs"]) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /Date\.now|new Date\(|createHash/, f);
  }
  for (const d of [nfl, nba]) {
    const top = Object.keys(d);
    for (const k of ["generatedAt", "builtAt", "updatedAt", "sha256", "hash"]) assert.ok(!top.includes(k), k);
  }
});

/* ── the site's boundary ──────────────────────────────────────────────────────────────────── */

const appFile = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const SHELL = "src/components/results/results-day-explorer.tsx";
const PAGE = "src/app/results/day/page.tsx";

test("the site reads only the sealed files: no page, component or emit step names the private ledger or a data/internal path", () => {
  for (const f of [SHELL, PAGE, "scripts/results/emit-results-v2-assets.mjs", "src/lib/results/v2/contract.mjs"]) {
    const code = appFile(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /data\/internal|prop-grades|ledger\.jsonl|PRIVATE_RESEARCH/, f);
  }
  const offenders = [];
  const scan = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) scan(p);
      else if (/\.(ts|tsx|mjs)$/.test(e.name) && !/\.test\.mjs$/.test(e.name) && /results-projection/.test(fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""))) offenders.push(path.relative(APP, p));
    }
  };
  scan(path.join(APP, "src", "app"));
  scan(path.join(APP, "src", "components"));
  assert.deepEqual(offenders, [], "pages fetch the emitted copy; they do not read the sealed directory");
});

test("wiring: emitted before next build, kept by the prune, gitignored, a build input; a shell with no props", () => {
  const build = JSON.parse(appFile("package.json")).scripts.build;
  assert.ok(build.indexOf("emit-results-v2-assets") > -1 && build.indexOf("emit-results-v2-assets") < build.indexOf("next-build"));
  assert.match(appFile("scripts/vercel-ignore-build.sh"), /':\(top\)data\/results-projection\/'/);
  assert.match(appFile("scripts/prune-internal-routes.mjs"), /"results\/v2\/"\]/);
  assert.match(read(".gitignore"), /^app\/public\/data\/results\/v2\/$/m);
  assert.equal((appFile("src/app/results/page.tsx").match(/\/results\/day\//g) ?? []).length, 1, "/results adds one link and nothing else");
  assert.doesNotMatch(appFile("src/app/layout.tsx"), /results-day|results\/day/);
  assert.doesNotMatch(appFile("src/app/not-found.tsx"), /results-day|results\/day/);
  assert.doesNotMatch(appFile(PAGE), /fs\.|readFile|fetch\(/, "the page holds no data");
});

test("the shell: 44px targets, aria-pressed toggles, a CSV link, the lane's experimental label, and no banned projection label", () => {
  const src = appFile(SHELL);
  assert.match(src, /\.btn\{min-height:44px;min-width:44px/);
  assert.match(src, /\.rd summary\{min-height:44px/);
  assert.match(src, /\.rd select,\.rd input\{min-height:44px/);
  assert.match(src, /\.rd a\.l\{[^}]*min-height:44px/);
  assert.match(src, /aria-pressed=\{o\.id === value\}/);
  assert.match(src, /entry\.csv/);
  assert.match(src, /Model projection/);
  assert.equal(nba.label, "UNVALIDATED EXPERIMENTAL SIMULATION");
  assert.match(src, /day\.label/);
  for (const text of [src, appFile("src/lib/results/v2/contract.mjs"), read(NFL_FILE), read(NBA_FILE)]) {
    assert.doesNotMatch(text, /\bESTIMATED?\b|PROJECTED MEDIAN|\best\.(?=\s|$)/i);
  }
});
