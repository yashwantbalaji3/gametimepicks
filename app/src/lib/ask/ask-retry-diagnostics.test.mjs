/**
 * Session 2 (2026-09-30) · WHY A TURN FELL BACK, AND WHAT THE RETRY WAS TOLD.
 *
 * Reproduced on the real 2026-09-30 projection: PIT @ CLE carries "PIT 54.4%, CLE 42.6%" and no pick. A writer said
 * "GameTimePicks favors Pittsburgh" (refused: a pick claim), was retried under "do not include any number that is not
 * in the evidence" (the correction for a different rule), said "The model expects Pittsburgh to win" (refused again)
 * and the plain fallback shipped. The log said UNSUPPORTED_CLAIM, and attempt 1's reason had been overwritten.
 *
 * These pin the repair without loosening anything: every violation names its rule, every rule has corrective
 * guidance, the retry carries the guidance for the rule that fired, and every attempt stays on the receipt.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ASK_RETRY_GUIDANCE, ASK_VERIFY_RULE } from "./contract.mjs";
import { verifyAnswer } from "./verifier.mjs";
import { retryInstruction, runAskTurn } from "./engine.mjs";
import { createFakeProvider } from "./provider-fake.mjs";
import { makeAskLoader, fixtureFetchText } from "./loader.mjs";
import { askAuditLine } from "../../../api/_ask-core.mjs";

const ev = (facts, { links = [] } = {}) => {
  const numbers = new Set();
  for (const t of facts) {
    for (const m of t.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) numbers.add(m[0]);
    for (const m of t.matchAll(/-?\d+(?:\.\d+)?/g)) numbers.add(String(Number(m[0])));
  }
  return { facts: facts.map((text, i) => ({ id: `E1.${i + 1}`, text })), numbers, identifiers: new Set(), links, items: [], unsupported: [] };
};

const PROB_ONLY = ev([
  "For PIT @ CLE (NFL) on 2026-10-01, GameTime has an EXPERIMENTAL forecast, which is graded but is not a product pick",
  "PIT @ CLE · EXPERIMENTAL model win probability: PIT 54.4%, CLE 42.6%, tie 3%",
  "PIT @ CLE · EXPERIMENTAL projected score: PIT 20, CLE 19",
]);
const WITH_PICK = ev(["NYM @ PHI · Moneyline: GameTime's pick is NYM at -120, model probability 55%, market-implied 52%, confidence lean"]);
const PAUSED = ev(["NYM @ PHI · Over/Under is PAUSED by GameTime and publishes no pick. The stated reason: below its bar"]);
const RESULTS = ev(["Bank Builder's current record is 42–41", "Keenan Allen's last 5 games: receiving yards 61, 44, 73, 90, 1",
  "In 4 of his last 5 games Keenan Allen had at least 40 receiving yards"]);

/* One trigger per rule — the property below needs each rule to be REACHABLE, not merely declared. */
const TRIGGERS = [
  [ASK_VERIFY_RULE.UNSUPPORTED_PICK, "GameTimePicks favors Pittsburgh.", PROB_ONLY],
  [ASK_VERIFY_RULE.PAUSED_MARKET_PICK, "Over/Under: GameTime picks over.", PAUSED],
  [ASK_VERIFY_RULE.UNSUPPORTED_NUMBER, "Pittsburgh scored 47.", PROB_ONLY],
  [ASK_VERIFY_RULE.UNSUPPORTED_DATE, "The game is on 2026-10-09.", PROB_ONLY],
  [ASK_VERIFY_RULE.UNSUPPORTED_STATUS, "Jaylen Warren is out with an ankle injury.", PROB_ONLY],
  [ASK_VERIFY_RULE.UNSUPPORTED_RECORD, "GameTime is 4-1 on Keenan Allen's line.", RESULTS],
  [ASK_VERIFY_RULE.UNSUPPORTED_LINK, "Bet it at [DraftKings](https://sportsbook.draftkings.com/).", PROB_ONLY],
  [ASK_VERIFY_RULE.FORBIDDEN_WAGERING_COPY, "This is a guaranteed lock.", PROB_ONLY],
  [ASK_VERIFY_RULE.FORBIDDEN_EV_COPY, "This has the highest expected value.", PROB_ONLY],
  [ASK_VERIFY_RULE.FORBIDDEN_SETTLEMENT_COPY, "He has already hit it — that leg is a winner.", PROB_ONLY],
];

