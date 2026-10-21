/**
 * NBA Top Boards — eligibility, ranking, never-filled, no-market and write-once pins (SYNTHETIC fixtures only).
 *
 * Every eligibility rule has (a) a pinned test that the mutated player is withheld with that rule's id and (b) a
 * MUTATION PROBE: the same mutated player becomes eligible when only that rule is removed from the rule table —
 * proving the rule (not some other one) is what withholds him, so deleting or weakening a rule fails this file.
 *
 * Run (from app/): node --test src/lib/sports/nba/top-boards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  BOARD_MAX_ROWS, CATEGORIES, CATEGORIES_V1, ELIGIBILITY, ELIGIBILITY_RULES, FLAGS, GAME_REASON, MARKET_BASIS, NO_CONFIDENCE, NO_MARKET,
  NOT_MODELLED_CATEGORIES, RANKING, RANKING_V1, TOP_BOARD_SCHEMA, TOP_BOARD_SCHEMA_V1,
  buildBoardEdition, emptyBoardDoc, eligibilityReasons, freezeBoards, frozenEditionViolations, isDiscreteSummary,
} from "./top-boards.mjs";
import { COMBO_KEYS } from "./game-sim.mjs";
import { artifact, game, player, SHA } from "./__fixtures__/top-board-fixtures.mjs";

const FROZEN_AT = "2026-11-01T16:00:00Z";
const ctx = { stat: "pts", otherTeamIds: new Set() };
const without = (id) => ELIGIBILITY_RULES.filter((r) => r.id !== id);
const edition = (games, o = {}) => buildBoardEdition({ artifact: artifact(games), sourceSha256: SHA, frozenAt: FROZEN_AT, family: "v0.1", ...o });

test("thresholds and policies are pinned (changing one is a decision, not a refactor)", () => {
  assert.equal(ELIGIBILITY.minExpectedMinutes, 20, "preregistration §6 graded population");
  assert.equal(ELIGIBILITY.maxMinutesCv, 0.35, "≈ 90th percentile of minutesSd/expectedMinutes on committed v0.1 preseason rows");
  assert.equal(ELIGIBILITY.tradedHistoryPolicy, "INCLUDE_WITH_FLAG");
  assert.equal(ELIGIBILITY.minPlayRate, 0.95, "conditional-on-playing families (v1)");
  assert.equal(ELIGIBILITY.minGamesUsed, 3, "minutes-model MIN_GAMES_FOR_RATES");
  assert.deepEqual([...ELIGIBILITY.playerRateBases], ["player-window", "v1-shrunk-to-league"]);
  assert.equal(BOARD_MAX_ROWS, 10);
  assert.deepEqual(CATEGORIES_V1.map((c) => [c.key, c.stat]), [["points", "pts"], ["rebounds", "reb"], ["assists", "ast"], ["threes", "threePm"]], "schema @1 is frozen");
  assert.deepEqual(CATEGORIES.map((c) => [c.key, c.stat, c.basis]), [
    ["points", "pts", "MARGINAL"], ["rebounds", "reb", "MARGINAL"], ["assists", "ast", "MARGINAL"], ["threes", "threePm", "MARGINAL"],
    ["pra", "pra", "JOINT_SIMULATED_SUM"], ["ptsReb", "ptsReb", "JOINT_SIMULATED_SUM"], ["ptsAst", "ptsAst", "JOINT_SIMULATED_SUM"],
  ]);
  assert.deepEqual(CATEGORIES.slice(0, 4).map((c) => c.key), CATEGORIES_V1.map((c) => c.key), "@2 is a superset of @1 (the report relies on it)");
  assert.deepEqual(NOT_MODELLED_CATEGORIES.map((c) => [c.key, c.label, c.basis, c.stat]), [["rebAst", "R+A", "NOT_MODELLED", null]]);
  assert.equal(TOP_BOARD_SCHEMA, "nba-top-board@2");
  assert.deepEqual(ELIGIBILITY_RULES.map((r) => r.id), [
    "MISSING_ATHLETE_ID", "AVAILABILITY_OUT", "INJURY_DESIGNATION", "INSUFFICIENT_HISTORY", "NULL_MINUTES",
    "AVAILABILITY_UNVERIFIED", "LOW_PLAY_RATE", "TEAM_POOL_FALLBACK_RATES", "LOW_EXPECTED_MINUTES", "MINUTES_TOO_UNCERTAIN", "MISSING_DISTRIBUTION",
  ]);
  assert.match(RANKING_V1.rule, /p50 desc, then frozen mean desc, then providerAthleteId asc/);
  assert.equal(RANKING.id, "nba-top-board-ranking@2");
  assert.match(RANKING.rule, /\(discrete\) summaries on every candidate → frozen mean desc, then providerAthleteId asc/);
});

test("the base fixture player is eligible (positive control)", () => {
  assert.deepEqual(eligibilityReasons(player(1), ctx), []);
});

/* Each case: the rule id, and a mutation of an otherwise-eligible player that ONLY that rule catches. */
const CASES = [
  ["MISSING_ATHLETE_ID", player(1, { providerAthleteId: null })],
  ["AVAILABILITY_OUT", player(1, { availability: "out" })],
  ["INJURY_DESIGNATION", player(1, { injuryStatus: "Day-To-Day" })],
  ["INJURY_DESIGNATION", player(1, { injuryStatus: "Questionable" })],
  ["INSUFFICIENT_HISTORY", player(1, { basis: "insufficient" })],
  ["INSUFFICIENT_HISTORY", player(1, { basis: "v1-blended-history", gamesUsed: 2, ratesBasis: "v1-shrunk-to-league" })],
  ["LOW_PLAY_RATE", player(1, { playRate: 0.9499, conditioning: "quantiles over the draws in which the player played" })],
  ["LOW_PLAY_RATE", player(1, { conditioning: "quantiles over the draws in which the player played" })],
  ["TEAM_POOL_FALLBACK_RATES", player(1, { ratesBasis: "something-new" })],
  ["NULL_MINUTES", player(1, { expectedMinutes: null })],
  ["AVAILABILITY_UNVERIFIED", player(1, { availability: "unknown" })],
  ["TEAM_POOL_FALLBACK_RATES", player(1, { ratesBasis: "team-pool-fallback" })],
  ["LOW_EXPECTED_MINUTES", player(1, { expectedMinutes: 19.99, minutesSd: 4 })],
  ["MINUTES_TOO_UNCERTAIN", player(1, { expectedMinutes: 30, minutesSd: 10.6 })],
  ["MINUTES_TOO_UNCERTAIN", player(1, { minutesSd: null })],
  ["MISSING_DISTRIBUTION", player(1, { pts: { mean: 20, p10: 12, p50: null, p90: 28 } })],
];

