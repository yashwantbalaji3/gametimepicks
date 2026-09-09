/**
 * P250 · A16 — the joint-sim evaluation receipt describes ITSELF exactly.
 *
 * The P249 receipt shipped with the pass-yds-repair artifact name and the champion engine at top
 * level while its challenger block identified the joint engine — two contradictory identities for
 * one file. These guards pin the corrected self-description, the recorded diagnostic gap (the
 * preregistered passing-TD calibration bins were never computed), and the reuse/proxy disclosures,
 * so an automated reader can trust the receipt's own words. Numbers are NOT pinned here — the
 * evaluation owns them; this file owns the metadata contract.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const receipt = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nfl/reports/joint-sim-evaluation.json"), "utf8"));

test("top-level identity matches the challenger block — one engine, one artifact name", () => {
  assert.equal(receipt.artifact, "nfl-joint-sim-identical-points-evaluation");
  assert.equal(receipt.engine.id, "nfl-joint-sim-v1", "the engine under evaluation IS the joint engine");
  assert.equal(receipt.engine.champion?.id, "nfl-player-props-v1-opportunity-efficiency", "the champion is named as the baseline, not as the subject");
  assert.equal(receipt.challenger.id, receipt.engine.id, "top level and challenger block agree");
  assert.ok(Array.isArray(receipt.metadataCorrections) && receipt.metadataCorrections.length > 0, "the correction carries its lineage");
  assert.ok(receipt.metadataCorrections[0].was?.artifact, "the prior identity is preserved, not erased");
});

test("missing preregistered diagnostics are RECORDED, not implied complete", () => {
  const tds = receipt.jointExtra?.player_pass_tds;
  assert.ok(tds, "passing-TD summary exists");
  assert.equal(tds.calibrationBins, null, "bins were not computed and the field says so");
  assert.match(String(tds.diagnosticGap ?? ""), /INCOMPLETE/, "the gap is stated in words");
});

test("reuse and proxy-line disclosures travel with the numbers", () => {
  assert.match(String(receipt.evaluationDataReuse ?? ""), /2025.*REUSED/i, "2025 reuse is disclosed");
  assert.match(String(receipt.evaluationDataReuse ?? ""), /PROXY/i, "threshold ECE's proxy lines are disclosed");
  assert.match(String(receipt.evaluationDataReuse ?? ""), /2026 forward/i, "the registered forward population is preserved");
  assert.match(String(receipt.receptionsEceClarification ?? ""), /0\.0059/, "the miss vs the bar (0.0059) is distinguished");
  assert.match(String(receipt.receptionsEceClarification ?? ""), /0\.0121/, "…from the deterioration vs the champion (0.0121)");
});

test("receiving yards records ELIGIBLE_NOT_ADOPTED — a decision, not a rejection", () => {
  const rec = receipt.promotion?.player_reception_yds;
  assert.equal(rec?.state, "PUBLIC_ELIGIBLE");
  assert.match(String(rec?.adoption ?? ""), /ELIGIBLE_NOT_ADOPTED/, "the deliberate non-adoption is typed");
});

test("the generator writes the exact identity itself (no future run can regress this)", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/evaluate-nfl-player-props.mjs"), "utf8");
  assert.match(src, /nfl-joint-sim-identical-points-evaluation/, "the joint artifact name is generator-owned");
  assert.match(src, /diagnosticGap/, "the collector records its own diagnostic gap");
});
