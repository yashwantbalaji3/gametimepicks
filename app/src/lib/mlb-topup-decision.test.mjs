/**
 * Mutation proofs for the afternoon top-up decision (Program 092-095 §13):
 *   - does not run when coverage is complete
 *   - does not run after first pitch (or inside the lead cutoff)
 *   - fails closed on budget breach and on UNKNOWN balance
 *   - runs only in the genuine gap state the founder approved
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideTopup } from "../../scripts/mlb-topup-decision.mjs";

const NOW = "2026-07-31T19:30:00.000Z"; // 15:30 ET
const later = (min) => new Date(Date.parse(NOW) + min * 60_000).toISOString();

const board = ({ leansFor = [], games, balance = "10300" } = {}) => ({
  credits: { before: balance },
  games: games ?? [
    { gamePk: 1, awayTeamName: "A", homeTeamName: "B", gameDate: later(240) }, // evening, uncovered
    { gamePk: 2, awayTeamName: "C", homeTeamName: "D", gameDate: later(120) }, // afternoon, covered
    { gamePk: 3, awayTeamName: "E", homeTeamName: "F", gameDate: later(300) }, // evening, covered
  ],
  leans: leansFor.map((pk) => ({ gamePk: pk })),
});

test("genuine gap → RUN with the uncovered pregame game as candidate", () => {
  const r = decideTopup({ board: board({ leansFor: [2, 3] }), nowIso: NOW });
  assert.equal(r.decision, "RUN");
  assert.deepEqual(r.candidates.map((c) => c.gamePk), [1]);
});

test("MUTATION · SLATE SAFETY: any started game blocks the regen entirely", () => {
  // Added after the 2026-07-31 live test: the dispatched top-up regenerates the WHOLE board, and
  // post-start captures are research-ineligible — a mid-slate regen would churn the published
  // record. The queued live dispatch that evening was cancelled for exactly this reason.
  const b = board({ leansFor: [2, 3], games: [
    { gamePk: 1, awayTeamName: "A", homeTeamName: "B", gameDate: later(240) }, // uncovered pregame
    { gamePk: 2, awayTeamName: "C", homeTeamName: "D", gameDate: later(-30) }, // covered, STARTED
    { gamePk: 3, awayTeamName: "E", homeTeamName: "F", gameDate: later(300) },
  ] });
  assert.ok(Date.parse(b.games[1].gameDate) < Date.parse(NOW), "mutation must actually apply");
  const r = decideTopup({ board: b, nowIso: NOW });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /already started.*mid-slate/);
});

test("MUTATION · coverage complete → SKIP", () => {
  const b = board({ leansFor: [1, 2, 3] });
  assert.equal(b.leans.length, 3, "mutation must actually apply");
  const r = decideTopup({ board: b, nowIso: NOW });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /already has market coverage/);
});

test("MUTATION · uncovered game past first pitch → SKIP (subsumed by slate safety)", () => {
  // A started game anywhere on the slate now blocks the regen outright, which strictly
  // strengthens the old per-event rule this test used to pin.
  const b = board({ leansFor: [3], games: [
    { gamePk: 1, awayTeamName: "A", homeTeamName: "B", gameDate: later(-30) },
    { gamePk: 3, awayTeamName: "E", homeTeamName: "F", gameDate: later(300) },
  ] });
  const r = decideTopup({ board: b, nowIso: NOW });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /already started|first-pitch cutoff/);
});

test("MUTATION · game inside the 45-min lead cutoff counts as too late", () => {
  const b = board({ leansFor: [3], games: [
    { gamePk: 1, awayTeamName: "A", homeTeamName: "B", gameDate: later(20) },
    { gamePk: 3, awayTeamName: "E", homeTeamName: "F", gameDate: later(300) },
  ] });
  assert.equal(decideTopup({ board: b, nowIso: NOW }).decision, "SKIP");
});

test("MUTATION · budget breach fails closed with a warning", () => {
  const r = decideTopup({ board: board({ leansFor: [3], balance: "2040" }), nowIso: NOW });
  assert.equal(r.decision, "SKIP");
  assert.equal(r.warn, true);
  assert.match(r.reason, /breach the 2000 floor/);
});

test("MUTATION · UNKNOWN balance fails closed (never treated as zero-risk)", () => {
  const b = board({ leansFor: [3] });
  delete b.credits;
  const r = decideTopup({ board: b, nowIso: NOW });
  assert.equal(r.decision, "SKIP");
  assert.equal(r.warn, true);
  assert.match(r.reason, /UNKNOWN/);
});

test("no board at all → SKIP (generation owns that)", () => {
  assert.equal(decideTopup({ board: null, nowIso: NOW }).decision, "SKIP");
});

test("unknown start time is never a spend reason", () => {
  const b = board({ leansFor: [3], games: [
    { gamePk: 1, awayTeamName: "A", homeTeamName: "B", gameDate: null },
    { gamePk: 3, awayTeamName: "E", homeTeamName: "F", gameDate: later(300) },
  ] });
  assert.equal(decideTopup({ board: b, nowIso: NOW }).decision, "SKIP");
});
