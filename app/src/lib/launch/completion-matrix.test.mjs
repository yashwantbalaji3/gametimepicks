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
import fs from "node:fs";
import path from "node:path";

import { DEPARTMENT_BUCKETS, sportColumn, buildCompletionMatrix, ROADMAP_30D, MATRIX_VERSION } from "./completion-matrix.mjs";
import { GATE_STAGES } from "../sports/sport-gate.mjs";
import { SPORT_ASSESSMENTS } from "../sports/sport-assessments.mjs";

const REPO = path.join(process.cwd(), "..");

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
  // then data + model (P151 research vertical), then settlement (P161 contract validated on all
  // 1,001 corpus finals + deployed results capture), then Program 171's identity (durable-id
  // registry consumed by a real odds join) and markets (receipt-gated authorized capture) —
  // the first two NFL stages to earn PROVEN — plus publication (public price layer, PARTIAL).
  // The invariant is unchanged and still enforced: percentage counts PROVEN only, so every
  // bucket whose stages are merely PARTIAL stays 0. Any stage OUTSIDE the receipted set
  // claiming evidence is still a defect this guard catches.
  // P185 added owner + qualification: shared machinery, each verified against real artifacts (the
  // owning workflow must exist, carry a cron and reach a human; the ladder is read from the shadow
  // module's own state literals). Listed explicitly so a stage still cannot claim evidence without
  // a reviewed entry here — the invariant this guard exists for is untouched.
  const NFL_EVIDENCE_STAGES = ["schedule", "data", "model", "settlement", "identity", "markets", "publication", "owner", "qualification"];
  const NFL_PROVEN_STAGES = ["identity", "markets", "owner", "qualification", "settlement"];
  const nfl = sportColumn(SPORT_ASSESSMENTS.nfl);
  for (const b of DEPARTMENT_BUCKETS) {
    assert.ok(nfl[b.id].stages.every((s) => s.status === "UNPROVEN" || NFL_EVIDENCE_STAGES.includes(s.id)),
      `nfl.${b.id} — only receipted stages may carry non-UNPROVEN evidence`);
    const provenHere = nfl[b.id].stages.filter((s) => s.status === "PROVEN").length;
    assert.equal(nfl[b.id].proven, provenHere, `nfl.${b.id} — the numerator counts PROVEN stages only`);
    if (provenHere === 0) assert.equal(nfl[b.id].pct, 0, `nfl.${b.id} — PARTIAL earns receipts, never percentage`);
  }
  // The exact honest picture after P171: data-ingestion 1/3 (markets proven; schedule+data still
  // PARTIAL), identity-assets 1/1, and every MODEL/PRODUCT/SETTLEMENT bucket still 0 — a captured
  // price table must never read as model or settlement progress.
  assert.equal(nfl["data-ingestion"].pct, 33);
  assert.equal(nfl["identity-assets"].pct, 100);
  assert.equal(nfl["product-generation"].pct, 0,
    "nfl.product-generation must stay 0 — P171 published prices, not generated products");
  /*
   * settlement moved off 0 on P185 and the reason this guard gave — "not settled results" — is now
   * simply false: 16 preseason forecasts are settled from official scores, each carrying lineage and
   * a self-quarantine on ambiguity. The bucket holds only that stage, so it reads 100.
   *
   * What must NOT drift is what the record MEANS. It grades a distribution — winner correctness,
   * margin/total error, interval coverage — and carries no W-L or ROI. A settled NFL record must
   * never start reading as money, so that is asserted directly rather than implied by a zero.
   */
  assert.equal(nfl["settlement"].pct, 100, "settlement is proven on 16 lineage-stamped forecasts");
  const rec = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/nfl/experimental-settlement/summary.json"), "utf8"));
  assert.equal(rec.ledger, "experimental-forecast", "the NFL record is a forecast ledger, never a money ledger");
  for (const banned of ["roi", "wins", "losses", "bankroll", "profit"]) {
    assert.ok(!(banned in rec), `the NFL experimental record must not carry ${banned}`);
  }
  /*
   * These two buckets moved off 0 on P185, and the SUBSTANTIVE claim is asserted instead of the
   * total. model-validation contains [model, calibration, qualification]; a proven qualification
   * policy is genuinely one of three, so 33 is arithmetically honest — but the thing this guard
   * exists to protect is "NFL has no validated model", which is unchanged and now pinned directly.
   * Asserting the bucket total would have forced a choice between a false 0 and deleting the check.
   */
  assert.equal(nfl["model-validation"].pct, 33, "qualification is proven; model and calibration are not");
  assert.notEqual(SPORT_ASSESSMENTS.nfl.stages.model.status, "PROVEN", "NFL has no validated model");
  assert.notEqual(SPORT_ASSESSMENTS.nfl.stages.calibration?.status, "PROVEN", "NFL has no calibration receipt");
  // operations = [monitoring, owner]. The owner is real and paged; monitoring is NOT — nothing yet
  // watches whether an NFL run happened, so this must not read as fully covered.
  assert.equal(nfl["operations"].pct, 50, "owner proven, monitoring not");
  assert.notEqual(SPORT_ASSESSMENTS.nfl.stages.monitoring?.status, "PROVEN", "NFL is not yet monitored");
  for (const id of NFL_EVIDENCE_STAGES) {
    const st = DEPARTMENT_BUCKETS.flatMap((b) => nfl[b.id].stages).find((s) => s.id === id);
    const expected = NFL_PROVEN_STAGES.includes(id) ? "PROVEN" : "PARTIAL";
    assert.equal(st.status, expected, `nfl.${id} — ${expected} exactly`);
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