for (const [rule, mutated] of CASES) {
  test(`rule ${rule}: withheld, and the mutation probe proves this rule is the one doing it`, () => {
    const reasons = eligibilityReasons(mutated, ctx);
    assert.ok(reasons.includes(rule), `${rule} must withhold: got ${reasons.join(",")}`);
    // MUTATION PROBE: remove only this rule → no other rule catches the mutation, so the player would be ranked.
    assert.deepEqual(eligibilityReasons(mutated, ctx, without(rule)), [], `${rule}: with the rule removed the player would be ranked`);
  });
}

test("v1 row shape: own shrunk rates and blended history are eligible; playRate exactly 0.95 passes", () => {
  const v1 = player(1, { basis: "v1-blended-history", ratesBasis: "v1-shrunk-to-league", gamesUsed: 40, playRate: 0.95, conditioning: "quantiles over the draws in which the player played" });
  assert.deepEqual(eligibilityReasons(v1, ctx), []);
});

test("boundaries: exactly 20 expected minutes and exactly the minutes ratio 0.35 are eligible", () => {
  assert.deepEqual(eligibilityReasons(player(1, { expectedMinutes: 20, minutesSd: 7 }), ctx), []);
  assert.deepEqual(eligibilityReasons(player(1, { expectedMinutes: 20, minutesSd: 7.01 }), ctx), ["MINUTES_TOO_UNCERTAIN"]);
});

