/**
 * Lineup-evidence contract guards (Program 163 · Release B).
 *
 * The rejection made executable: every non-official class refuses shadow eligibility with its
 * exact reason, post-start evidence can never become pre-event input, and injuries can never
 * satisfy lineups. The probe receipts behind these rules live in
 * docs/NBA_LINEUP_SOURCE_EVALUATION.md.
 *
 * Run: npx tsx --test src/lib/sports/lineups/contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { LINEUP_CONTRACT_VERSION, LINEUP_EVIDENCE_CLASSES, classifyLineupEvidence, lineupShadowEligibility } from "./contract.mjs";

test("closed vocabulary: six classes, version 1, absence is UNKNOWN", () => {
  assert.equal(LINEUP_CONTRACT_VERSION, 1);
  assert.equal(LINEUP_EVIDENCE_CLASSES.length, 6);
  assert.equal(classifyLineupEvidence(null).class, "UNKNOWN");
  assert.equal(classifyLineupEvidence({ kind: "something_new" }).class, "UNKNOWN");
});

test("injuries can NEVER satisfy lineups; rosters and projections are named non-official classes", () => {
  const inj = lineupShadowEligibility({ kind: "injury_report", sourceAsOf: "2026-10-03T20:00:00Z", scheduledStartUtc: "2026-10-03T23:00:00Z" });
  assert.equal(inj.eligible, false);
  assert.equal(inj.class, "INJURY_REPORT");
  assert.match(inj.reason, /injuries can never satisfy lineups/);
  assert.equal(lineupShadowEligibility({ kind: "roster" }).class, "ROSTER");
  assert.equal(lineupShadowEligibility({ kind: "depth_chart" }).class, "PROJECTED_LINEUP");
});

test("POST_START starters are settlement-grade and permanently shadow-ineligible", () => {
  const post = lineupShadowEligibility({ kind: "boxscore_starters", sourceAsOf: "2026-10-03T23:12:00Z", scheduledStartUtc: "2026-10-03T23:00:00Z" });
  assert.equal(post.eligible, false);
  assert.equal(post.class, "POST_START_STARTERS");
  assert.match(post.reason, /tip-off/);
});

test("only an explicitly labeled official lineup with provably pre-start timestamps is eligible", () => {
  const base = { kind: "official_lineup", officialLabel: true, sourceAsOf: "2026-10-03T22:30:00Z", scheduledStartUtc: "2026-10-03T23:00:00Z" };
  assert.equal(lineupShadowEligibility(base).eligible, true);
  assert.equal(lineupShadowEligibility({ ...base, officialLabel: false }).eligible, false, "an unlabeled official claim is UNKNOWN");
  assert.equal(lineupShadowEligibility({ ...base, sourceAsOf: "2026-10-03T23:00:00Z" }).eligible, false, "asOf == start is not before start");
  assert.equal(lineupShadowEligibility({ ...base, sourceAsOf: null }).eligible, false, "temporal evidence is mandatory");
  const late = lineupShadowEligibility({ ...base, sourceAsOf: "2026-10-03T23:05:00Z" });
  assert.equal(late.eligible, false);
  assert.match(late.reason, /post-start evidence never feeds a pre-event artifact/);
});
