/**
 * EPL player-rate guards.
 *
 * The model CLEARED its preregistered bars, which makes these more important rather than less: a
 * validated model is one that will now be believed, and the properties the validation rested on have
 * to keep holding. Leakage in particular cannot be caught by a good score — a model that sees the
 * match it is predicting scores BETTER, not worse.
 *
 * Run: npx tsx --test src/lib/sports/epl/player-rates.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fitPlayerRates, predictPlayer, predictRaw, predictPositional,
  participationState, positionGroup,
} from "./player-rates.mjs";

const row = (playerId, position, opts = {}) => ({
  playerId, position,
  started: opts.sub ? false : opts.dnp ? false : true,
  subbedIn: !!opts.sub,
  goals: opts.goals ?? 0,
});

test("participation is a STATE, and a non-appearance carries no rate at all", () => {
  assert.equal(participationState({ started: true, subbedIn: false }), "START");
  assert.equal(participationState({ started: false, subbedIn: true }), "SUB");
  assert.equal(participationState({ started: false, subbedIn: false }), null);
  const fit = fitPlayerRates([row("1", "F", { goals: 1 })]);
  assert.equal(predictPlayer(fit, { playerId: "1", position: "F", state: null }), null,
    "a player who did not appear gets no claim, not a small one");
});

test("position groups bucket ESPN's real abbreviations — the defect that voided v1", () => {
  /*
   * "SUB" is ESPN's position for a substitute and the MOST COMMON value in the corpus (13,486 of
   * 30,377 rows). The first version tested `includes("B")` and therefore classified every substitute
   * in the league as a defender, while CD-L and CF-R both fell to UNK — blending the lowest- and
   * highest-scoring outfield positions. Nothing crashed; the positional BASELINE just got weaker,
   * which flattered the model it was measuring. That voided a passing result.
   */
  assert.equal(positionGroup("SUB"), "SUB", "a substitute's role is not a position — and never a defender");
  assert.equal(positionGroup("CD-L"), "D");
  assert.equal(positionGroup("CD-R"), "D");
  assert.equal(positionGroup("CF-L"), "F", "a centre-forward must not share a bucket with a centre-back");
  assert.equal(positionGroup("CF-R"), "F");
  assert.equal(positionGroup("G"), "G");
  assert.equal(positionGroup("LB"), "D");
  assert.equal(positionGroup("RM"), "M");
  assert.equal(positionGroup("AM-R"), "M");
  assert.equal(positionGroup("ST"), "F");
  assert.equal(positionGroup(""), "UNK");
});

test("the buckets separate the way football does", () => {
  /*
   * A structural check on the FIT rather than the string mapping: if the groups did not separate,
   * the positional baseline would be a league average wearing five labels, and beating it would
   * prove nothing. Forwards must outscore defenders by a wide margin and keepers must score ~never.
   */
  const rows = [];
  for (let i = 0; i < 300; i++) rows.push(row(`f${i}`, "CF-L", { goals: i % 4 === 0 ? 1 : 0 }));
  for (let i = 0; i < 300; i++) rows.push(row(`d${i}`, "CD-R", { goals: i % 40 === 0 ? 1 : 0 }));
  for (let i = 0; i < 300; i++) rows.push(row(`g${i}`, "G", { goals: 0 }));
  const fit = fitPlayerRates(rows);
  const f = predictPositional(fit, { playerId: "x", position: "CF-L", state: "START" }).probability;
  const d = predictPositional(fit, { playerId: "x", position: "CD-R", state: "START" }).probability;
  const g = predictPositional(fit, { playerId: "x", position: "G", state: "START" }).probability;
  assert.ok(f > d * 5, `forwards ${f.toFixed(3)} must clearly outscore defenders ${d.toFixed(3)}`);
  assert.equal(g, 0, "keepers score at zero and the bucket must show it");
});

test("LEAKAGE IS STRUCTURAL: a fit sees only the rows it is given", () => {
  /*
   * The backtest hands this only pre-cutoff matches, and this asserts the lib cannot widen that on
   * its own. A model that saw the match it predicts would score BETTER, so no metric would catch it.
   */
  const early = fitPlayerRates([row("9", "F", { goals: 0 })]);
  const late = fitPlayerRates([row("9", "F", { goals: 0 }), row("9", "F", { goals: 3 })]);
  assert.equal(early.appearancesFitted, 1);
  assert.equal(late.appearancesFitted, 2);
  const a = predictPlayer(early, { playerId: "9", position: "F", state: "START" }, { k: 4 });
  const b = predictPlayer(late, { playerId: "9", position: "F", state: "START" }, { k: 4 });
  assert.ok(b.lambda > a.lambda, "more observed goals must move the rate — and only via rows passed in");
});

test("shrinkage pulls a thin sample toward the positional prior, hard", () => {
  /*
   * The defect this prevents: a striker with two appearances and one goal publishing ~39% next to
   * his name. The raw baseline does exactly that, which is why the preregistration scored it.
   */
  const league = [];
  for (let i = 0; i < 200; i++) league.push(row(`p${i}`, "F", { goals: i % 10 === 0 ? 1 : 0 }));
  const fit = fitPlayerRates([...league, row("hot", "F", { goals: 1 }), row("hot", "F", { goals: 1 })]);

  const raw = predictRaw(fit, { playerId: "hot", position: "F", state: "START" });
  const shrunk = predictPlayer(fit, { playerId: "hot", position: "F", state: "START" }, { k: 16 });
  assert.ok(raw.probability > 0.6, "the raw rate believes two appearances completely");
  assert.ok(shrunk.probability < 0.35, "shrinkage refuses to");
  assert.ok(shrunk.probability > predictPositional(fit, { playerId: "hot", position: "F", state: "START" }).probability,
    "but it still moves him above the positional prior — the player signal is kept, not erased");
});

test("a player never seen before falls back to his position, never to zero", () => {
  const league = [];
  for (let i = 0; i < 100; i++) league.push(row(`p${i}`, "F", { goals: i % 8 === 0 ? 1 : 0 }));
  const fit = fitPlayerRates(league);
  const debut = predictPlayer(fit, { playerId: "brand-new", position: "F", state: "START" }, { k: 8 });
  assert.ok(debut.probability > 0, "a debutant is not a zero-probability player");
  assert.equal(debut.appearances, 0);
  assert.ok(Math.abs(debut.probability - predictPositional(fit, { playerId: "x", position: "F", state: "START" }).probability) < 1e-9,
    "with no history he IS the positional prior");
});

test("probability is a proper transform of lambda and stays inside [0,1)", () => {
  const fit = fitPlayerRates([row("1", "F", { goals: 5 })]);
  const p = predictPlayer(fit, { playerId: "1", position: "F", state: "START" }, { k: 0 });
  assert.ok(Math.abs(p.probability - (1 - Math.exp(-p.lambda))) < 1e-12);
  assert.ok(p.probability > 0 && p.probability < 1, "P(scores at least once) can never reach certainty");
});

test("a thin positional cell falls back to the league rate rather than a 3-appearance estimate", () => {
  const fit = fitPlayerRates([row("k1", "G", { goals: 1 }), row("k2", "G", { goals: 1 }), row("k3", "G", { goals: 1 })]);
  const keeper = predictPositional(fit, { playerId: "k1", position: "G", state: "START" });
  assert.ok(keeper.probability < 0.9, "three keepers who all scored must not become a 100% positional rate");
});
