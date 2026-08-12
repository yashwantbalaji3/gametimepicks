/**
 * Receipt-verifier guards (Program 163 · Release C) — every synthetic case from the charter.
 *
 * Run: npx tsx --test src/lib/ops/receipt-verifier.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { RECEIPT_VERIFIER_VERSION, ARTIFACT_CLASSES, classifyRun, evaluateClass, verifyCadenceReceipts } from "./receipt-verifier.mjs";

const RUN = { id: "999", event: "schedule", workflowName: "sport-schedules", conclusion: "success" };
const M = (generatedAt, semanticHash, counts, over = {}) => ({ generatedAt, sourceAsOf: generatedAt, semanticHash, counts, ...over });
const CLS = (id) => ARTIFACT_CLASSES.find((c) => c.id === id);

test("run classification: scheduled+success qualifies; manual dispatch, wrong workflow, and failure never do", () => {
  assert.equal(classifyRun(RUN).qualifying, true);
  assert.equal(classifyRun({ ...RUN, event: "workflow_dispatch" }).qualifying, false, "a manual dispatch is never a cadence receipt");
  assert.equal(classifyRun({ ...RUN, workflowName: "quality-gate" }).qualifying, false);
  assert.equal(classifyRun({ ...RUN, conclusion: "failure" }).qualifying, false);
  const out = verifyCadenceReceipts({ run: { ...RUN, event: "workflow_dispatch" }, manifests: {} });
  assert.ok(out.receipts.every((r) => r.verdict === "NOT_EVALUATED"), "a non-qualifying run evaluates nothing into a receipt");
});

test("clean change, proven no-change, and allowed retention each classify correctly", () => {
  const clean = evaluateClass(CLS("ufc-results"), { prior: M("2026-08-11T14:10:00Z", "aaa", { completed: 12 }, { state: "RESULTS", reconciliationExact: true }), current: M("2026-08-12T14:10:00Z", "bbb", { completed: 17 }, { state: "RESULTS", reconciliationExact: true }) });
  assert.equal(clean.verdict, "QUALIFYING_CHANGE");
  const same = evaluateClass(CLS("nfl-schedule"), { prior: M("2026-08-11T14:10:00Z", "aaa", { rows: 18 }), current: M("2026-08-12T14:10:00Z", "aaa", { rows: 18 }) });
  assert.equal(same.verdict, "NO_CHANGE_PROVEN", "stamps advanced + semantic equality = the idempotency receipt");
  const kept = evaluateClass(CLS("epl-fixtures"), { prior: M("2026-08-11T14:10:00Z", "aaa", { rows: 380 }), current: M("2026-08-11T14:10:00Z", "aaa", { rows: 380 }), expectation: { allowRetention: true } });
  assert.equal(kept.verdict, "RETAINED_LKG", "a discarded unchanged snapshot is valid for this class");
});

test("FAIL-CLOSED: green-without-artifact, empty overwrite, mass deletion, broken reconciliation", () => {
  const ghost = evaluateClass(CLS("injuries-nfl"), { prior: M("2026-08-11T14:10:00Z", "aaa", { entries: 800 }), current: M("2026-08-11T14:10:00Z", "aaa", { entries: 800 }) });
  assert.equal(ghost.verdict, "FAILED_GREEN_NO_ARTIFACT", "a mandatory class whose stamps never advance is a P0, not a pass");
  const empty = evaluateClass(CLS("nba-results"), { prior: M("2026-08-11T14:10:00Z", "aaa", { rows: 20 }, { state: "RESULTS" }), current: M("2026-08-12T14:10:00Z", "bbb", { rows: 0 }, { state: "RESULTS", reconciliationExact: true }) });
  assert.equal(empty.verdict, "FAILED_EMPTY_OVERWRITE");
  const mass = evaluateClass(CLS("nba-schedule"), { prior: M("2026-08-11T14:10:00Z", "aaa", { rows: 58 }), current: M("2026-08-12T14:10:00Z", "bbb", { rows: 12 }) });
  assert.equal(mass.verdict, "FAILED_MASS_DELETION");
  // Forward-window classes may collapse legitimately when events start (UFC 83→17 observed live
  // the night two cards ran) — but ONLY with the explicit expectation.
  const slide = evaluateClass(CLS("ufc-schedule"), { prior: M("2026-08-11T14:10:00Z", "aaa", { rows: 83 }), current: M("2026-08-12T14:10:00Z", "bbb", { rows: 17 }), expectation: { allowWindowSlide: true } });
  assert.equal(slide.verdict, "QUALIFYING_CHANGE");
  const recon = evaluateClass(CLS("ufc-results"), { prior: M("2026-08-11T14:10:00Z", "aaa", { completed: 12 }, { state: "RESULTS" }), current: M("2026-08-12T14:10:00Z", "bbb", { completed: 14 }, { state: "RESULTS", reconciliationExact: false }) });
  assert.equal(recon.verdict, "FAILED_RECONCILIATION");
});

test("expectations bind: state contradictions and count minimums fail; per-sport isolation holds", () => {
  const wrongState = evaluateClass(CLS("epl-results"), { prior: M("2026-08-11T14:10:00Z", "aaa", { rows: 0 }, { state: "PRESEASON" }), current: M("2026-08-12T14:10:00Z", "bbb", { rows: 3 }, { state: "RESULTS", reconciliationExact: true }), expectation: { state: "PRESEASON", note: "no league play before Aug 21 — a RESULTS flip tomorrow would mean friendlies leaked in" } });
  assert.equal(wrongState.verdict, "FAILED_EXPECTATION");
  const out = verifyCadenceReceipts({
    run: RUN,
    manifests: {
      "nfl-schedule": { prior: M("2026-08-11T14:10:00Z", "a", { rows: 18 }), current: M("2026-08-12T14:10:00Z", "a", { rows: 18 }) },
      "nba-schedule": { prior: M("2026-08-11T14:10:00Z", "a", { rows: 58 }), current: M("2026-08-11T14:10:00Z", "a", { rows: 58 }) }, // never advanced → FAILED
    },
  });
  assert.equal(out.bySport.nba.allClean, false);
  assert.ok(out.bySport.nfl.receipts.some((r) => r.verdict === "NO_CHANGE_PROVEN"), "NFL's valid receipt survives NBA's failure — per-sport isolation");
  assert.equal(out.version, RECEIPT_VERIFIER_VERSION);
});

test("the evaluator is PURE: no network, no filesystem, no clock in the module source", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("./receipt-verifier.mjs", import.meta.url), "utf8");
  assert.ok(!/fetch\(|readFileSync|writeFileSync|Date\.now|new Date\(\)/.test(src), "inputs only — the invocation script gathers, this module judges");
});
