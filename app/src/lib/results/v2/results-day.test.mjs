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

import { CLAIM, MEASUREMENT, PUBLIC_EVIDENCE, SIDE_RESULT, axesForNbaRow, axesForNbaSide, axesForNflRow, absoluteError, canonicalDayJson, familySummary, modelSideOf, nflActual, officialClaim, publicRow, publicSafetyViolations, sideAggregate, toDayCsv, wilson95 } from "./contract.mjs";
import { ROUTE_TABLE } from "../../audits/route-inventory.mjs";
import { emitResultsV2 } from "../../../../scripts/results/emit-results-v2-assets.mjs";
import { nbaSeasonOf } from "../../../../scripts/results/build-results-day.mjs";

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
/* Sealed rows carry no side. The mapper's side, recomputed from the source, is what the family totals count. */
const nflAxes = nflRows.map((r) => ({ ...r, ...axesForNflRow(nflById.get(nflKey(r.eventId, r.playerId, r.market))) }));

function tmpDir(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "results-day-"));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

/* ── the exact counts ─────────────────────────────────────────────────────────────────────── */

test("NFL 2026-10-11: 13 games, 246 players, 695 rows; 581 measured, 114 none; 145 CORRECT, 111 INCORRECT, 0 push as side results, per family", () => {
  assert.deepEqual(nfl.counts, { games: 13, players: 246, rows: 695 });
  assert.equal(count(nflRows, (r) => r.measurement === MEASUREMENT.MEASURED), 581);
  assert.equal(count(nflRows, (r) => r.measurement === MEASUREMENT.NO_MEASUREMENT), 114);
  assert.equal(count(nflAxes, (r) => r.sideResult === SIDE_RESULT.CORRECT), 145);
  assert.equal(count(nflAxes, (r) => r.sideResult === SIDE_RESULT.INCORRECT), 111);
  assert.equal(count(nflAxes, (r) => r.sideResult === SIDE_RESULT.PUSH), 0);
  assert.deepEqual(nfl.families.map((f) => [f.market, f.rows]), [["player_receptions", 177], ["player_reception_yds", 157], ["player_rush_yds", 96], ["player_pass_yds", 24], ["anytime_td", 241]]);
  assert.deepEqual(family(nfl, "player_receptions").side, { compared: 130, correct: 74, incorrect: 56, wilson95: wilson95(74, 130), indistinguishableFromHalf: true });
  assert.deepEqual(family(nfl, "player_reception_yds").side, { compared: 126, correct: 71, incorrect: 55, wilson95: wilson95(71, 126), indistinguishableFromHalf: true });
  for (const m of ["player_rush_yds", "player_pass_yds", "anytime_td"]) assert.equal(family(nfl, m).side, null, `${m} has no side comparison`);
});

test("🔴 no pilot row or game is an official betting result: every claim is NO_CLAIM, and no official count exists", () => {
  for (const d of [nfl, nba]) {
    assert.equal(d.provenance.validationStatus, "SURVEY_MEASURED");
    assert.equal(count(rowsOf(d), (r) => r.claim !== CLAIM.NO_CLAIM), 0);
    assert.equal(count(d.games, (g) => (g.final.claim ?? CLAIM.NO_CLAIM) !== CLAIM.NO_CLAIM), 0);
    for (const f of d.families) {
      assert.deepEqual([f.win, f.loss, f.push, f.noPick, f.decided], [0, 0, 0, 0, 0], f.market);
      assert.ok(!("winRate" in f) && !("sideCorrectRate" in f), `${f.market}: no bare rate field`);
      assert.equal(f.noClaim, f.rows, f.market);
    }
  }
});

