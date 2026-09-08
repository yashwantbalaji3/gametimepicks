/**
 * EPL shadow-run guards (Program 167 · Release G): the ladder, the lineup policy, and the REAL
 * opening week from the committed 380-fixture capture.
 * Run: npx tsx --test src/lib/sports/epl/shadow-run.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runEplShadow, PROMOTED_CLUBS_2026_27 } from "./shadow-run.mjs";
import { fitEplStrength } from "./strength-state.mjs";
import { validateShadowRun } from "../research/shadow-contract.mjs";

const corpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/epl/corpus-v1.json"), "utf8"));
const STATE = fitEplStrength({ rows: corpus.rows, cutoffIso: "2026-08-12T00:00:00Z" });
const FIX = { eventId: "soccer:epl:arsenal-v-chelsea:x", homeClub: "Arsenal", awayClub: "Chelsea", kickoffIso: "2026-08-22T14:00:00Z", matchweek: 1, capturedAt: "2026-08-09T22:45:00Z" };
const NOW = "2026-08-20T12:00:00Z";

test("post-start refuses; every run records the lineup policy", () => {
  const out = runEplShadow({ fixture: { ...FIX, kickoffIso: "2026-08-20T11:00:00Z" }, nowIso: NOW, strengthState: STATE });
  assert.equal(out.state, "REFUSED_POST_START");
  assert.match(out.lineupPolicy, /NOT_REQUIRED_FOR_TEAM_V1/);
});

test("unknown club (neither corpus nor promoted list) ABSTAINS — drift is never a silent cold start", () => {
  const out = runEplShadow({ fixture: { ...FIX, awayClub: "Wimbledon Dons FC" }, nowIso: NOW, strengthState: STATE });
  assert.equal(out.state, "ABSTAIN");
  assert.equal(out.rule, "IDENTITY");
});

test("promoted club passes identity via the committed list and cold-starts in the model", () => {
  const out = runEplShadow({ fixture: { ...FIX, homeClub: "Coventry City", eventId: "soccer:epl:coventry-city-v-chelsea:x" }, nowIso: NOW, strengthState: STATE });
  assert.equal(out.state, "READY_EXCEPT_ODDS");
  assert.equal(out.coldStart.home, true);
  assert.deepEqual([...PROMOTED_CLUBS_2026_27], ["coventry city", "hull city"]);
});

test("no odds → READY_EXCEPT_ODDS with MODEL-ONLY numbers and ZERO market content; two-way market can never qualify", () => {
  /*
   * OLD ASSERTION: no probabilities at all pre-authorization. What that guard actually protected
   * against was MARKET-derived content appearing without an authorized snapshot — and it also
   * blocked the model's own grid, putting paid acquisition on the independent forecast's critical
   * path (P243 charter forbids exactly that). NEW CONTRACT: the model's own numbers emit as a
   * labelled `modelOnly` block; every market-derived field (bookmakers, noVig, market block,
   * evaluation pairing) stays absent, and CURRENT_PRE_EVENT remains the only paired state.
   */
  const noOdds = runEplShadow({ fixture: FIX, nowIso: NOW, strengthState: STATE });
  assert.equal(noOdds.state, "READY_EXCEPT_ODDS");
  assert.ok(noOdds.modelOnly?.probs?.home > 0, "the model's own grid emits pre-odds");
  assert.match(noOdds.modelOnly.note, /no market comparison/, "the block names its limit");
  // P246: the modelOnly rung must carry EVERYTHING the matrix computed — cleanSheet,
  // doubleChance, margin and topScorelinesMass were computed and dropped here while the
  // sibling `model` block's comment recorded that exact defect as fixed. Field-parity, live.
  for (const k of ["cleanSheet", "doubleChance", "margin", "topScorelinesMass"]) {
    assert.ok(noOdds.modelOnly[k] != null, `modelOnly drops ${k} — the four-field live-loss defect`);
  }
  // CORRUPTION FIXTURE — what the old guard was really for: no market content of any kind.
  const raw = JSON.stringify(noOdds);
  assert.ok(!raw.includes('"market"'), "no market block pre-authorization");
  assert.ok(!raw.includes("noVig"), "no de-vig content pre-authorization");
  assert.ok(!raw.includes("bookmaker"), "no bookmaker content pre-authorization");
  assert.ok(!raw.includes('"model"'), "the PAIRED model block belongs to CURRENT_PRE_EVENT only");
  const binary = runEplShadow({
    fixture: FIX, nowIso: NOW, strengthState: STATE,
    oddsSnapshot: { capturedAt: "2026-08-20T10:00:00Z", rows: [{ eventId: FIX.eventId, marketType: "h2h", bookmaker: "bookx", outcomes: [{ name: "Arsenal", price: -125 }, { name: "Chelsea", price: 300 }] }] },
  });
  assert.equal(binary.state, "READY_EXCEPT_ODDS", "a two-outcome soccer market refuses de-vig — the draw cannot be folded away");
});

test("fresh three-way market → CURRENT_PRE_EVENT, validator-clean, draw preserved end to end", () => {
  const odds = { capturedAt: "2026-08-20T10:00:00Z", rows: [{ eventId: FIX.eventId, marketType: "h2h", bookmaker: "bookx", sourceAsOf: "2026-08-20T09:55:00Z", outcomes: [{ name: "Arsenal", price: -125 }, { name: "Draw", price: 260 }, { name: "Chelsea", price: 340 }] }] };
  const out = runEplShadow({ fixture: FIX, nowIso: NOW, strengthState: STATE, oddsSnapshot: odds });
  assert.equal(out.state, "CURRENT_PRE_EVENT", out.reason);
  assert.deepEqual(validateShadowRun(out.artifact).errors, []);
  assert.equal(out.artifact.model.probs.draw > 0, true, "model draw present");
  assert.equal(out.artifact.market.bookmakers[0].noVig.length, 3, "market draw present");
  assert.equal(out.artifact.publicActivation, "OFF");
  assert.ok(Math.abs(out.artifact.model.probs.home + out.artifact.model.probs.draw + out.artifact.model.probs.away - 1) < 1e-9);
});

test("REAL ARTIFACTS · all ten opening-week fixtures run the ladder from the committed capture", () => {
  const cap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/soccer/epl/fixtures/capture-2026-27-2026-08-09T2245.json"), "utf8"));
  const opening = cap.rows.filter((r) => r.matchweek === 1);
  assert.equal(opening.length, 10, "matchweek 1 carries ten fixtures");
  const states = {};
  for (const fixture of opening) {
    const out = runEplShadow({ fixture, nowIso: "2026-08-12T20:00:00Z", strengthState: STATE });
    states[out.state] = (states[out.state] ?? 0) + 1;
    assert.ok(["READY_EXCEPT_ODDS", "ABSTAIN"].includes(out.state), `${fixture.homeClub} v ${fixture.awayClub}: ${out.state}`);
    const raw = JSON.stringify(out);
    // Model-only numbers are allowed (labelled); market content is not.
    assert.ok(!raw.includes("noVig") && !raw.includes("bookmaker"), "no market content pre-authorization");
    if (out.state === "READY_EXCEPT_ODDS") assert.ok(out.modelOnly?.probs, "the model's own grid emits with its label");
  }
  assert.equal(states.READY_EXCEPT_ODDS, 10, "every opening fixture is READY_EXCEPT_ODDS — identity resolves for all twenty clubs (18 corpus + 2 promoted)");
});