test("Day-To-Day is withheld on every board (founder rule: unresolved → withheld), with the reason listed", () => {
  const e = edition([game("fx-1", { home: [player(1), player(2, { injuryStatus: "Day-To-Day" })] })]);
  for (const c of CATEGORIES) {
    const b = e.boards[c.key];
    assert.deepEqual(b.rows.map((r) => r.player.providerAthleteId), ["1"]);
    const w = b.withheld.players.find((x) => x.providerAthleteId === "2");
    assert.equal(w.primaryReason, "INJURY_DESIGNATION");
  }
});

test("players the roster gate kept out of the simulation (Out, no history) are listed as withheld, not dropped", () => {
  const pool = { home: { out: [{ providerAthleteId: "9", name: "Gate Out", injuryStatus: "Out" }], insufficientHistory: [{ providerAthleteId: "8", name: "Gate New" }], otherTeamHistory: [] } };
  const e = edition([game("fx-1", { home: [player(1)], pool })]);
  const w = Object.fromEntries(e.boards.points.withheld.players.map((x) => [x.providerAthleteId, x.primaryReason]));
  assert.deepEqual(w, { 8: "INSUFFICIENT_HISTORY", 9: "AVAILABILITY_OUT" });
  assert.equal(e.boards.points.withheld.count, 2);
});

test("traded-player history: INCLUDED with the TRADED_HISTORY_OTHER_TEAM flag (documented decision)", () => {
  const pool = { away: { out: [], insufficientHistory: [], otherTeamHistory: [{ providerAthleteId: "5", historyTeam: "4" }] } };
  const e = edition([game("fx-1", { home: [player(1)], away: [player(5, { pts: 25 })], pool })]);
  const row = e.boards.points.rows.find((r) => r.player.providerAthleteId === "5");
  assert.ok(row, "the traded player is ranked");
  assert.deepEqual(row.flags, [FLAGS.TRADED_HISTORY_OTHER_TEAM]);
  assert.deepEqual(e.boards.points.rows.find((r) => r.player.providerAthleteId === "1").flags, []);
});

test("games: tipped at the freeze, forecast after the freeze, broken receipt, other family → off the board with the reason", () => {
  const started = game("fx-started", { tip: "2026-11-01T15:30Z", home: [player(11)] });
  const late = game("fx-late", { generatedAt: "2026-11-01T17:00:00Z", home: [player(12)] });
  const broken = game("fx-broken", { home: [player(13)] }); broken.forecast.players.home[0].pts.p50 = 99; // edited after its receipt
  const other = game("fx-other", { family: "v0.2", home: [player(14)] });
  const ok = game("fx-ok", { home: [player(15)] });
  const e = edition([started, late, broken, other, ok]);
  const state = Object.fromEntries(e.games.map((g) => [g.eventId, g.state]));
  assert.deepEqual(state, { "fx-started": GAME_REASON.GAME_STARTED_AT_FREEZE, "fx-late": GAME_REASON.FORECAST_AFTER_FREEZE, "fx-broken": GAME_REASON.RECEIPT_BROKEN, "fx-other": GAME_REASON.FAMILY_MISMATCH, "fx-ok": "ON_BOARD" });
  assert.deepEqual(e.boards.points.rows.map((r) => r.player.providerAthleteId), ["15"]);
  // probe: freezing before the started game's tip puts it back on
  const early = edition([started], { frozenAt: "2026-11-01T15:00:00Z" });
  assert.equal(early.games[0].state, "ON_BOARD");
});

test("ranking: p50 desc, then mean desc, then athlete id asc — deterministic under input order", () => {
  const a = player("30", { pts: 20 }); const b = player("10", { pts: 20 }); const c = player("20", { pts: 20 }); const d = player("40", { pts: 25 });
  c.pts = { ...c.pts, mean: 21 }; // same p50 as a/b, higher mean
  const one = edition([game("fx-1", { home: [a, b], away: [c, d] })]).boards.points.rows.map((r) => r.player.providerAthleteId);
  const two = edition([game("fx-1", { home: [b, a], away: [d, c] })]).boards.points.rows.map((r) => r.player.providerAthleteId);
  assert.deepEqual(one, ["40", "20", "10", "30"]);
  assert.deepEqual(two, one);
});

