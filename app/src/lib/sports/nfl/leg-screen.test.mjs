/**
 * NFL leg screen + scenario builder — synthetic legs only.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/leg-screen.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildScenario, decimalOf, screenLegs } from "./leg-screen.mjs";
import { isEligibleProvider } from "../odds/eligible-operators.mjs";

const g = (i, rec) => ({ eventId: `p${i}`, week: 10 - i, date: "2026-10-01", team: "T", opponent: "O", homeAway: "H", state: "STAT_LINE", stats: { rec } });
const log = (...recs) => recs.map((r, i) => g(i, r));
const FAM = { player_receptions: { eligibleForOfficialProducts: true, gtpProbability: true }, player_rush_yds: { eligibleForOfficialProducts: false } };
const cand = (id, event, team, recs, extra = {}) => ({ playerId: id, team, eventId: event, kickoffUtc: "2026-11-16T18:00Z", family: "player_receptions", side: "over", line: { line: 4.5, price: -150, sportsbook: "draftkings", capturedAt: "2026-11-15T12:00Z" }, eligibility: "ELIGIBLE", official: true, lineState: "OBSERVED", modelProbability: 0.62, log: log(...recs), ...extra });

test("every refusal is named and counted; 3/5 is never used", () => {
  const r = screenLegs([
    cand("a", "e1", "A", [5, 6, 7, 5, 6], { line: null }),
    cand("b", "e1", "B", [5, 6, 7, 5, 6], { line: { line: 4.5, price: null } }),
    cand("c", "e1", "C", [5, 6, 7, 5, 6], { eligibility: "UNKNOWN" }),
    cand("d", "e1", "D", [5, 6, 7, 5, 6], { family: "player_rush_yds" }),
    cand("e", "e1", "E", [5, 6, 7, 5]),
    cand("f", "e1", "F", [5, 6, 7, 1, 2]),
    cand("g", "e1", "G", [5, 6, 1, 1, 2]),
    cand("h", "e1", "H", [5, 6, 7, 5, 6], { official: false }),
    cand("i", "e1", "I", [5, 6, 7, 5, 6], { official: undefined }),
    cand("j", "e1", "J", [5, 6, 7, 5, 6], { line: null, lineState: "UNUSABLE" }),
    cand("k", "e1", "K", [5, 6, 7, 5, 6], { line: null, lineState: "WITHHELD" }),
    cand("l", "e1", "L", [5, 6, 7, 5, 6], { line: null, lineState: "NOT_BEFORE_KICKOFF" }),
    cand("m", "e1", "M", [5, 6, 4.5, 5, 6]),
  ], { families: FAM, isEligibleBook: isEligibleProvider });
  assert.deepEqual(r.reasons, { NO_OBSERVED_LINE: 1, NO_OBSERVED_PRICE: 1, PLAYER_NOT_ELIGIBLE: 1, FAMILY_NOT_QUALIFIED: 1, SHORT_SAMPLE: 1, TIER_3_OF_5_NEVER_USED: 1, TREND_BELOW_4_OF_5: 1,
    PROJECTION_NOT_OFFICIAL: 2, LINE_NOT_COMPARED: 1, INELIGIBLE_BOOK: 1, LINE_NOT_CAPTURED_BEFORE_KICKOFF: 1, PUSH_IN_RECORD: 1 });
  assert.equal(r.passed.length, 0);
});

test("a game with no stat line in the window blocks the leg (no 5/5 on four real games)", () => {
  const l = log(5, 6, 7, 5, 6); l[2] = { ...l[2], state: "NO_STAT_LINE", stats: undefined };
  assert.deepEqual(screenLegs([cand("a", "e1", "A", [], { log: l })], { families: FAM, isEligibleBook: isEligibleProvider }).reasons, { INCOMPLETE_HISTORY: 1 });
});

test("5/5 legs first; 4/5 only to fill; never adds legs past the goal", () => {
  const { passed } = screenLegs([cand("x4", "e3", "X", [5, 6, 7, 1, 6]), cand("a5", "e1", "A", [5, 6, 7, 5, 6]), cand("b5", "e2", "B", [6, 6, 7, 5, 6])], { families: FAM, isEligibleBook: isEligibleProvider });
  assert.deepEqual(passed.map((l) => [l.playerId, l.tier]), [["a5", "5/5"], ["b5", "5/5"], ["x4", "4/5"]]);
  const easy = buildScenario(passed, { stake: 100, goal: 250, minLegs: 2, maxLegs: 4 });
  assert.equal(easy.state, "BUILT");
  assert.deepEqual(easy.legs.map((l) => l.playerId), ["a5", "b5"], "goal 250 reached by two 5/5 legs ⇒ the 4/5 leg is not added");
  assert.equal(easy.grossReturn, 277.78);
  const far = buildScenario(passed, { stake: 100, goal: 5000, minLegs: 2, maxLegs: 4 });
  assert.deepEqual(far.legs.map((l) => l.playerId), ["a5", "b5", "x4"]);
  assert.equal(far.goalReached, false, "the goal is reported unmet — no extra legs are invented");
  assert.ok(far.warnings.includes("INCLUDES_4_OF_5"));
});

test("joint probability: product only across different games; same-game legs ⇒ unavailable; unqualified ⇒ none", () => {
  const { passed } = screenLegs([cand("a", "e1", "A", [5, 6, 7, 5, 6]), cand("b", "e2", "B", [5, 6, 7, 5, 6])], { families: FAM, isEligibleBook: isEligibleProvider });
  const s = buildScenario(passed, { stake: 50, goal: 100 });
  assert.equal(s.joint.state, "INDEPENDENT_GAMES");
  assert.equal(Math.round(s.joint.probability * 1e4), Math.round(0.62 * 0.62 * 1e4));
  const same = screenLegs([cand("a", "e1", "A", [5, 6, 7, 5, 6]), cand("b", "e1", "B", [5, 6, 7, 5, 6])], { families: FAM, isEligibleBook: isEligibleProvider }).passed;
  const sg = buildScenario(same, { stake: 50, goal: 100 });
  assert.equal(sg.joint.state, "JOINT_PROBABILITY_UNAVAILABLE");
  assert.equal(sg.joint.probability, undefined);
  const noProb = screenLegs([cand("a", "e1", "A", [5, 6, 7, 5, 6]), cand("b", "e2", "B", [5, 6, 7, 5, 6])], { families: { player_receptions: { eligibleForOfficialProducts: true, gtpProbability: false } }, isEligibleBook: isEligibleProvider }).passed;
  assert.equal(buildScenario(noProb, { stake: 50, goal: 100 }).joint.state, "NO_QUALIFIED_LEG_PROBABILITY");
});

test("risk limits: one leg per player, team and game concentration; too few legs ⇒ NO_QUALIFYING_BUILD", () => {
  const { passed } = screenLegs([cand("a", "e1", "A", [5, 6, 7, 5, 6]), cand("a", "e1", "A", [5, 6, 7, 5, 6], { family: "player_receptions", line: { line: 3.5, price: -200, sportsbook: "draftkings", capturedAt: "2026-11-15T12:00Z" } }), cand("b", "e1", "A", [5, 6, 7, 5, 6])], { families: FAM, isEligibleBook: isEligibleProvider });
  const s = buildScenario(passed, { stake: 10, goal: 1000, minLegs: 2 });
  assert.equal(s.state, "NO_QUALIFYING_BUILD");
  assert.equal(s.reason, "TOO_FEW_LEGS_AFTER_RISK_LIMITS");
  assert.deepEqual(s.skipped.map((x) => x.code).sort(), ["ONE_LEG_PER_PLAYER", "TEAM_CONCENTRATION"]);
  assert.deepEqual(buildScenario([], { stake: 10, goal: 1000 }), { state: "NO_QUALIFYING_BUILD", reason: "NO_LEG_PASSED_THE_SCREEN", qualifyingLegs: 0, skipped: [] });
});

test("fail closed: no allowlist ⇒ no leg; an ineligible book, a line captured at/after kickoff or without an instant ⇒ refused", () => {
  const ok = cand("a", "e1", "A", [5, 6, 7, 5, 6]);
  assert.deepEqual(screenLegs([ok], { families: FAM }).reasons, { NO_ELIGIBLE_BOOK_LIST: 1 }, "no eligibility rule passed");
  assert.deepEqual(screenLegs([ok], { families: FAM, isEligibleBook: null }).reasons, { NO_ELIGIBLE_BOOK_LIST: 1 });
  assert.equal(screenLegs([ok], { families: FAM, isEligibleBook: isEligibleProvider }).passed.length, 1);
  const r = screenLegs([
    cand("b", "e1", "B", [5, 6, 7, 5, 6], { line: { line: 4.5, price: -150, sportsbook: "betonlineag", capturedAt: "2026-11-15T12:00Z" } }),
    cand("c", "e1", "C", [5, 6, 7, 5, 6], { line: { line: 4.5, price: -150, sportsbook: "draftkings", capturedAt: "2026-11-16T18:00Z" } }),
    cand("d", "e1", "D", [5, 6, 7, 5, 6], { line: { line: 4.5, price: -150, sportsbook: "draftkings", capturedAt: "2026-11-16T19:00Z" } }),
    cand("e", "e1", "E", [5, 6, 7, 5, 6], { line: { line: 4.5, price: -150, sportsbook: "draftkings" } }),
    cand("f", "e1", "F", [5, 6, 7, 5, 6], { kickoffUtc: undefined }),
  ], { families: FAM, isEligibleBook: isEligibleProvider });
  assert.deepEqual(r.reasons, { INELIGIBLE_BOOK: 1, LINE_NOT_CAPTURED_BEFORE_KICKOFF: 4 });
  assert.equal(screenLegs([cand("g", "e1", "G", [5, 6, 7, 5, 6], { line: { line: 4.5, price: -150, sportsbook: "DraftKings", capturedAt: "2026-11-15T12:00Z" } })], { families: FAM, isEligibleBook: isEligibleProvider }).passed.length, 1, "a display title matches its key");
});

test("price arithmetic", () => {
  assert.equal(decimalOf(150), 2.5);
  assert.equal(Math.round(decimalOf(-150) * 1e4) / 1e4, 1.6667);
  assert.equal(decimalOf(0), null);
});

test("a push in the 5-game record is its own refusal, never 'below 4 of 5'; 4 over + 1 push is not a 4/5", () => {
  const r = screenLegs([cand("p", "e1", "P", [5, 6, 7, 4.5, 6]), cand("q", "e1", "Q", [5, 6, 4.5, 4.5, 1])], { families: FAM, isEligibleBook: isEligibleProvider });
  assert.deepEqual(r.reasons, { PUSH_IN_RECORD: 2 });
  assert.equal(r.passed.length, 0);
});

test("order: 5/5 before 4/5; within a tier by kickoff, then playerId", () => {
  const at = (h) => new Date(Date.parse("2026-11-16T18:00Z") + h * 3600_000).toISOString();
  const { passed } = screenLegs([
    cand("z5", "e9", "Z", [5, 6, 7, 5, 6], { kickoffUtc: at(0) }),
    cand("a5", "e8", "A", [5, 6, 7, 5, 6], { kickoffUtc: at(3) }),
    cand("m5", "e7", "M", [5, 6, 7, 5, 6], { kickoffUtc: at(0) }),
    cand("b4", "e6", "B", [5, 6, 7, 1, 6], { kickoffUtc: at(-1) }),
    cand("c4", "e5", "C", [5, 6, 7, 1, 6], { kickoffUtc: at(-2) }),
  ].map((c) => ({ ...c, line: { ...c.line, capturedAt: "2026-11-16T10:00Z" } })), { families: FAM, isEligibleBook: isEligibleProvider });
  assert.deepEqual(passed.map((l) => l.playerId), ["m5", "z5", "a5", "c4", "b4"], "5/5 by kickoff (ties by playerId), then 4/5 by kickoff");
  const s = buildScenario(passed, { stake: 10, goal: 1000, minLegs: 2, maxLegs: 3, maxPerTeam: 1 });
  assert.deepEqual(s.legs.map((l) => l.playerId), ["m5", "z5", "a5"], "the scenario takes them in that order");
});

test("price: only a valid American price for the side (|price| ≥ 100, finite integer); else NO_OBSERVED_PRICE", () => {
  const bad = [50, -50, -99, 1.91, 0, NaN, Infinity, 99.5, null, undefined, "-120"];
  const r = screenLegs(bad.map((price, i) => cand(`x${i}`, "e1", `T${i}`, [5, 6, 7, 5, 6], { line: { line: 4.5, price, sportsbook: "draftkings", capturedAt: "2026-11-15T12:00Z" } })), { families: FAM, isEligibleBook: isEligibleProvider });
  assert.deepEqual(r.reasons, { NO_OBSERVED_PRICE: bad.length });
  const ok = screenLegs([-120, 150, -100, 100].map((price, i) => cand(`o${i}`, `e${i}`, `T${i}`, [5, 6, 7, 5, 6], { line: { line: 4.5, price, sportsbook: "draftkings", capturedAt: "2026-11-15T12:00Z" } })), { families: FAM, isEligibleBook: isEligibleProvider }).passed;
  assert.equal(ok.length, 4);
  assert.equal(Math.round(ok.find((l) => l.line.price === -120).decimal * 1e4) / 1e4, 1.8333);
  assert.equal(ok.find((l) => l.line.price === 150).decimal, 2.5);
  assert.equal(Math.round(decimalOf(-120) * 1e4) / 1e4, 1.8333);
});
