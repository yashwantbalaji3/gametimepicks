/**
 * THE LEDGER IS SHARED; THE RECORD IS NOT — v1.7 F2 evidence repair (G1).
 *
 * Run: npx tsx --test src/lib/soccer/epl-graded-by-model.test.mjs
 *
 * Pins the defect the founder packet named at build-epl-forecasts.mjs:316-334: the forecast builder
 * counted the whole graded ledger (36 rows, all epl-model-v1-split-poisson) as "graded under this
 * model" while the live model was P304 with a forward n of 0. Counts and figures attributed to the
 * live model must come ONLY from rows whose modelId is the live model's; zero such rows means n = 0
 * and NO calibration number — null, never 0.0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { splitEplGradedByModel, eplTrackRecordSentence, eplGradedRecordField } from "./epl-graded-by-model.mjs";

const P304 = "epl-model-v2-elo-poisson";
const V1 = "epl-model-v1-split-poisson";

const row = (modelId, i, over = {}) => ({
  eventId: `e${i}`, modelId, kickoffUtc: `2026-09-${String(10 + (i % 10)).padStart(2, "0")}T15:00:00Z`,
  scores: { hit: i % 2 === 0, logLoss: 1 + i * 0.01, brier: 0.6 + i * 0.001, over25: { brier: 0.25 } },
  ...over,
});

test("mixed model versions → counts separated, and every prior model is its own labelled bucket", () => {
  const rows = [
    ...Array.from({ length: 36 }, (_, i) => row(V1, i, { market: { scores: { logLoss: 1.05 } } })),
    ...Array.from({ length: 4 }, (_, i) => row(P304, 100 + i)),
    row("epl-model-v0-something-older", 500),
  ];
  const s = splitEplGradedByModel(rows, { modelId: P304 });
  assert.equal(s.total, 41);
  assert.equal(s.current.modelId, P304);
  assert.equal(s.current.n, 4, "only P304's own rows are 'under this model'");
  assert.equal(s.current.hits, 2);
  assert.deepEqual(s.prior.map((p) => [p.modelId, p.n]), [["epl-model-v0-something-older", 1], [V1, 36]]);
  assert.equal(s.prior.find((p) => p.modelId === V1).pairedWithMarket, 36);
  assert.equal(s.current.pairedWithMarket, 0);
  assert.equal(s.unattributed, 0);
  // Prior figures exist (they are that model's record); they never leak into the live bucket.
  assert.ok(s.prior[1].meanLogLoss > 0);
  assert.ok(Math.abs(s.current.meanLogLoss - (1 + (100 + 101 + 102 + 103) * 0.01 / 4)) < 1e-9);
});

test("zero P304 rows → n 0 and NO calibration number (null, never 0.0)", () => {
  const rows = Array.from({ length: 36 }, (_, i) => row(V1, i));
  const s = splitEplGradedByModel(rows, { modelId: P304 });
  assert.equal(s.current.n, 0);
  assert.equal(s.current.hits, 0);
  for (const k of ["meanLogLoss", "meanBrier", "over25Brier", "firstKickoffUtc", "lastKickoffUtc"]) {
    assert.strictEqual(s.current[k], null, `${k} must be null at n = 0, not a value`);
  }
  assert.equal(s.prior.length, 1);
  assert.equal(s.prior[0].n, 36);
  const field = eplGradedRecordField(s);
  assert.equal(field.gradedUnderThisModel, 0);
  assert.deepEqual(field.priorModels, [{ modelId: V1, graded: 36 }]);
  assert.equal(field.ledgerTotal, 36);
});

test("rows with no modelId are counted as unattributed — neither the live model's nor a prior's", () => {
  const rows = [row(P304, 1), { ...row(V1, 2), modelId: null }, { ...row(V1, 3), modelId: undefined }, row(V1, 4)];
  const s = splitEplGradedByModel(rows, { modelId: P304 });
  assert.equal(s.current.n, 1);
  assert.equal(s.unattributed, 2);
  assert.deepEqual(s.prior.map((p) => p.n), [1]);
  assert.equal(s.total, 4);
});

test("the split refuses to run without a live modelId — an unlabelled split is the defect itself", () => {
  assert.throws(() => splitEplGradedByModel([row(V1, 1)], {}), /modelId is required/);
  assert.throws(() => splitEplGradedByModel([row(V1, 1)], { modelId: "" }), /modelId is required/);
});

test("the public sentence states the LIVE count and names the prior record as not this model's evidence", () => {
  const none = splitEplGradedByModel(Array.from({ length: 36 }, (_, i) => row(V1, i)), { modelId: P304 });
  const s0 = eplTrackRecordSentence(none, { adopted: true });
  assert.match(s0, /^No Premier League match has been graded under this model\./);
  assert.match(s0, /no track record to cite/, "pinned by public-route-inventory.test.mjs");
  assert.match(s0, /36 matches were graded under the model this one replaced/);
  assert.match(s0, /not evidence for this model/);
  assert.doesNotMatch(s0, /36 Premier League matches have been graded under this model/, "the defect: v1 rows read as P304's");

  const some = splitEplGradedByModel([...Array.from({ length: 36 }, (_, i) => row(V1, i)), row(P304, 90), row(P304, 91)], { modelId: P304 });
  const s2 = eplTrackRecordSentence(some, { adopted: true });
  assert.match(s2, /^2 Premier League matches have been graded under this model — far too few/);
  assert.match(s2, /36 matches were graded under the model this one replaced/);
  assert.doesNotMatch(s2, /\d+(\.\d+)?%/, "no accuracy figure at any sample size");

  const one = splitEplGradedByModel([row(P304, 1)], { modelId: P304 });
  assert.match(eplTrackRecordSentence(one, { adopted: false }), /^1 Premier League match has been graded under this model/);
  assert.doesNotMatch(eplTrackRecordSentence(one, { adopted: false }), /replaced/, "no prior clause when there is no prior record");

  assert.equal(eplTrackRecordSentence(null), "The graded record could not be read, so no accuracy claim is made here.");
});

test("LIVE · the committed ledger splits the way the packet says: every row is v1, P304 has its own count", () => {
  const p = path.join(process.cwd(), "public/data/soccer/epl/results/graded-forecasts.jsonl");
  if (!fs.existsSync(p)) return;
  const rows = fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const s = splitEplGradedByModel(rows, { modelId: P304 });
  assert.equal(s.total, rows.length, "every ledger row lands in exactly one bucket");
  assert.equal(s.current.n + s.prior.reduce((a, b) => a + b.n, 0) + s.unattributed, rows.length);
  assert.equal(s.current.n, rows.filter((r) => r.modelId === P304).length);
  const v1 = s.prior.find((b) => b.modelId === V1);
  assert.ok(v1 && v1.n >= 36, "the 36 rows graded under the previous model stay visible as a prior bucket");
  if (s.current.n === 0) assert.strictEqual(s.current.meanLogLoss, null, "no P304 rows ⇒ no P304 figure");
});

test("SOURCE PIN · the workflow's grader writes the paired CONTROL the forward protocol needs — the lib rule alone was unsatisfiable", () => {
  // grade-forecasts.mjs (lib) scored the replaced model's probabilities on every graded match; the
  // script the workflows actually run built its rows inline and never did. forward-receipt.mjs filters
  // on control.logLoss, so P304's forward n could not leave zero however many matches were graded.
  const script = fs.readFileSync(path.join(process.cwd(), "scripts/epl/grade-epl-forecasts.mjs"), "utf8");
  assert.match(script, /import \{[^}]*scoreControlBlock[^}]*\} from "\.\.\/\.\.\/src\/lib\/sports\/epl\/grade-forecasts\.mjs"/);
  assert.match(script, /\.\.\.scoreControlBlock\(fc\.row, actual\)/, "the control block is spread onto every graded row");
  assert.match(script, /\.\.\.scoreShadowTotalsBlock\(fc\.row, actual, total\)/, "and the P305-F shadow block beside it");
  const lib = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/epl/grade-forecasts.mjs"), "utf8");
  assert.match(lib, /\.\.\.scoreControlBlock\(fc\.row, actual\)/, "one rule, both callers");
});

test("LIVE · every row graded under P304 carries the control the forward receipt reads", () => {
  const p = path.join(process.cwd(), "public/data/soccer/epl/results/graded-forecasts.jsonl");
  if (!fs.existsSync(p)) return;
  const rows = fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const p304 = rows.filter((r) => r.modelId === P304);
  for (const r of p304) {
    assert.equal(r.control?.modelId, V1, `${r.eventId}: a P304 row without the replaced model's score can never enter the forward test`);
    assert.ok(Number.isFinite(r.control?.logLoss), `${r.eventId}: control.logLoss must be a number`);
  }
});

test("SOURCE PIN · the forecast builder derives its trackRecord from the per-model split, not the whole ledger", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/epl/build-epl-forecasts.mjs"), "utf8");
  assert.match(src, /splitEplGradedByModel\(/, "the builder must split the ledger by modelId");
  assert.match(src, /eplTrackRecordSentence\(/, "the sentence must come from the split");
  assert.match(src, /gradedRecord: eplGradedRecordField\(/, "the count travels on the artifact beside the sentence");
  assert.doesNotMatch(src, /const n = rec\.team\.matches;/, "the ledger-wide count must not feed the sentence again");
});