test("max 10, and never filled: 14 eligible → 10; 3 eligible → 3; 0 eligible → empty board that says why", () => {
  const many = Array.from({ length: 14 }, (_, i) => player(100 + i, { pts: 10 + i }));
  assert.equal(edition([game("fx-1", { home: many })]).boards.points.rows.length, 10);
  const few = edition([game("fx-1", { home: [player(1), player(2), player(3), player(4, { expectedMinutes: 12, minutesSd: 2 })] })]).boards.points;
  assert.equal(few.rows.length, 3);
  assert.equal(few.eligibleCount, 3);
  assert.equal(few.withheld.count, 1);
  const none = edition([game("fx-1", { home: [player(1, { injuryStatus: "Out", availability: "out" })] })]).boards.points;
  assert.equal(none.rows.length, 0);
  assert.match(none.emptyReason, /no player passed every eligibility rule \(1 considered and withheld\)/);
  const noGames = edition([game("fx-1", { tip: "2026-11-01T12:00Z", home: [player(1)] })]).boards.points;
  assert.match(noGames.emptyReason, /no game was eligible at the freeze \(GAME_STARTED_AT_FREEZE\)/);
});

test("rows carry no market: line/odds/edge null with NO_AUTHORIZED_PRICE; confidence null with its reason; no over/under or value field", () => {
  const e = edition([game("fx-1", { home: [player(1)] })]);
  const row = e.boards.points.rows[0];
  for (const [k, v] of Object.entries(NO_MARKET)) assert.equal(row[k], v);
  assert.equal(row.marketLine, null); assert.equal(row.marketOdds, null); assert.equal(row.edge, null);
  assert.equal(row.marketReason, "NO_AUTHORIZED_PRICE");
  assert.equal(row.confidence, null);
  assert.equal(row.confidenceReason, NO_CONFIDENCE.confidenceReason);
  const keys = JSON.stringify(e).match(/"[A-Za-z0-9]+":/g).map((k) => k.slice(1, -2));
  for (const k of keys) assert.doesNotMatch(k, /^(over|under|prob|value|ev$|expectedValue|kelly|implied)/i, `field ${k} must not exist`);
});

test("row fields: player, team, opponent, tipoff, projection, p10–p90, minutes, updated, model, receipt hash, sort keys", () => {
  const e = edition([game("fx-1", { home: [player(1)] })]);
  const r = e.boards.points.rows[0];
  assert.equal(r.player.name, "Fixture Player 1");
  assert.deepEqual([r.team.abbr, r.opponent.abbr, r.homeAway], ["BOS", "NYK", "home"]);
  assert.equal(r.tipoffUtc, "2026-11-01T23:30Z");
  assert.deepEqual(Object.keys(r.projection), ["p50", "mean"]);
  assert.deepEqual(Object.keys(r.range), ["p10", "p90"]);
  assert.equal(r.expectedMinutes, 30);
  assert.deepEqual(r.updated, { inputAsOf: "2026-11-01T15:00:00Z", generatedAt: "2026-11-01T15:00:00Z" });
  assert.equal(r.modelVersion, "nba-preseason-experimental-v0.1");
  assert.equal(r.receipt.forecastSha256, SHA);
  assert.match(r.receipt.gamePayloadSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(r.sortKeys), ["projection", "expectedMinutes", "p90"]);
});

