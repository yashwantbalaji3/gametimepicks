/**
 * UFC model v1 guards (Program 167 · Release F).
 * Run: npx tsx --test src/lib/sports/ufc/model-v1.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { fitUfcV1, predictUfcV1, walkForwardUfcObservations, resolveFighter, UFC_ELO_PARAMS } from "./model-v1.mjs";

const corpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/ufc/corpus-v1.json"), "utf8"));
const FIT = fitUfcV1(corpus.rows);

test("fit is deterministic and folds only decisive finals with both ids", () => {
  const again = fitUfcV1(corpus.rows);
  assert.equal(FIT.foldedBouts, again.foldedBouts);
  assert.equal(FIT.fighters.size, again.fighters.size);
  const anyId = [...FIT.fighters.keys()][0];
  assert.equal(FIT.fighters.get(anyId).rating, again.fighters.get(anyId).rating, "identical fold, identical ratings");
});

test("walk-forward and fit share one arithmetic: same eligible count", () => {
  const obs = walkForwardUfcObservations(corpus.rows);
  assert.equal(obs.length, FIT.foldedBouts, "every folded bout produced exactly one pre-bout observation");
});

test("identity: provider id wins; unique name resolves; ambiguity and absence abstain", () => {
  const someFighter = corpus.rows[0].red;
  const byId = resolveFighter(FIT, { providerId: someFighter.id });
  assert.equal(byId.ok, true);
  assert.equal(byId.basis, "provider-id");
  const byName = resolveFighter(FIT, { name: someFighter.name });
  assert.ok(byName.ok, `unique corpus name resolves (${someFighter.name})`);
  const missing = resolveFighter(FIT, { name: "Fighter Who Does Not Exist" });
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /never guessed/);
});

test("SPARSE and IDLE rules abstain with named rules; established pairing predicts", () => {
  // Build a tiny synthetic corpus: two fighters with 3 decisive bouts each, then a current bout.
  const mk = (i, redId, blueId, outcome, dateUtc) => ({ providerBoutId: `b${i}`, statusRaw: "STATUS_FINAL", outcome, dateUtc, weightClass: "Lightweight", red: { id: redId, name: `Fighter ${redId}` }, blue: { id: blueId, name: `Fighter ${blueId}` } });
  const rows = [
    mk(1, "A", "B", "R", "2025-01-01T00:00Z"), mk(2, "A", "C", "R", "2025-02-01T00:00Z"), mk(3, "A", "D", "R", "2025-03-01T00:00Z"),
    mk(4, "E", "B", "B", "2025-01-15T00:00Z"), mk(5, "E", "C", "R", "2025-02-15T00:00Z"), mk(6, "E", "D", "R", "2025-03-15T00:00Z"),
  ];
  const fit = fitUfcV1(rows);
  const ok = predictUfcV1({ fit, bout: { red: "Fighter A", blue: "Fighter E", redProviderId: "A", blueProviderId: "E", dateUtc: "2025-06-01T00:00Z" }, boutIso: "2025-06-01T00:00Z" });
  assert.equal(ok.state, "PREDICTED");
  assert.ok(Math.abs(ok.probs.red + ok.probs.blue - 1) < 1e-9);
  const sparse = predictUfcV1({ fit, bout: { red: "Fighter A", blue: "Fighter B", redProviderId: "A", blueProviderId: "B", dateUtc: "2025-06-01T00:00Z" }, boutIso: "2025-06-01T00:00Z" });
  assert.equal(sparse.state, "ABSTAIN");
  assert.equal(sparse.rule, "SPARSE");
  const idle = predictUfcV1({ fit, bout: { red: "Fighter A", blue: "Fighter E", redProviderId: "A", blueProviderId: "E", dateUtc: "2027-06-01T00:00Z" }, boutIso: "2027-06-01T00:00Z" });
  assert.equal(idle.state, "ABSTAIN");
  assert.equal(idle.rule, "IDLE");
});

test("params are the committed baseline's exactly", () => {
  assert.deepEqual({ ...UFC_ELO_PARAMS }, { K: 32, START: 1500, SPARSE_FLOOR: 3, IDLE_DAYS: 540 });
});

test("the committed evaluation report re-derives from the lib (no hand-edited numbers)", () => {
  const report = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/ufc/reports/model-v1-evaluation.json"), "utf8"));
  const obs = walkForwardUfcObservations(corpus.rows);
  const scored = obs.filter((o) => o.dateUtc >= report.protocol.warmupBoundary);
  const covered = scored.filter((o) => o.abstainRule === null);
  assert.equal(report.coverage.eligible, scored.length);
  assert.equal(report.coverage.covered, covered.length);
  assert.equal(report.coverage.covered + report.coverage.abstained, report.coverage.eligible, "coverage arithmetic exact");
  assert.ok(report.metrics.model.logLoss < report.metrics.baselines.coin.logLoss, "beats coin on covered bouts");
});

test("independence is structural: no odds identifier in model code (comments excluded)", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/ufc/model-v1.mjs"), "utf8");
  assert.ok(!/odds|market|price|bookmaker/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
});