test("officialClaim needs a verified reference, snapshot and settlement rule, all three; a side result alone is never enough", () => {
  const all = { qualifyingReference: true, snapshot: true, settlementRule: true };
  assert.deepEqual(["CORRECT", "INCORRECT", "PUSH", "NO_SIDE", null].map((s) => officialClaim(s, all)), ["WIN", "LOSS", "PUSH", "NO_PICK", "NO_CLAIM"]);
  assert.equal(officialClaim("CORRECT"), "NO_CLAIM");
  for (const missing of Object.keys(all)) assert.equal(officialClaim("CORRECT", { ...all, [missing]: false }), "NO_CLAIM", missing);
  assert.equal(officialClaim("CORRECT", { ...all, snapshot: "SURVEY_MEASURED" }), "NO_CLAIM", "only a verified true passes");
});

test("🔴 no sealed row carries a side: modelSide and sideResult exist only in the mapper, and 355 rows had one before sealing", () => {
  for (const r of [...nflRows, ...nbaRows]) {
    assert.ok(!("modelSide" in r) && !("sideResult" in r), `${r.subject} ${r.market}`);
    assert.ok(!["SIDE_COMPARED", "NO_MODEL_SIDE"].includes(r.reason), `${r.subject}: a reason that names a per-row comparison`);
  }
  let sided = 0;
  for (const r of nflAxes) {
    const s = nflById.get(nflKey(r.eventId, r.playerId, r.market));
    const reference = s.frozen.market?.line;
    const expected = typeof reference !== "number" || s.frozen.projection.median === reference ? null : s.frozen.projection.median > reference ? "OVER" : "UNDER";
    assert.equal(r.modelSide, expected, s.settlementId);
    if (expected) sided += 1;
    if (r.sideResult === "CORRECT" || r.sideResult === "INCORRECT") assert.equal(r.sideResult === "CORRECT", expected === s.lineResult, s.settlementId);
  }
  assert.equal(sided, 355, "the 355 rows that would have bracketed their line");
  assert.equal(count(nflRows, (r) => r.reason === "SIDE_AGGREGATE_ONLY"), 256);
  assert.equal(modelSideOf(37.5, 37.5), null, "a median on the reference has no side");
  assert.deepEqual(publicRow({ subject: "x", modelSide: "OVER", sideResult: "CORRECT", reason: "SIDE_COMPARED" }), { subject: "x", reason: "SIDE_AGGREGATE_ONLY" });
});

test("side aggregates: counts plus a 95% Wilson interval, never a rate; suppressed below 10 compared or when an outcome is zero", () => {
  assert.deepEqual(wilson95(74, 130), { lower: 0.4833, upper: 0.6512 });
  assert.deepEqual(wilson95(8, 12), { lower: 0.3906, upper: 0.8619 });
  assert.equal(wilson95(0, 0), null);
  assert.equal(sideAggregate(0, 0), null);
  assert.deepEqual(sideAggregate(6, 3), { suppressed: true, minimumCompared: 10 });
  assert.deepEqual(sideAggregate(0, 40), { suppressed: true, minimumCompared: 10 }, "all incorrect would bracket every compared row");
  assert.deepEqual(sideAggregate(40, 0), { suppressed: true, minimumCompared: 10 });
  assert.equal(sideAggregate(90, 10).indistinguishableFromHalf, false);
  assert.equal(sideAggregate(6, 5).indistinguishableFromHalf, true);
});

test("NBA season string is right across a century and a calendar year", () => {
  assert.equal(nbaSeasonOf("2026-10-28"), "2026-27");
  assert.equal(nbaSeasonOf("2027-03-01"), "2026-27");
  assert.equal(nbaSeasonOf("2099-11-01"), "2099-00");
  assert.equal(nbaSeasonOf("2100-02-01"), "2099-00");
  assert.equal(nbaSeasonOf("2009-12-01"), "2009-10");
});