test("write-once: a second freeze adds only new, untipped games as a new edition; edition 1 is untouched", () => {
  const g1 = game("fx-1", { home: [player(1)] });
  const first = freezeBoards({ existing: null, artifact: artifact([g1]), sourceSha256: SHA, frozenAt: FROZEN_AT, family: "v0.1", date: "2026-11-01" });
  assert.ok(first.ok); assert.deepEqual(first.added, ["fx-1"]);
  const frozenCopy = JSON.parse(JSON.stringify(first.doc));
  const g2 = game("fx-2", { generatedAt: "2026-11-01T18:00:00Z", tip: "2026-11-02T02:00Z", home: [player(2, { pts: 40 })] });
  const second = freezeBoards({ existing: first.doc, artifact: artifact([g1, g2]), sourceSha256: "b".repeat(64), frozenAt: "2026-11-01T18:30:00Z", family: "v0.1", date: "2026-11-01" });
  assert.ok(second.ok);
  assert.deepEqual(second.added, ["fx-2"]);
  assert.equal(second.doc.editions.length, 2);
  assert.deepEqual(second.doc.editions[0], frozenCopy.editions[0], "edition 1 is byte-identical");
  assert.equal(second.doc.editions[1].games.find((g) => g.eventId === "fx-1").state, GAME_REASON.ON_EARLIER_EDITION);
  assert.deepEqual(first.doc, frozenCopy, "the input document was not mutated");
  // a third run with nothing new writes nothing
  const third = freezeBoards({ existing: second.doc, artifact: artifact([g1, g2]), sourceSha256: SHA, frozenAt: "2026-11-01T19:00:00Z", family: "v0.1", date: "2026-11-01" });
  assert.equal(third.edition, null);
  // refuses a freeze instant that is not after the last edition, and a family mismatch
  assert.equal(freezeBoards({ existing: second.doc, artifact: artifact([g1]), sourceSha256: SHA, frozenAt: "2026-11-01T18:30:00Z", family: "v0.1", date: "2026-11-01" }).ok, false);
  assert.equal(freezeBoards({ existing: second.doc, artifact: artifact([g1]), sourceSha256: SHA, frozenAt: "2026-11-01T20:00:00Z", family: "v0.2", date: "2026-11-01" }).ok, false);
});

test("frozenEditionViolations catches a rewritten row, a removed edition and a game on two editions", () => {
  const first = freezeBoards({ existing: null, artifact: artifact([game("fx-1", { home: [player(1)] })]), sourceSha256: SHA, frozenAt: FROZEN_AT, family: "v0.1", date: "2026-11-01" }).doc;
  assert.deepEqual(frozenEditionViolations({ before: first, after: first }), []);
  const edited = JSON.parse(JSON.stringify(first)); edited.editions[0].boards.points.rows[0].projection.p50 = 50;
  assert.match(frozenEditionViolations({ before: first, after: edited }).join(), /edition 1 was rewritten/);
  assert.match(frozenEditionViolations({ before: first, after: { ...first, editions: [] } }).join(), /editions removed/);
  const dup = JSON.parse(JSON.stringify(first)); dup.editions.push({ ...dup.editions[0], edition: 2 });
  assert.match(frozenEditionViolations({ before: first, after: dup }).join(), /fx-1 is on editions 1 and 2/);
});

test("refuses a forecast from another family and a missing source hash", () => {
  assert.throws(() => buildBoardEdition({ artifact: artifact([], { family: "v0.2" }), sourceSha256: SHA, frozenAt: FROZEN_AT, family: "v0.1" }), /REFUSED/);
  assert.throws(() => buildBoardEdition({ artifact: artifact([]), sourceSha256: "nope", frozenAt: FROZEN_AT, family: "v0.1" }), /sourceSha256/);
});

