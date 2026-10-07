/**
 * E-2 · NFL win head vs the cutoff-Elo baseline on identical games. Exact pairing arithmetic, ties and unreproducible
 * baselines VOID, preseason out of scope, and the baseline never folds a final at or after the forecast's cutoff.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { pairWinBaseline, summarise } from "./win-baseline-forward.mjs";
import { finalsRowSpace, makeBaselineFor } from "../../../../scripts/nfl/build-nfl-win-baseline-forward.mjs";

const receipt = (id, { pHead = 0.6, tie = 0.03, seasonType = 2, week = 1, head = "nfl-win-elo-mov-v1" } = {}) => ({
  providerEventId: id, kickoffUtc: "2026-09-13T17:00Z", seasonType, week, matchup: "A @ H", model: { winHead: { id: head } },
  home: { abbr: "H", name: "Home Team" }, away: { abbr: "A", name: "Away Team" },
  evidence: { strengthCutoff: "2026-09-12T00:00:00Z", strengthGamesFolded: 2 },
  forecastSummary: { winProbability: { home: Number((pHead * (1 - tie)).toFixed(4)), homeUnrounded: pHead * (1 - tie), tieMass: tie } },
});

test("pairs the head's P(home | decided) with the baseline on the same game; ties, preseason and refusals handled", () => {
  const ofRecord = new Map([
    ["1", { file: "f1", receipt: receipt("1") }],
    ["2", { file: "f2", receipt: receipt("2") }],
    ["3", { file: "f3", receipt: receipt("3", { seasonType: 1 }) }],
    ["4", { file: "f4", receipt: receipt("4") }],
    ["5", { file: "f5", receipt: receipt("5") }],
  ]);
  const finals = new Map([["1", { ftHome: 24, ftAway: 17 }], ["2", { ftHome: 20, ftAway: 20 }], ["3", { ftHome: 10, ftAway: 3 }], ["4", { ftHome: 3, ftAway: 10 }]]);
  const baselineFor = (r) => (r.providerEventId === "4" ? { state: "REFUSED", reason: "x" } : { state: "READY", pHome: 0.5, d: 0, gamesFolded: 2, producerFoldGap: 0 });
  const { games, summary } = pairWinBaseline({ receiptsOfRecord: ofRecord, finalsById: finals, baselineFor });
  const g1 = games.find((g) => g.eventId === "1");
  assert.equal(g1.state, "PAIRED");
  assert.ok(Math.abs(g1.model - 0.6) < 1e-6, "head recovered from homeUnrounded / (1 − tieMass)");
  assert.ok(Math.abs(g1.difference - (-Math.log(0.6) + Math.log(0.5))) < 1e-6);
  assert.equal(games.find((g) => g.eventId === "2").state, "VOID", "a tie is VOID, not a loss");
  assert.equal(games.some((g) => g.eventId === "3"), false, "preseason is outside the contract");
  assert.equal(games.find((g) => g.eventId === "4").state, "VOID");
  assert.equal(games.some((g) => g.eventId === "5"), false, "an unsettled game is not paired");
  assert.equal(summary.paired, 1);
  assert.equal(summary.state, "BELOW_MINIMUM_SAMPLE");
  assert.ok(summary.byWinHead["nfl-win-elo-mov-v1"]);
});

test("summary reaches AT_MINIMUM_SAMPLE only with ≥ 64 paired games over ≥ 4 weeks", () => {
  const mk = (n, weeks) => Array.from({ length: n }, (_, i) => ({ state: "PAIRED", week: (i % weeks) + 1, logLossModel: 0.6, logLossBaseline: 0.62, difference: -0.02 }));
  assert.equal(summarise(mk(64, 4)).state, "AT_MINIMUM_SAMPLE");
  assert.equal(summarise(mk(64, 3)).state, "BELOW_MINIMUM_SAMPLE");
  assert.equal(summarise(mk(63, 4)).state, "BELOW_MINIMUM_SAMPLE");
  assert.ok(Math.abs(summarise(mk(64, 4)).logLossVsBaseline + 0.02) < 1e-9);
});

test("baseline folds every final before the cutoff and nothing at or after it; unrated teams are refused", () => {
  const row = (id, dateUtc, home, away, h, a) => ({ providerEventId: id, season: 2026, seasonType: 2, dateUtc, home, away, ftHome: h, ftAway: a, statusRaw: "STATUS_FINAL" });
  const rows = [
    row("a", "2026-09-06T17:00Z", "Home Team", "Other", 30, 10),
    row("b", "2026-09-07T17:00Z", "Away Team", "Other", 10, 30),
    row("late", "2026-09-12T18:00Z", "Away Team", "Home Team", 50, 0), // after the cutoff: must not fold
  ];
  const r = receipt("x");
  const b = makeBaselineFor(rows)(r);
  assert.equal(b.state, "READY");
  assert.equal(b.gamesFolded, 2);
  assert.equal(b.producerFoldGap, 0);
  assert.ok(b.pHome > 0.5, "home won its game, away lost: the baseline favours home");
  const noHistory = makeBaselineFor([rows[0]])(r);
  assert.equal(noHistory.state, "REFUSED", "an unrated team is refused, not given the league mean");
});

test("finals row space: corpus first, then results and box-score finals by id, mapped to full names", () => {
  const rows = finalsRowSpace({
    corpusRows: [{ providerEventId: "1", dateUtc: "2026-01-01T00:00Z", home: "Home Team", away: "Away Team", ftHome: 1, ftAway: 0, statusRaw: "STATUS_FINAL" }],
    results: { rows: [{ providerEventId: "1", statusRaw: "STATUS_FINAL", dateUtc: "x", home: { name: "Z" }, away: { name: "Y" }, ftHome: 9, ftAway: 9 }, { providerEventId: "2", statusRaw: "STATUS_SCHEDULED", dateUtc: "2026-09-20T17:00Z", home: { name: "Home Team" }, away: { name: "Away Team" } }] },
    playerEvents: [{ games: [{ providerEventId: "3", dateUtc: "2026-09-14T17:00Z", home: "H", away: "A", ftHome: 7, ftAway: 3, season: 2026, seasonType: 2 }, { providerEventId: "4", dateUtc: "2026-09-14T17:00Z", home: "??", away: "A", ftHome: 7, ftAway: 3 }] }],
    abbrToName: new Map([["H", "Home Team"], ["A", "Away Team"]]),
  });
  assert.deepEqual(rows.map((r) => r.providerEventId).sort(), ["1", "3"]);
  assert.equal(rows.find((r) => r.providerEventId === "1").ftHome, 1, "the corpus row wins a duplicate id");
  assert.equal(rows.find((r) => r.providerEventId === "3").home, "Home Team");
});
