/**
 * UFC research-vertical guards (Program 153 · Release A).
 *
 * Run: npx tsx --test src/lib/sports/research/ufc-research.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { validateResearchArtifact } from "./artifact-modes.mjs";

const APP = process.cwd();
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "ufc");
const read = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), "utf8"));

test("corpus: bout-unit with card parents, id-based fighter identity, draw/NC preserved, zero name-joins", () => {
  const c = read("corpus-v1.json");
  assert.equal(c.dataClass, "PRIVATE_RESEARCH");
  assert.equal(c.totalFinalBouts, 1716);
  assert.equal(c.decisive + c.drawOrNc, c.totalFinalBouts, "every final bout is decisive or draw/NC — nothing flattened");
  assert.ok(c.drawOrNc >= 20, "draws/no-contests exist and are preserved");
  assert.equal(c.cards, 160);
  let prev = "";
  for (const b of c.rows) {
    assert.ok(b.dateUtc >= prev); prev = b.dateUtc;
    assert.ok(b.red.id && b.blue.id && b.red.id !== b.blue.id, "identity is provider ids, never names; self-matchups cannot exist");
    assert.ok(b.providerCardId, "a bout always links to its parent card by id");
    assert.ok(["R", "B", "DRAW_OR_NC"].includes(b.outcome));
  }
});

test("evaluation: coverage is a headline metric; Elo beats prior beats nothing-hidden; weak signal reported honestly", () => {
  const r = read("reports", "baseline-evaluation-v1.json");
  assert.ok(r.abstention.coverage > 0.15 && r.abstention.coverage < 0.6, "abstention-heavy by design — in-corpus history only");
  assert.match(r.abstention.note, /denominator/);
  assert.ok(Math.abs(r.metrics.coinAnchor.logLoss - Math.log(2)) < 0.001);
  assert.ok(r.metrics.elo.logLoss < r.metrics.redRatePrior.logLoss, "the baseline must beat the listing-order prior to claim any signal");
  assert.ok(r.metrics.elo.n >= 250);
  assert.match(r.limitations.join(" "), /in-corpus/);
  assert.match(r.marketComparison, /unavailable/);
});

test("replay: abstentions are first-class artifact rows with reasons; covered slate validates through the mode contract", () => {
  const a = read("replays", "replay-last-card.json");
  assert.equal(validateResearchArtifact(a).ok, true);
  assert.equal(a.mode, "HISTORICAL_REPLAY");
  assert.equal(a.evaluationEligible, true);
  assert.equal(a.coverage.covered + a.coverage.abstained, a.coverage.slateBouts, "the denominator is visible on the artifact");
  for (const ab of a.abstentions) assert.ok(ab.reasons.length > 0, "every abstention names its reasons");
  for (const p of a.predictions) assert.ok(p.dateUtc.slice(0, 10) >= a.sourceCutoffIso.slice(0, 10), "THE LEAKAGE RULE");
  for (const v of a.validation) assert.ok(v.actualOutcome && typeof v.modelProbOfActual === "number");
});

test("DETERMINISM · re-running the replay reproduces the artifact byte-for-byte", () => {
  const file = path.join(ROOT, "replays", "replay-last-card.json");
  const before = fs.readFileSync(file);
  const gen = read("replays", "replay-last-card.json").generatedAt;
  execFileSync("node", [path.join(APP, "scripts", "ufc", "replay-ufc-card.mjs"), "--now", gen], { cwd: APP });
  assert.ok(before.equals(fs.readFileSync(file)));
});

test("manifest records the rate-limit receipt and the winner-only field limitation; model card is honest about weak signal", () => {
  const m = read("raw", "CAPTURE_MANIFEST.json");
  assert.match(m.source.requestCount, /burst.*400|400.*burst/i, "the mechanical rate-limit receipt lives where the data lives");
  assert.match(m.completenessClaim, /winner-only/);
  const card = read("model-card-v1.json");
  assert.equal(card.publicActivation, "OFF — founder decision; research readiness is not product activation");
  assert.match(card.limitations.join(" "), /weak signal/i, "weak performance is stated as the finding, never dressed up");
  assert.ok(card.metrics.elo.n && card.abstention.coverage, "metrics carry denominators; abstention carries coverage");
});