test("REAL v1 rows (trimmed dev fixture with provenance): playRate rule, Day-To-Day, traded flag, and the row carries playRate", async () => {
  const fx = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(new URL("./__fixtures__/nba-v1-2026-10-20-trimmed.json", import.meta.url), "utf8")));
  assert.match(fx.provenance.note, /TRIMMED DEV FIXTURE/);
  assert.equal(fx.provenance.family, "v1");
  const byName = Object.fromEntries(fx.rows.map((r) => [r.player.name, r.player]));
  assert.deepEqual(eligibilityReasons(byName["Cade Cunningham"], ctx), [], "playRate 0.9728, own history → eligible");
  assert.ok(eligibilityReasons(byName["Daniss Jenkins"], ctx).includes("LOW_PLAY_RATE"), "playRate 0.946");
  assert.ok(eligibilityReasons(byName["Elijah Harkless"], ctx).includes("LOW_PLAY_RATE"), "playRate 0.787");
  assert.deepEqual(eligibilityReasons(byName["Josh Hart"], ctx), ["INJURY_DESIGNATION"]);
  assert.deepEqual(eligibilityReasons(byName["Taurean Prince"], ctx), []);
  // through the board: a v1-family game built from those real rows (the fixture game is re-stamped — synthetic receipt)
  const home = [byName["Cade Cunningham"], byName["Daniss Jenkins"], byName["Josh Hart"]];
  const away = [byName["Elijah Harkless"], byName["Taurean Prince"]];
  const g = game("fx-v1", { home, away, family: "v1", modelVersion: "nba-sim-v1-coherent" });
  const e = buildBoardEdition({ artifact: { ...artifact([g]), family: "v1", modelVersion: "nba-sim-v1-coherent" }, sourceSha256: SHA, frozenAt: FROZEN_AT, family: "v1" });
  const rows = e.boards.points.rows;
  assert.deepEqual(rows.map((r) => r.player.name).sort(), ["Cade Cunningham", "Taurean Prince"]);
  const cade = rows.find((r) => r.player.name === "Cade Cunningham");
  assert.equal(cade.playRate, 0.9728);
  assert.equal(cade.modelVersion, "nba-sim-v1-coherent");
  assert.equal(cade.quantileConditioning, "CONDITIONAL_ON_PLAYING");
  assert.deepEqual(Object.keys(cade.range), ["p10", "p25", "p75", "p90"]);
  assert.deepEqual(rows.find((r) => r.player.name === "Taurean Prince").flags, [FLAGS.TRADED_HISTORY_OTHER_TEAM], "historyBasis other-team on the row");
  assert.equal(e.boards.points.withheld.byPrimaryReason.LOW_PLAY_RATE, 2);
});

/* ───────────── schema @2: joint combination boards, R+A not modelled, ranking@2, @1 day files untouched ───────────── */

test("combo boards: PRA / P+R / P+A rank the JOINT simulated sums (components = game-sim COMBO_KEYS), labelled with their basis", () => {
  for (const c of CATEGORIES.filter((x) => x.basis === MARKET_BASIS.JOINT_SIMULATED_SUM)) assert.deepEqual([...c.components], COMBO_KEYS[c.stat]);
  // a player whose PRA distribution ranks him first although his points do not: the board reads the stored joint
  // distribution, never a sum of marginals
  const a = player("1", { pts: 30, reb: 2, ast: 2 }); // fixture pra p50 34
  const b = player("2", { pts: 20, reb: 12, ast: 10 }); // fixture pra p50 42
  const e = edition([game("fx-1", { home: [a, b] })]);
  assert.deepEqual(e.boards.points.rows.map((r) => r.player.providerAthleteId), ["1", "2"]);
  assert.deepEqual(e.boards.pra.rows.map((r) => r.player.providerAthleteId), ["2", "1"]);
  const pra = e.boards.pra;
  assert.equal(pra.marketBasis, "JOINT_SIMULATED_SUM");
  assert.match(pra.basisText, /joint sum .* draw by draw/);
  assert.equal(pra.rows[0].marketBasis, "JOINT_SIMULATED_SUM");
  assert.deepEqual(pra.rows[0].components, ["pts", "reb", "ast"]);
  assert.equal(pra.rows[0].projection.p50, b.pra.p50, "the stored joint p50");
  // the stored joint value is used even when it differs from the sum of marginal medians
  const skew = player("4", { pts: 20, reb: 6, ast: 4 }); skew.pra = { ...skew.pra, p50: 27.5 };
  assert.equal(edition([game("fx-1", { home: [skew] })]).boards.pra.rows[0].projection.p50, 27.5);
  for (const k of ["pra", "ptsReb", "ptsAst"]) for (const r of e.boards[k].rows) for (const [f, v] of Object.entries(NO_MARKET)) assert.equal(r[f], v);
  // a family without the joint distribution → withheld MISSING_DISTRIBUTION (never synthesised from marginals)
  const noCombo = player("3"); delete noCombo.pra;
  const e2 = edition([game("fx-1", { home: [noCombo] })]);
  assert.equal(e2.boards.pra.rows.length, 0);
  assert.equal(e2.boards.pra.withheld.players[0].primaryReason, "MISSING_DISTRIBUTION");
  assert.equal(e2.boards.points.rows.length, 1);
});

