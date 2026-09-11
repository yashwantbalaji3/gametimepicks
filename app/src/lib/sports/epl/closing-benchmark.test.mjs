import test from "node:test";
import assert from "node:assert/strict";
import { joinClosing, matchupTeams, score1x2, summarizeBenchmark } from "./closing-benchmark.mjs";
import { league } from "../soccer/leagues.mjs";

const g = (matchup, kickoffUtc, outcome, probs = { home: 0.69144, draw: 0.17808, away: 0.13048 }) =>
  ({ eventId: matchup, matchup, kickoffUtc, actual: { outcome }, forecast: { probs } });
const c = (home, away, dateUtc, result, close1x2 = { home: 0.6, draw: 0.22, away: 0.18 }) => ({ home, away, dateUtc, result, market: { close1x2 } });

test("scores match the ledger's own convention (Arsenal v Coventry, 2026-08-21)", () => {
  const s = score1x2({ home: 0.69144, draw: 0.17808, away: 0.13048 }, "H");
  assert.ok(Math.abs(s.brier - 0.143947) < 1e-5, `brier ${s.brier}`);
  assert.ok(Math.abs(s.logLoss - 0.368979) < 1e-5, `logLoss ${s.logLoss}`);
});

test("ESPN names join football-data names through the registry aliases", () => {
  const { joined, unjoined } = joinClosing({
    graded: [g("Arsenal v Coventry City", "2026-08-21T19:00:00Z", "H")],
    corpusRows: [c("Arsenal", "Coventry", "2026-08-21T19:00:00.000Z", "H")],
    aliases: league("epl").aliases,
  });
  assert.equal(joined.length, 1, JSON.stringify(unjoined));
  assert.equal(joinClosing({ graded: [g("Arsenal v Coventry City", "2026-08-21T19:00:00Z", "H")], corpusRows: [c("Arsenal", "Coventry", "2026-08-21T19:00:00.000Z", "H")] }).joined.length, 0, "no alias, no join");
});

test("a same-fixture row from another season is not joined", () => {
  const r = joinClosing({ graded: [g("Arsenal v Chelsea", "2026-09-06T15:30:00Z", "H")], corpusRows: [c("Arsenal", "Chelsea", "2025-09-06T15:30:00.000Z", "H")] });
  assert.equal(r.joined.length, 0);
  assert.match(r.unjoined[0].reason, /no closing row/);
});

test("a result the two sources disagree on is excluded, not scored", () => {
  const r = joinClosing({ graded: [g("Arsenal v Chelsea", "2026-09-06T15:30:00Z", "H")], corpusRows: [c("Arsenal", "Chelsea", "2026-09-06T15:30:00.000Z", "D")] });
  assert.equal(r.joined.length, 0);
  assert.match(r.unjoined[0].reason, /result mismatch/);
});

test("gap is model minus market; sample state is honest about size", () => {
  const { joined } = joinClosing({ graded: [g("A v B", "2026-09-01T12:00:00Z", "H")], corpusRows: [c("A", "B", "2026-09-01T14:00:00Z", "H")] });
  const s = summarizeBenchmark(joined);
  assert.equal(s.matches, 1);
  assert.equal(s.sampleState, "TOO_SMALL_TO_ASSESS");
  assert.ok(Math.abs(s.logLossGap.mean - (-Math.log(0.69144) + Math.log(0.6))) < 1e-9);
  assert.equal(s.logLossGap.standardError, null, "one match has no spread");
  assert.equal(summarizeBenchmark([]).sampleState, "NONE");
  assert.deepEqual(matchupTeams("Nottingham Forest v Tottenham Hotspur"), ["Nottingham Forest", "Tottenham Hotspur"]);
});
