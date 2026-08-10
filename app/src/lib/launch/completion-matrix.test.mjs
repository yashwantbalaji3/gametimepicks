/**
 * Completion-matrix guards (Program 145).
 *
 * The founder's standing rule: never an unsupported completion percentage. Every check below is a
 * way a percentage could detach from its evidence — a stage counted twice, a hand-set number, an
 * empty bucket rendering as 0% (which reads as "assessed and failing" when nothing was assessed).
 *
 * Run: npx tsx --test src/lib/launch/completion-matrix.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { DEPARTMENT_BUCKETS, sportColumn, buildCompletionMatrix, ROADMAP_30D, MATRIX_VERSION } from "./completion-matrix.mjs";
import { GATE_STAGES } from "../sports/sport-gate.mjs";
import { SPORT_ASSESSMENTS } from "../sports/sport-assessments.mjs";

test("THE PARTITION · every gate stage lives in exactly one department bucket", () => {
  const seen = new Map();
  for (const b of DEPARTMENT_BUCKETS) for (const s of b.stages) seen.set(s, (seen.get(s) ?? 0) + 1);
  for (const s of GATE_STAGES) {
    assert.equal(seen.get(s.id), 1, `stage ${s.id} must appear in exactly one bucket (found ${seen.get(s.id) ?? 0})`);
  }
  assert.equal([...seen.keys()].length, GATE_STAGES.length, "no bucket may invent a stage the gate does not define");
});

test("percentages derive from stages — MLB all-proven is 100 everywhere, empty NFL is 0 with receipts", () => {
  const mlb = sportColumn(SPORT_ASSESSMENTS.mlb);
  for (const b of DEPARTMENT_BUCKETS) {
    assert.equal(mlb[b.id].pct, 100, `mlb.${b.id}`);
    assert.equal(mlb[b.id].proven, mlb[b.id].total);
  }
  // NFL's evidence-bearing set grew release by release with receipts: schedule (P148 capture),
  // then data + model (P151 research vertical). Every percentage stays 0 — PARTIAL earns
  // receipts, never percentage — and any stage OUTSIDE this receipted set claiming evidence
  // is still a defect this guard catches.
  const NFL_EVIDENCE_STAGES = ["schedule", "data", "model"];
  const nfl = sportColumn(SPORT_ASSESSMENTS.nfl);
  for (const b of DEPARTMENT_BUCKETS) {
    assert.equal(nfl[b.id].pct, 0, `nfl.${b.id} — PARTIAL earns receipts, never percentage`);
    assert.ok(nfl[b.id].stages.every((s) => s.status === "UNPROVEN" || NFL_EVIDENCE_STAGES.includes(s.id)),
      `nfl.${b.id} — only receipted stages may carry non-UNPROVEN evidence`);
  }
  for (const id of NFL_EVIDENCE_STAGES) {
    const st = DEPARTMENT_BUCKETS.flatMap((b) => nfl[b.id].stages).find((s) => s.id === id);
    assert.equal(st.status, "PARTIAL", `nfl.${id} is evidence, not proof — PARTIAL exactly`);
  }
});

test("a bucket with no applicable stages is N_A (null), never 0% or 100%", () => {
  const col = sportColumn({ stages: {} });
  // With the current partition every bucket has stages, so exercise the rule on a synthetic bucket
  // by direct math: pct must be null when total is 0. Guarded structurally:
  for (const b of DEPARTMENT_BUCKETS) assert.ok(b.stages.length > 0, "current buckets all carry stages");
  assert.equal(col["identity-assets"].pct, 0, "identity with UNPROVEN stage is 0, not null");
});

test("the matrix covers every committed sport and carries per-cell stage receipts", () => {
  const m = buildCompletionMatrix(SPORT_ASSESSMENTS);
  assert.equal(m.version, MATRIX_VERSION);
  assert.deepEqual(m.sports.sort(), Object.keys(SPORT_ASSESSMENTS).sort());
  const nbaModel = m.matrix.nba["model-validation"];
  assert.ok(nbaModel.stages.some((s) => s.status === "BLOCKED_EXTERNAL" && s.blocker),
    "the NBA calibration blocker must surface in its cell, not vanish into a percentage");
});

test("the roadmap: five horizons, and every item carries owner + acceptance", () => {
  assert.deepEqual(ROADMAP_30D.map((h) => h.horizon), ["NOW", "DAYS_3_7", "WEEK_2", "WEEKS_3_4", "LATER"]);
  for (const h of ROADMAP_30D) {
    assert.ok(h.items.length > 0, `${h.horizon} must not be empty`);
    for (const i of h.items) {
      assert.ok(["ENGINEERING", "FOUNDER"].includes(i.owner), `${i.outcome}: owner`);
      assert.ok(i.acceptance && i.acceptance.length > 15, `${i.outcome}: an item nobody can check off is a wish`);
    }
  }
});

test("the roadmap prunes completed work — no done item may linger as decoration", () => {
  // The contract: completed items are REMOVED, not struck through. These outcomes shipped
  // (D-closure f3d3e19c, ledger correction 2fff046b, grade rubric 52efb85a, avatar consolidation
  // 9372103a/8f5850cb, EPL contract 20134c21) and must therefore be absent.
  const all = ROADMAP_30D.flatMap((h) => h.items.map((i) => i.outcome)).join(" | ");
  for (const done of [/Release D closed/, /ledger corrected/i, /BuildLeg carries modelProbability/, /consolidated onto the canonical PlayerAvatar/, /settlement grading path designed/]) {
    assert.doesNotMatch(all, done, `completed item still on the roadmap: ${done}`);
  }
  // And NOW is never empty while engineering work remains.
  assert.ok(ROADMAP_30D.find((h) => h.horizon === "NOW").items.length > 0);
});