test("R+A is an explicit NOT_MODELLED board: no rows, no withheld players, a reason — even when reb and ast exist", () => {
  const e = edition([game("fx-1", { home: [player(1), player(2)] })]);
  const ra = e.boards.rebAst;
  assert.equal(ra.state, "NOT_MODELLED");
  assert.equal(ra.marketBasis, "NOT_MODELLED");
  assert.deepEqual(ra.rows, []);
  assert.equal(ra.withheld.count, 0);
  assert.match(ra.emptyReason, /not modelled.*adding marginal projections is not its distribution.*never computed/);
  assert.equal(JSON.stringify(e).includes("|rebAst|"), false, "no rebAst row id anywhere");
  const doc = emptyBoardDoc({ date: "2026-11-01", family: "v0.1", modelVersion: null });
  assert.deepEqual(doc.categories.find((c) => c.key === "rebAst"), { key: "rebAst", stat: null, label: "R+A", basis: "NOT_MODELLED", components: ["reb", "ast"], modelled: false });
  assert.equal(doc.schema, TOP_BOARD_SCHEMA); assert.equal(doc.schemaVersion, 2);
  assert.equal(doc.ranking.id, RANKING.id);
});

/* v1-like integer quantile summaries: every quantile a whole number (as nba-sim-v1-coherent stores them). */
const intDist = (p10, p50, p90, mean) => ({ mean, sd: 1, p10, p25: p50, p50, p75: p50, p90 });

test("ranking@2: a DISCRETE board (whole-number quantiles on every candidate) ranks by mean, then id — not by tied integer medians", () => {
  assert.equal(isDiscreteSummary(intDist(0, 2, 4, 2.1)), true);
  assert.equal(isDiscreteSummary({ p10: 0.74, p50: 2.41, p90: 4.08 }), false);
  // three players tie at p50 = 2; one has p50 = 3 but a LOWER mean. Mean order: 30 (2.6) > 10 (2.4) > 40 (2.3) > 20 (1.9)
  const ps = [["10", intDist(0, 2, 4, 2.4)], ["20", intDist(0, 2, 4, 1.9)], ["30", intDist(1, 2, 5, 2.6)], ["40", intDist(1, 3, 4, 2.3)]]
    .map(([id, d]) => ({ ...player(id), threePm: d }));
  const e = edition([game("fx-1", { home: ps })]);
  assert.equal(e.boards.threes.rankingMetric, "MODEL_MEAN");
  assert.deepEqual(e.boards.threes.rows.map((r) => r.player.providerAthleteId), ["30", "10", "40", "20"]);
  assert.deepEqual(e.boards.threes.rows.map((r) => r.sortKeys.projection), [2.6, 2.4, 2.3, 1.9], "the sort key is the ranking metric");
  assert.equal(e.boards.threes.rows[0].rankingMetric, "MODEL_MEAN");
  // deterministic under input order, and an exact mean tie falls to the id
  const rev = edition([game("fx-1", { home: [...ps].reverse() })]);
  assert.deepEqual(rev.boards.threes.rows.map((r) => r.player.providerAthleteId), ["30", "10", "40", "20"]);
  const tie = [{ ...player("9"), threePm: intDist(0, 2, 4, 2) }, { ...player("5"), threePm: intDist(0, 1, 4, 2) }];
  assert.deepEqual(edition([game("fx-1", { home: tie })]).boards.threes.rows.map((r) => r.player.providerAthleteId), ["5", "9"]);
  // MUTATION PROBE: under ranking@1 (schema @1) the same rows rank by the integer p50 first — the old behaviour
  const old = edition([game("fx-1", { home: ps })], { schema: TOP_BOARD_SCHEMA_V1 });
  assert.deepEqual(old.boards.threes.rows.map((r) => r.player.providerAthleteId), ["40", "30", "10", "20"]);
  // one continuous candidate (v0.x summaries carry two-decimal quantiles) makes the board CONTINUOUS: p50 first
  const mixed = edition([game("fx-1", { home: [...ps, { ...player("50"), threePm: { mean: 2, sd: 1, p10: 0.5, p50: 1.9, p90: 3.8 } }] })]);
  assert.equal(mixed.boards.threes.rankingMetric, "MODEL_MEDIAN_P50");
});

