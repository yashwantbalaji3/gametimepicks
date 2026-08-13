/**
 * Release B guards (Program 172): the preseason model was evaluated against bars declared BEFORE
 * results, and it FAILED them. These guards pin the rejection so it cannot be quietly reversed by
 * relaxing a threshold, and pin the separation between the preseason and regular-season cards.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const evalR = read("data/internal/research/nfl/reports/preseason-model-v1-evaluation.json");
const card = read("data/internal/research/nfl/preseason-model-card-v1.json");

test("the protocol is leakage-safe and the population reconciles exactly", () => {
  assert.equal(evalR.accounting.reconciles, true);
  assert.equal(evalR.accounting.trainGames + evalR.accounting.testGames, evalR.accounting.preseasonGames);
  assert.equal(evalR.accounting.testGames, 48, "the newest complete preseason is the held-out season");
  assert.match(evalR.protocol.fit, /2023 \+ 2024 preseason only/);
  assert.match(evalR.protocol.test, /scored ONCE/);
  assert.match(evalR.protocol.excluded, /no market input/);
  assert.match(evalR.protocol.tiePolicy, /excluded from the winner denominator/);
});

test("BARS WERE DECLARED BEFORE RESULTS — and the source proves it structurally", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/evaluate-nfl-preseason-model.mjs"), "utf8");
  const barsIdx = src.indexOf("const BARS = {");
  const fitIdx = src.indexOf("const corpus = read(");
  assert.ok(barsIdx > 0 && fitIdx > 0 && barsIdx < fitIdx, "the bar block must precede any data load in the source");
  for (const head of ["winner", "total", "margin"]) {
    assert.ok(evalR.bars[head].threshold, `${head} bar states its numeric threshold`);
    assert.ok(evalR.bars[head].mustBeat.length >= 2, `${head} names its baselines`);
    assert.ok(evalR.bars[head].rationale, `${head} says why the bar sits there`);
  }
});

test("REJECTED · the winner head is indistinguishable from a coin and abstains", () => {
  const w = evalR.heldOut2025.winner;
  assert.equal(evalR.promotion.winner.state, "ABSTAIN");
  assert.ok(w.model.logLoss >= 0.6931 - 0.010, `logLoss ${w.model.logLoss} did not clear the coin by the required margin`);
  assert.ok(w.model.ece > 0.05, "reliability also failed — this is not a borderline pass");
  // the fitted Elo discount is NEGATIVE: regular-season strength anti-predicts preseason winners.
  assert.ok(evalR.fit.eloDiscountVsRegular < 0, "the measured discount is negative — noise, not signal");
});

test("REJECTED · total and margin miss their declared bars; coverage failure is recorded", () => {
  assert.equal(evalR.promotion.total.state, "RESEARCH_ONLY");
  assert.ok(evalR.promotion.total.evidence.improvementOverV1 < evalR.promotion.total.evidence.requiredImprovement,
    "the total head beat v1 by less than the pre-declared 2.0 points");
  assert.equal(evalR.promotion.margin.state, "RESEARCH_ONLY");
  const m = evalR.heldOut2025.margin;
  assert.ok(m.model.coverage80 < 0.72, `margin intervals under-cover (${m.model.coverage80}) — small-sample σ is too narrow`);
  assert.ok(m.model.mae > m.baselines.pickem.mae, "pick'em beat the margin head; the model claims nothing here");
});

test("no head is PUBLIC_ELIGIBLE — nothing may promote off this evaluation", () => {
  for (const head of ["winner", "total", "margin"]) {
    assert.notEqual(evalR.promotion[head].state, "PUBLIC_ELIGIBLE", `${head} must not be publishable`);
  }
  assert.equal(card.publicActivation, "OFF");
});

test("the preseason card is SEPARATE — the regular-season card and record are untouched", () => {
  assert.equal(card.modelId, "nfl-preseason-v1-score-distribution");
  assert.match(card.separateFrom, /nfl-model-v1-elo-analytic/);
  const regular = read("data/internal/research/nfl/model-card-v1.json");
  assert.equal(regular.modelId, "nfl-model-v1-elo-analytic");
  assert.notEqual(regular.modelId, card.modelId, "two distinct model ids, two distinct records");
  assert.equal(regular.abstention.preseason, "always", "the regular-season card still abstains in preseason");
  assert.ok(card.limitations.some((l) => /participation is unmodelled/.test(l)));
});
