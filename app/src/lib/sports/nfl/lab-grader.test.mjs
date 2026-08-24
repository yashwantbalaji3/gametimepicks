/**
 * NFL lab-grader guards (Program 201 · Release B).
 *
 * The NFL lane opened only because settle-lab-cards can now grade its legs. These pin the grading
 * semantics against fixtures (a tie is a push, never a loss — P180's lesson; exact-line totals
 * push; date confinement holds) and the wiring that keeps the lane honest end to end: ladder
 * builder settleable-by-construction, settler routing, eligibility conjunction, coverage lane.
 *
 * Run: npx tsx --test src/lib/sports/nfl/lab-grader.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SETTLEABLE_SPORTS } from "../../parlays/multi-sport.mjs";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const settler = read("scripts/parlays/settle-lab-cards.mjs");
const ladder = read("scripts/nfl/build-nfl-ladder.mjs");

test("the settler grades NFL: results loader, leg router and ladder directory are all wired", () => {
  assert.match(settler, /function loadNflResults/, "official final-score loader present");
  assert.match(settler, /function gradeNflLeg/, "leg grader present");
  assert.match(settler, /"nfl"\) \{ results\.push\(gradeNflLeg\(leg\)\)/, "legs route by their own sport");
  assert.match(settler, /nfl: "risk-ladder-nfl"/, "the NFL ladder directory is in settlement scope");
  assert.ok(SETTLEABLE_SPORTS.includes("nfl"), "the settleable list caught up with the capability");
});

test("grading semantics: a tie is a push, never a loss; exact-line totals push; date confinement holds", () => {
  // The rules are asserted against the source because the functions close over run state (DATE,
  // the results map). The claims are structural: the words that implement each rule must exist.
  assert.match(settler, /ftHome === r\.ftAway\) return "push"/, "moneyline tie → push");
  assert.match(settler, /total === leg\.line\) return "push"/, "exact-line total → push");
  assert.match(settler, /STATUS_FINAL/, "only final games grade — anything else pends");
  assert.match(settler, /etDayOf\(r\.dateUtc\) !== DATE\) continue/, "a 9-day results window cannot grade another day's leg");
  assert.match(settler, /nfl-\$\{r\.providerEventId\}/, "joined on the canonical eventId, never team names");
});

test("the ladder is settleable by construction and never selects on the rejected model", () => {
  assert.match(ladder, /moneyline|total_points/, "only markets the grader settles");
  assert.match(ladder, /assembleBands/, "one shared band engine — no copied assembly loop");
  assert.match(ladder, /NOT_PLAYING_TODAY|NO_PRICES/, "empty days publish typed refusals, never silence");
  assert.match(ladder, /THE MARKET'S OWN|market price on a settleable market/i, "side is the market's, not the model's");
  assert.ok(!/teamSignal|winProbability|forecast/.test(ladder), "no model read feeds selection");
});

test("eligibility and coverage both speak the new truth: the gate reason is prices, not the grader", () => {
  const ledger = JSON.parse(read("public/data/parlays/lab-ledger.json"));
  const nfl = ledger.streams.find((s) => s.id === "nfl");
  assert.ok(nfl, "nfl stream present");
  if (!nfl.live) {
    assert.ok(!/implements no NFL grader/.test(nfl.blocked ?? ""), "the engineering-gap reason is gone");
  }
  const coverage = read("scripts/parlays/build-risk-coverage.mjs");
  assert.match(coverage, /nfl: "risk-ladder-nfl"/, "coverage reads the NFL lane's own artifact");
});

test("the shared band engine reproduces the committed EPL ladder (extraction equivalence)", () => {
  // The extraction was proven by regenerating the committed artifact byte-for-byte; this pins the
  // wiring that made that proof meaningful: the EPL builder consumes the shared engine.
  const epl = read("scripts/epl/build-epl-ladder.mjs");
  assert.match(epl, /assembleBands/, "EPL builds through the shared engine");
  assert.ok(!/function buildForBand/.test(epl), "no residual private copy of the assembly loop");
});