test("schema @1 day files are never rewritten or upgraded: a later freeze into an @1 file adds an @1-shaped edition", () => {
  const g1 = game("fx-1", { home: [player(1)] });
  const v1doc = emptyBoardDoc({ date: "2026-11-01", family: "v0.1", modelVersion: "nba-preseason-experimental-v0.1", schema: TOP_BOARD_SCHEMA_V1 });
  v1doc.editions.push(buildBoardEdition({ artifact: artifact([g1]), sourceSha256: SHA, frozenAt: FROZEN_AT, family: "v0.1", schema: TOP_BOARD_SCHEMA_V1 }));
  assert.deepEqual([v1doc.schema, v1doc.schemaVersion, v1doc.ranking.id], ["nba-top-board@1", 1, RANKING_V1.id]);
  assert.deepEqual(Object.keys(v1doc.editions[0].boards), ["points", "rebounds", "assists", "threes"]);
  assert.equal("marketBasis" in v1doc.editions[0].boards.points.rows[0], false, "@1 rows keep the @1 shape");
  const before = JSON.parse(JSON.stringify(v1doc));
  const g2 = game("fx-2", { generatedAt: "2026-11-01T18:00:00Z", tip: "2026-11-02T02:00Z", home: [player(2)] });
  const r = freezeBoards({ existing: v1doc, artifact: artifact([g1, g2]), sourceSha256: SHA, frozenAt: "2026-11-01T18:30:00Z", family: "v0.1", date: "2026-11-01" });
  assert.ok(r.ok, r.errors?.join());
  assert.equal(r.doc.schema, "nba-top-board@1");
  assert.deepEqual(Object.keys(r.doc.editions[1].boards), ["points", "rebounds", "assists", "threes"]);
  assert.deepEqual(r.doc.editions[0], before.editions[0]);
  assert.deepEqual(frozenEditionViolations({ before, after: r.doc }), []);
  // a new day file is @2
  const fresh = freezeBoards({ existing: null, artifact: artifact([g1]), sourceSha256: SHA, frozenAt: FROZEN_AT, family: "v0.1", date: "2026-11-01" });
  assert.equal(fresh.doc.schema, "nba-top-board@2");
  assert.deepEqual(Object.keys(fresh.edition.boards), ["points", "rebounds", "assists", "threes", "pra", "ptsReb", "ptsAst", "rebAst"]);
  // an unknown stored schema is refused
  assert.equal(freezeBoards({ existing: { ...v1doc, schema: "nba-top-board@9" }, artifact: artifact([g2]), sourceSha256: SHA, frozenAt: "2026-11-01T19:00:00Z", family: "v0.1", date: "2026-11-01" }).ok, false);
});

test("the committed frozen board files are still schema @1 (historical files are not migrated)", async () => {
  const fs = await import("node:fs");
  const dir = new URL("../../../../../data/internal/research/nba/top-boards/", import.meta.url);
  let seen = 0;
  for (const fam of ["v0.1", "v1"]) {
    const f = new URL(`${fam}/2026-10-20.json`, dir);
    if (!fs.existsSync(f)) continue;
    seen += 1;
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    assert.equal(d.schema, "nba-top-board@1", `${fam}/2026-10-20.json`);
    for (const e of d.editions) assert.deepEqual(Object.keys(e.boards), ["points", "rebounds", "assists", "threes"]);
  }
  assert.ok(seen >= 1, "positive control: at least one committed board file was read");
});