test("accuracy stays apart: meanAbsoluteError per market recomputes from row errors, and yes or no markets have none", () => {
  for (const d of [nfl, nba]) {
    for (const f of d.families) {
      const errs = rowsOf(d).filter((r) => r.market === f.market && r.absoluteError != null).map((r) => r.absoluteError);
      assert.equal(f.errorRows, errs.length, f.market);
      assert.equal(f.meanAbsoluteError, errs.length ? Number((errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(2)) : null, f.market);
    }
  }
  assert.equal(family(nfl, "anytime_td").meanAbsoluteError, null);
  assert.deepEqual(nfl.families.map((f) => f.errorRows), [149, 136, 76, 24, 0]);
  assert.deepEqual(nba.families.map((f) => f.errorRows), Array(7).fill(197));
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

test("NBA: the official side vs the final is 8 of 12 with a Wilson interval that includes 50%, per game, and not a claim", () => {
  assert.deepEqual(nba.officialSide, { correct: 8, incorrect: 4, push: 0, noSide: 0, compared: 12, wilson95: { lower: 0.3906, upper: 0.8619 }, indistinguishableFromHalf: true });
  const finals = new Map(json("app/public/data/nba/results/finals-2026-27.json").finals.map((f) => [f.providerEventId, f]));
  for (const g of nba.games) {
    const f = finals.get(g.eventId);
    assert.deepEqual(g.final.score, { away: f.ftAway, home: f.ftHome });
    const winnerSide = f.ftHome > f.ftAway ? "home" : "away";
    const [awayAbbr, homeAbbr] = g.matchup.split(" @ ");
    assert.equal(g.final.sideResult === SIDE_RESULT.CORRECT, g.final.officialSide === (winnerSide === "home" ? homeAbbr : awayAbbr), g.eventId);
  }
});

/* ── the mappers ──────────────────────────────────────────────────────────────────────────── */

test("a real forecast PUSH with the median on the reference has no side: NO_SIDE, and no claim (10-04: 37.5 on 37.5, final 13)", () => {
  const rows = json("data/internal/nfl/prop-settlement/2026-10-04.json").rows.filter((r) => r.forecastResult === "PUSH");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].settlementId, "401872968:nfl-athlete-4567750:player_reception_yds");
  assert.deepEqual(axesForNflRow(rows[0]), { measurement: "MEASURED", modelSide: null, sideResult: "NO_SIDE", claim: "NO_CLAIM", reason: "NO_MODEL_SIDE" });
  assert.equal(publicRow(axesForNflRow(rows[0])).reason, "SIDE_AGGREGATE_ONLY", "a median on the line is never named per row: it would print the line");
  assert.equal(officialClaim("NO_SIDE", { qualifyingReference: true, snapshot: true, settlementRule: true }), "NO_PICK");
});

const base = {
  settlementId: "e:p:player_receptions", measurementState: "OBSERVED", finality: "CANONICAL", family: "player_receptions", familyState: "PUBLISHED",
  finalStat: 5, lineResult: "OVER", forecastResult: "WIN", frozen: { projection: { median: 6, probability: null }, market: { line: 4.5 } },
};

test("NFL mapper: each branch, in order, and none of them reaches an official claim", () => {
  const side = (x) => axesForNflRow({ ...base, ...x }).sideResult;
  assert.equal(side({}), "CORRECT");
  assert.equal(side({ forecastResult: "LOSS" }), "INCORRECT");
  assert.equal(side({ forecastResult: "PUSH", lineResult: "PUSH", finalStat: 4.5 }), "PUSH", "a side that landed on the reference is a real push");
  assert.equal(side({ forecastResult: "NOT_PUBLISHED", familyState: "NOT_THE_PUBLISHED_STATE" }), null);
  assert.equal(axesForNflRow({ ...base, forecastResult: "NOT_PUBLISHED", familyState: "NOT_THE_PUBLISHED_STATE" }).modelSide, "OVER", "the side still shows, uncompared");
  assert.equal(side({ family: "anytime_td", forecastResult: "NOT_APPLICABLE" }), null);
  assert.equal(side({ forecastResult: null, frozen: { projection: { median: 6 }, market: null } }), null);
  assert.deepEqual(axesForNflRow({ ...base, measurementState: "NO_MEASUREMENT", finalStat: null, forecastResult: null }), { measurement: "NO_MEASUREMENT", modelSide: "OVER", sideResult: null, claim: "NO_CLAIM", reason: "NO_STAT_ROW" });
  assert.equal(axesForNflRow({ ...base, finality: "PROVISIONAL" }).measurement, "PENDING", "not final is pending, never a result");
  assert.equal(axesForNflRow({ ...base, measurementState: "VOID" }).measurement, "VOID");
  assert.equal(axesForNflRow({ ...base }).claim, "NO_CLAIM");
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
  assert.deepEqual(axesForNbaRow(graded), { measurement: "MEASURED", modelSide: null, sideResult: null, claim: "NO_CLAIM", reason: "EXPERIMENTAL_LANE" });
  assert.equal(axesForNbaRow({ state: "PENDING_FINAL" }).measurement, "PENDING");
  assert.equal(axesForNbaRow({ state: "PENDING_BOXSCORE" }).measurement, "PENDING");
  assert.equal(axesForNbaRow({ state: "VOID_PENDING_REVIEW" }).measurement, "VOID");
  assert.throws(() => axesForNbaRow({ state: "NEW" }), /unknown ledger state/);
  assert.throws(() => axesForNbaRow({ state: "NO_MEASUREMENT", code: "NEW" }), /unknown NO_MEASUREMENT/);
  const game = { elo: { favoured: "NY", state: "FAVOURED" }, home: { abbr: "CHI" }, away: { abbr: "NY" } };
  assert.equal(axesForNbaSide(game, { ftHome: 127, ftAway: 133 }).sideResult, "CORRECT");
  assert.equal(axesForNbaSide(game, { ftHome: 133, ftAway: 127 }).sideResult, "INCORRECT");
  assert.equal(axesForNbaSide(game, { ftHome: 127, ftAway: 133 }).claim, "NO_CLAIM");
  assert.equal(axesForNbaSide(game, null).measurement, "PENDING");
  assert.equal(axesForNbaSide({ ...game, elo: { favoured: null, state: "NO_SIDE" } }, { ftHome: 1, ftAway: 2 }).sideResult, "NO_SIDE");
});

test("familySummary: CORRECT and INCORRECT alone enter the side aggregate, push and no-side are never published, each market alone, no total", () => {
  const r = (market, measurement, sideResult, claim = "NO_CLAIM", absoluteError = null) => ({ market, measurement, sideResult, claim, absoluteError });
  const many = (n, side) => Array.from({ length: n }, () => r("reb", "MEASURED", side));
  const out = familySummary([
    r("pts", "MEASURED", "CORRECT", "NO_CLAIM", 1), r("pts", "MEASURED", "INCORRECT", "NO_CLAIM", 2), r("pts", "MEASURED", "INCORRECT", "NO_CLAIM", 4), r("pts", "MEASURED", "PUSH"), r("pts", "MEASURED", "NO_SIDE"),
    r("pts", "PENDING", null), r("pts", "VOID", null), r("pts", "NO_MEASUREMENT", null), r("anytime_td", "MEASURED", null), ...many(7, "CORRECT"), ...many(5, "INCORRECT"),
  ]);
  assert.deepEqual(out.map((f) => f.market), ["anytime_td", "pts", "reb"], "display order, one entry per market");
  const p = out[1];
  assert.deepEqual([p.pending, p.void, p.noMeasurement, p.side], [1, 1, 1, { suppressed: true, minimumCompared: 10 }]);
  assert.deepEqual([p.errorRows, p.meanAbsoluteError, p.decided], [3, 2.33, 0], "a side result never becomes an official count");
  assert.ok(!("sidePush" in p) && !("noSide" in p) && !("sideCorrectRate" in p) && !("winRate" in p));
  assert.deepEqual(out[2].side, { compared: 12, correct: 7, incorrect: 5, wilson95: wilson95(7, 12), indistinguishableFromHalf: true });
  assert.equal(out[0].side, null);
  assert.equal(nfl.total ?? nfl.overall ?? nfl.winRate ?? nfl.sideCorrectRate ?? null, null, "no day-level rate");
});

/* ── frozen predictions and actuals against independent sources ───────────────────────────── */

test("NFL: every prediction and missing stat is the settlement row's own, unchanged", () => {
  assert.equal(nflRows.length, nflSource.length);
  for (const r of nflRows) {
    const s = nflById.get(nflKey(r.eventId, r.playerId, r.market));
    assert.ok(s, r.playerId);
    assert.equal(r.prediction, r.market === "anytime_td" ? s.frozen.projection.probability : s.frozen.projection.median);
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
      assert.match(g.snapshot.settledFrom, /record/, "a named source, because the sealed file is served and the site never prints an internal path");
      assert.doesNotMatch(JSON.stringify(g.snapshot), /data\/internal/);
      assert.ok(g.snapshot.sourceVersion, g.eventId);
    }
  }
  assert.match(read("docs/RESULTS_V2_PILOT_NOTE.md"), new RegExp(nfl.provenance.surveyCommit));
});