test("every verifier violation names a rule from ASK_VERIFY_RULE, and each rule is reachable", () => {
  for (const [rule, text, evidence] of TRIGGERS) {
    const r = verifyAnswer(text, evidence);
    assert.equal(r.ok, false, `${rule}: "${text}" must be refused`);
    for (const v of r.violations) assert.ok(Object.values(ASK_VERIFY_RULE).includes(v.rule), `violation without a known rule: ${JSON.stringify(v)}`);
    assert.ok(r.violations.some((v) => v.rule === rule), `${rule} did not fire on "${text}" (got ${r.violations.map((v) => v.rule)})`);
  }
  const reached = new Set(TRIGGERS.map(([r]) => r));
  for (const rule of Object.values(ASK_VERIFY_RULE)) {
    if (rule === ASK_VERIFY_RULE.MALFORMED_ANSWER) continue; // the parser's rule, not the verifier's
    assert.ok(reached.has(rule), `${rule} is declared but no trigger here proves the verifier can emit it`);
  }
});

test("every rule has corrective retry guidance, and no guidance carries a figure the writer could copy", () => {
  for (const rule of Object.values(ASK_VERIFY_RULE)) {
    assert.ok(typeof ASK_RETRY_GUIDANCE[rule] === "string" && ASK_RETRY_GUIDANCE[rule].length > 20, `${rule} has no retry guidance`);
    assert.doesNotMatch(ASK_RETRY_GUIDANCE[rule], /\d/, `${rule}'s guidance contains a digit — a copied example number would fail the numeric check`);
  }
});

test("🔴 probability is not a pick: paraphrases are refused, faithful restatements and real picks pass", () => {
  for (const bad of [
    "GameTimePicks favors Pittsburgh.",
    "The model expects Pittsburgh to win.",
    "GameTime likes PIT, not CLE.", // a contrast is not a denial
    "No doubt about it: GameTime picks Pittsburgh.",
  ]) assert.equal(verifyAnswer(bad, PROB_ONLY).ok, false, `must refuse: ${bad}`);

  for (const good of [
    "The model gives PIT a 54.4% win probability and CLE 42.6%. GameTime has not published a separate pick for this game.",
    "There is no published pick for PIT @ CLE.",
    "GameTime's pick is none for PIT @ CLE.",
    "Neither GameTime nor its model picks a side here.",
  ]) assert.deepEqual(verifyAnswer(good, PROB_ONLY).violations, [], `must pass: ${good}`);

  // Directional wording IS allowed when the evidence holds the pick — the verifier is strict, not blind.
  assert.equal(verifyAnswer("GameTime favors NYM on the Moneyline.", WITH_PICK).ok, true);
});

test("🔴 class eight · an evidence-issued href is a route, not a number; an invented one is still refused", () => {
  const withLink = { ...PROB_ONLY, links: [{ id: "E2:report", label: "Open the NFL game report", href: "/nfl/game/401872964/" }] };
  assert.equal(verifyAnswer("The model gives PIT a 54.4% win probability. [Open the NFL game report](/nfl/game/401872964/)", withLink).ok, true);
  const invented = verifyAnswer("The model gives PIT a 54.4% win probability. [Report](/nfl/game/999999999/)", withLink);
  assert.deepEqual(invented.violations.map((v) => v.rule), ["UNSUPPORTED_NUMBER"]);
  assert.equal(verifyAnswer("Game 401872964 has PIT at 54.4%.", withLink).ok, false, "the id as PROSE is still a number claim");
});

test("🔴 negation: 'nothing' / 'none' deny, 'nothing but' intensifies", () => {
  assert.equal(verifyAnswer("Nothing in the evidence says any player is out with an injury.", PROB_ONLY).ok, true);
  assert.equal(verifyAnswer("None of it says the quarterback is questionable.", PROB_ONLY).ok, true);
  assert.equal(verifyAnswer("Nothing but bad news: Jaylen Warren is out with a knee injury.", PROB_ONLY).ok, false);
  assert.equal(verifyAnswer("Second to none: GameTime picks Pittsburgh.", PROB_ONLY).ok, false);
});

test("🔴 a W–L given to GameTime must appear as a record in the evidence — recent form is not GameTime's record", () => {
  // The evidence carries a 4 and a 1, so the numeric check alone lets "4-1" through; only the record rule stops it.
  const r = verifyAnswer("GameTime is 4-1 on Keenan Allen's line.", RESULTS);
  assert.deepEqual(r.violations.map((v) => v.rule), [ASK_VERIFY_RULE.UNSUPPORTED_RECORD]);
  assert.equal(verifyAnswer("Bank Builder is 42–41.", RESULTS).ok, true, "an owner's own record still passes");
  assert.equal(verifyAnswer("GameTime's Bank Builder record is 42–41.", RESULTS).ok, true);
});

