/**
 * Mutation proofs for the afternoon top-up decision (Program 092-095 §13):
 *   - does not run when coverage is complete
 *   - does not run after first pitch (or inside the lead cutoff)
 *   - fails closed on budget breach and on UNKNOWN balance
 *   - runs only in the genuine gap state the founder approved
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideTopup, classifyEvents, EVENT_STATES } from "../../scripts/mlb-topup-decision.mjs";

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

// ── Event-level append-only classification (Program 108-111 §8.2) ───────────────────────────
// The whole-slate rule above is all-or-nothing. These prove the per-event replacement: a started
// early game no longer blocks a still-pregame late game from gaining legitimate coverage.

const mixedSlate = () => ({
  credits: { before: "19455" },
  games: [
    { gamePk: 1, awayTeamName: "A", homeTeamName: "B", gameDate: later(-60) }, // STARTED
    { gamePk: 2, awayTeamName: "C", homeTeamName: "D", gameDate: later(240) }, // pregame, uncovered
    { gamePk: 3, awayTeamName: "E", homeTeamName: "F", gameDate: later(300) }, // pregame, covered
  ],
  leans: [{ gamePk: 3 }],
});

test("EVENT-LEVEL · a started game does not block a still-pregame game from coverage", () => {
  const r = classifyEvents({ board: mixedSlate(), nowIso: NOW });
  const by = Object.fromEntries(r.events.map((e) => [e.gamePk, e.state]));
  assert.equal(by[1], EVENT_STATES.STARTED, "started event is frozen");
  assert.equal(by[2], EVENT_STATES.ADD, "…but the pregame uncovered event is still eligible");
  assert.equal(by[3], EVENT_STATES.COMPLETE);
  assert.deepEqual(r.fetchTargets, [2], "only the eligible event justifies a paid request");
});

test("EVENT-LEVEL · MUTATION: push the candidate past first pitch → frozen, no fetch", () => {
  const b = mixedSlate();
  b.games[1].gameDate = later(-5);
  assert.ok(Date.parse(b.games[1].gameDate) < Date.parse(NOW), "mutation must actually apply");
  const r = classifyEvents({ board: b, nowIso: NOW });
  assert.equal(r.events.find((e) => e.gamePk === 2).state, EVENT_STATES.STARTED);
  assert.deepEqual(r.fetchTargets, [], "a started event can never be an official addition");
});

test("EVENT-LEVEL · MUTATION: credit breach blocks fetch without falsifying coverage", () => {
  const b = mixedSlate();
  b.credits.before = "2010";
  const r = classifyEvents({ board: b, nowIso: NOW });
  assert.equal(r.events.find((e) => e.gamePk === 2).state, EVENT_STATES.CREDIT_BLOCKED);
  assert.deepEqual(r.fetchTargets, []);
  assert.equal(r.blocked, "credit budget");
});

test("EVENT-LEVEL · MUTATION: UNKNOWN balance fails closed", () => {
  const b = mixedSlate();
  delete b.credits;
  assert.equal(classifyEvents({ board: b, nowIso: NOW }).fetchTargets.length, 0);
});

test("EVENT-LEVEL · unidentifiable event fails closed, never fetched", () => {
  const b = mixedSlate();
  b.games.push({ gamePk: null, awayTeamName: "G", homeTeamName: "H", gameDate: later(200) });
  b.games.push({ gamePk: 9, awayTeamName: "I", homeTeamName: "J", gameDate: null });
  const r = classifyEvents({ board: b, nowIso: NOW });
  const failed = r.events.filter((e) => e.state === EVENT_STATES.FAIL_CLOSED);
  assert.equal(failed.length, 2, "both a missing gamePk and a missing start fail closed");
  assert.deepEqual(r.fetchTargets, [2], "neither is ever fetched");
});

test("EVENT-LEVEL · a fully covered slate requests nothing", () => {
  const b = mixedSlate();
  b.leans = [{ gamePk: 1 }, { gamePk: 2 }, { gamePk: 3 }];
  const r = classifyEvents({ board: b, nowIso: NOW });
  assert.deepEqual(r.fetchTargets, []);
  assert.ok(r.events.every((e) => e.state === EVENT_STATES.COMPLETE));
});

test("unknown start time is never a spend reason", () => {
  const b = board({ leansFor: [3], games: [
    { gamePk: 1, awayTeamName: "A", homeTeamName: "B", gameDate: null },
    { gamePk: 3, awayTeamName: "E", homeTeamName: "F", gameDate: later(300) },
  ] });
  assert.equal(decideTopup({ board: b, nowIso: NOW }).decision, "SKIP");
});