/* ── public files ─────────────────────────────────────────────────────────────────────────── */

const FIELD_BAN = /"(line|odds|sportsbook|book|bookmaker|overOdds|underOdds|yesOdds|overPrice|underPrice|price|p10|p90|band80|low|high|range|frozen|teamScores|projectedScore|syntheticMedianLine)"\s*:/i;
const TEXT_BAN = /\bline\b|\bodds\b|sportsbook|draftkings|fanduel|betmgm|betrivers|caesars|synthetic|[+-]\d{3}\b/i;

test("🔴 BACKFILL_GITHUB days stay private: the real emit writes an empty index and no day file", (t) => {
  assert.deepEqual(PUBLIC_EVIDENCE, [], "no evidence class is public yet");
  const dir = tmpDir(t);
  const out = emitResultsV2({ outDir: dir });
  assert.deepEqual(out, { days: 0, withheld: 2, files: ["index.json"] });
  assert.deepEqual(fs.readdirSync(dir), ["index.json"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8")), { days: [], schema: "gtp.results-day-index@1" });
  const missing = emitResultsV2({ sealedDir: path.join(dir, "nope"), outDir: path.join(dir, "empty") });
  assert.deepEqual(missing, { days: 0, withheld: 0, files: ["index.json"] }, "an empty index is valid, not a refusal");
});

test("file shapes (evidence allowed only in this test): a small summary, one file per game, a CSV; no price, no book, no side", (t) => {
  const dir = tmpDir(t);
  const out = emitResultsV2({ outDir: dir, publicEvidence: ["BACKFILL_GITHUB"] });
  assert.equal(out.days, 2);
  assert.equal(out.files.length, 1 + 2 + 2 + nfl.games.length + nba.games.length);
  for (const f of out.files) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    assert.doesNotMatch(text, FIELD_BAN, f);
    assert.doesNotMatch(text, TEXT_BAN, f);
    assert.doesNotMatch(text, /modelSide|\bOVER\b|\bUNDER\b/, f);
    assert.deepEqual(publicSafetyViolations(text), [], f);
  }
  const summary = fs.readFileSync(path.join(dir, "nba/2026-10-28.json"), "utf8");
  assert.ok(summary.length < 40_000, `the NBA summary a phone loads first is ${summary.length} bytes`);
  const s = JSON.parse(summary);
  assert.equal(s.games.every((g) => !("rows" in g) && g.rowsFile.startsWith("/data/results/v2/nba/2026-10-28/")), true);
  assert.equal(s.games.reduce((a, g) => a + g.rowCount, 0), 1659);
  const g0 = JSON.parse(fs.readFileSync(path.join(dir, `nba/2026-10-28/${nba.games[0].eventId}.json`), "utf8"));
  assert.deepEqual(g0.rows, nba.games[0].rows, "per-game rows are the sealed rows");
  assert.equal(fs.readFileSync(path.join(dir, "nfl/2026-10-11.csv"), "utf8").trimEnd().split("\n").length, 696);
  assert.equal(fs.readFileSync(path.join(dir, "nba/2026-10-28.csv"), "utf8").trimEnd().split("\n").length, 1660);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8")).days.map((d) => [d.sport, d.date, d.rows]), [["nba", "2026-10-28", 1659], ["nfl", "2026-10-11", 695]]);
});

test("the safety check catches a planted price, book or range, by key and by text, and the emit step refuses it", (t) => {
  for (const planted of [{ line: 5.5 }, { overOdds: -110 }, { sportsbook: "x" }, { p10: 1 }, { band80: {} }, { nested: [{ price: 1 }] }, { note: "draftkings" }, { note: "the line moved" }, { note: "-110" }]) {
    assert.notDeepEqual(publicSafetyViolations({ ...nfl, ...planted }), [], JSON.stringify(planted));
  }
  assert.deepEqual(publicSafetyViolations(nfl), []);
  assert.deepEqual(publicSafetyViolations(nba), [], "a game's model pick vs the final is allowed");
  const row0 = nfl.games[0].rows[0];
  for (const plant of [{ modelSide: "OVER" }, { sideResult: "CORRECT" }, { side: "UNDER" }, { reason: "SIDE_COMPARED" }, { reason: "NO_MODEL_SIDE" }]) {
    const doc = { ...nfl, games: [{ ...nfl.games[0], rows: [{ ...row0, ...plant }] }] };
    assert.notDeepEqual(publicSafetyViolations(doc), [], `object: ${JSON.stringify(plant)}`);
    assert.notDeepEqual(publicSafetyViolations(canonicalDayJson(doc)), [], `text: ${JSON.stringify(plant)}`);
  }
  assert.notDeepEqual(publicSafetyViolations("sport,modelSide\nnfl,\n"), [], "a CSV side column");
  assert.notDeepEqual(publicSafetyViolations("sport,x\nnfl,UNDER\n"), [], "a CSV OVER or UNDER cell");
  const sealedSide = tmpDir(t);
  fs.mkdirSync(path.join(sealedSide, "nfl"));
  fs.writeFileSync(path.join(sealedSide, "nfl", "2026-10-11.json"), canonicalDayJson({ ...nfl, games: [{ ...nfl.games[0], rows: [{ ...row0, modelSide: "OVER", sideResult: "CORRECT" }] }] }));
  assert.throws(() => emitResultsV2({ sealedDir: sealedSide, outDir: path.join(sealedSide, "o") }), /per-row side/, "refused even though the day would be withheld");
  const sealed = tmpDir(t);
  fs.mkdirSync(path.join(sealed, "nfl"));
  fs.writeFileSync(path.join(sealed, "nfl", "2026-10-11.json"), canonicalDayJson({ ...nfl, games: [{ ...nfl.games[0], rows: [{ ...nfl.games[0].rows[0], line: 5.5 }] }] }));
  assert.throws(() => emitResultsV2({ sealedDir: sealed, outDir: path.join(sealed, "o") }), /forbidden key/);
  for (const f of [NFL_FILE, NBA_FILE]) assert.doesNotMatch(read(f), /modelSide|"(OVER|UNDER)"|"SIDE_COMPARED","subject"/, `${f}: committed to a public repo`);
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
  const a = emitResultsV2({ outDir: path.join(dir, "a"), publicEvidence: ["BACKFILL_GITHUB"] });
  const b = emitResultsV2({ outDir: path.join(dir, "b"), publicEvidence: ["BACKFILL_GITHUB"] });
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
  assert.equal((appFile("src/app/results/page.tsx").match(/results\/day/g) ?? []).length, 0, "/results does not link to /results/day while no day is published");
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
  assert.match(src, /Model side vs captured line, day totals only \(not a betting result\)/);
  assert.match(src, /No measurement/);
  assert.match(src, /Forecast accuracy/);
  assert.equal(nba.label, "UNVALIDATED EXPERIMENTAL SIMULATION");
  assert.match(src, /doc\.label/);
  for (const text of [src, appFile("src/lib/results/v2/contract.mjs"), read(NFL_FILE), read(NBA_FILE)]) {
    assert.doesNotMatch(text, /\bESTIMATED?\b|PROJECTED MEDIAN|\best\.(?=\s|$)/i);
  }
});

test("no betting-record styling: no gold HIT tag, no bare percentage rate, and the Wilson interval with the 50% caveat", () => {
  const src = appFile(SHELL);
  assert.doesNotMatch(src, /\.hit\b|gold|tag\$\{kind\}|sideCorrectRate|winRate/);
  assert.doesNotMatch(src, /\.rows\b.*modelSide|r\.sideResult|row\.sideResult/, "no per-row side in the shell");
  assert.match(src, /95% interval/);
  assert.match(src, /cannot be told apart from 50%/);
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /\u2014/, "no em dash in user-facing copy");
  assert.doesNotMatch(appFile(PAGE), /\u2014/);
});