test("the retry names the rule, quotes the refused claim and carries that rule's guidance — never a generic line", () => {
  const { violations } = verifyAnswer("GameTimePicks favors Pittsburgh.", PROB_ONLY);
  const text = retryInstruction(violations);
  assert.match(text, /^- UNSUPPORTED_PICK \("GameTime favors Pittsburgh"\): /m);
  assert.ok(text.includes(ASK_RETRY_GUIDANCE.UNSUPPORTED_PICK));
  assert.doesNotMatch(text, /Do not include any number that is not in the evidence/, "the old one-size instruction is gone");
  // Two rules → two lines, each with its own guidance.
  const two = retryInstruction(verifyAnswer("GameTimePicks favors Pittsburgh, who scored 47.", PROB_ONLY).violations);
  assert.ok(two.includes(ASK_RETRY_GUIDANCE.UNSUPPORTED_PICK) && two.includes(ASK_RETRY_GUIDANCE.UNSUPPORTED_NUMBER));
});

/* ─────────────────  the engine keeps every attempt, and the log says why  ───────────────── */

const FORECASTS = {
  schemaVersion: 1, artifact: "ask-forecasts", eligibleSports: ["mlb", "nfl", "epl"],
  forecasts: [{
    forecastId: "nfl-1", sport: "NFL", gameId: "401872964", away: "PIT", home: "CLE", awayName: "Pittsburgh Steelers", homeName: "Cleveland Browns",
    matchup: "PIT @ CLE", startUtc: "2031-10-04T00:15Z", experimental: true, probabilities: { away: 0.5443, home: 0.4258, tie: 0.0299 },
    projectedScore: { away: 20, home: 19 }, markets: [], links: [],
  }],
};
const w = (answerMarkdown) => JSON.stringify({ answerMarkdown, citations: [], followUps: [], linkIds: [] });
const turnWith = (script) => runAskTurn(
  { messages: [{ role: "user", text: "What does GameTime think about PIT @ CLE?" }] },
  {
    provider: createFakeProvider({ script: [JSON.stringify({ intent: "PUBLISHED_FORECAST", calls: [{ id: "c0", name: "getPublishedForecasts", arguments: { sport: "NFL" } }] }), ...script] }),
    turn: makeAskLoader(fixtureFetchText({ "/data/ask/v1/forecasts.json": FORECASTS })).beginTurn(),
    now: () => new Date("2031-10-03T16:00:00Z"),
  },
);

test("🔴 attempt 1's diagnosis survives attempt 2, and the fallback names its reason", async () => {
  const r = await turnWith([w("GameTimePicks favors Pittsburgh."), w("The model expects Pittsburgh to win.")]);
  assert.equal(r.receipt.verifierStatus, "FAILED_DETERMINISTIC_FALLBACK");
  assert.deepEqual(r.receipt.attempts.map((a) => [a.attempt, a.outcome, a.rules]), [
    [1, "REJECTED", ["UNSUPPORTED_PICK"]],
    [2, "REJECTED", ["UNSUPPORTED_PICK"]],
  ]);
  assert.match(r.receipt.attempts[0].claims[0], /favors Pittsburgh/, "attempt 1's refused claim must still be on the receipt");
  assert.match(r.receipt.attempts[1].claims[0], /expects Pittsburgh to win/);
  assert.deepEqual([r.receipt.attempts[0].retryable, r.receipt.attempts[1].retryable], [true, false]);
  assert.deepEqual(r.receipt.retryReason, ["UNSUPPORTED_PICK"]);
  assert.equal(r.receipt.fallbackReason, "VERIFIER_REJECTED_2_ATTEMPTS");
  assert.equal(r.receipt.verifierViolations.length, 2, "both attempts' violations, not only the last");
});

test("a rule-specific retry that fixes the answer publishes it as PASS_ON_RETRY", async () => {
  const r = await turnWith([w("GameTimePicks favors Pittsburgh."), w("The model gives PIT a 54.4% win probability and CLE 42.6%. GameTime has not published a separate pick for this game.")]);
  assert.equal(r.receipt.verifierStatus, "PASS_ON_RETRY");
  assert.equal(r.verified, true);
  assert.deepEqual(r.receipt.attempts.map((a) => a.outcome), ["REJECTED", "PASS"]);
  assert.equal(r.receipt.fallbackReason, undefined);
});

test("the production audit line carries rule ids per attempt and never the refused sentence", async () => {
  const r = await turnWith([w("GameTimePicks favors Pittsburgh."), w("The model expects Pittsburgh to win.")]);
  const line = JSON.parse(askAuditLine({ proceed: true, status: 200 }, r.receipt));
  assert.deepEqual(line.verifierRules, [["UNSUPPORTED_PICK"], ["UNSUPPORTED_PICK"]]);
  assert.deepEqual(line.attemptOutcomes, ["REJECTED", "REJECTED"]);
  assert.deepEqual(line.retryReason, ["UNSUPPORTED_PICK"]);
  assert.equal(line.fallbackReason, "VERIFIER_REJECTED_2_ATTEMPTS");
  const raw = JSON.stringify(line);
  assert.doesNotMatch(raw, /Pittsburgh|favors|expects/, "the log must carry check names, not the model's (or user's) words");
});