test("the shell: each fetch owns its failure (one bad fetch never blanks later days), an honest empty state, no internal path", () => {
  const src = appFile(SHELL);
  assert.doesNotMatch(src, /setFailed\(true\)/, "no shared sticky failure flag");
  assert.match(src, /setDay\(\{ json, doc: null, failed: false \}\)/, "a new day request starts clean");
  assert.match(src, /setState\(\{ file, rows: null, failed: false \}\)/, "a new game request starts clean");
  assert.match(src, /data-empty/);
  assert.match(src, /kept private/);
  assert.doesNotMatch(src, /sourceFiles|servedFrom|settledFrom/, "the provenance block prints no repo path");
  assert.doesNotMatch(src, /served live|were served before the start\. They/);
  assert.match(src, /rowsFile/, "rows load per game, on open");
});

test("no W/L wording anywhere a reader sees, in the shell, the reason words or the public files", () => {
  const banned = /\bwins?\b|\bloss(es)?\b|\bW\/L\b|"(WIN|LOSS)"/i;
  const shown = appFile(SHELL).replace(/^\/\*\*[\s\S]*?\*\//m, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(shown, banned, "the shell prints no win or loss");
  assert.doesNotMatch(appFile(PAGE).replace(/\/\*[\s\S]*?\*\//g, ""), banned);
  const words = fs.readFileSync(path.join(APP, "src/lib/results/v2/contract.mjs"), "utf8");
  const block = /export const REASON_WORDS[\s\S]*?\}\);/.exec(words)[0];
  assert.doesNotMatch(block, banned);
  for (const text of [toDayCsv(nfl), toDayCsv(nba)]) assert.doesNotMatch(text, /,(WIN|LOSS|PUSH|NO_PICK),/);
  for (const text of [read(NFL_FILE), read(NBA_FILE)]) assert.doesNotMatch(text, /"claim":"(WIN|LOSS|PUSH|NO_PICK)"/);
});

test("the pilot is non-indexable until release review: robots noindex on the route, indexable false in the table, so no sitemap entry", () => {
  assert.match(appFile(PAGE), /robots: \{ index: false, follow: false \}/);
  assert.equal(ROUTE_TABLE["/results/day"].indexable, false);
  assert.match(appFile("src/app/sitemap.ts"), /v\.classification === "public" && v\.indexable !== false/, "the sitemap still honours the flag");
  const listed = Object.entries(ROUTE_TABLE).filter(([, v]) => v.classification === "public" && v.indexable !== false).map(([route]) => route);
  assert.ok(!listed.includes("/results/day"));
  assert.doesNotMatch(appFile("src/app/sitemap.ts"), /results\/day/);
  assert.doesNotMatch(appFile("src/lib/seo/sitemap-durable-pages.ts"), /results\/day/);
});
