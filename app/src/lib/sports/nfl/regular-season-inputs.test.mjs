/**
 * Regular-season input-matrix guards (Program 197 · Release D).
 *
 * The claims: every declared input derives a TYPED state (absence is never health), the two
 * rights-blocked inputs stay BLOCKED_EXTERNAL by design, the readiness verdict separates
 * operational gaps (tickets) from design caps (facts), and the frozen evaluation contract is
 * committed with its bars intact BEFORE any challenger exists.
 *
 * Run: npx tsx --test src/lib/sports/nfl/regular-season-inputs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { REGULAR_SEASON_INPUTS, deriveInputMatrix, readinessVerdict, RS_INPUT_STATES } from "./regular-season-inputs.mjs";

const NOW = "2026-09-10T12:00:00Z";
const healthy = () => ({
  schedule: { present: true, stamp: "2026-09-10T11:00:00Z" },
  injuries: { present: true, stamp: "2026-09-10T09:00:00Z" },
  rosters: { present: true, stamp: "2026-09-08T09:00:00Z" },
  prices: { present: true, stamp: "2026-09-10T10:00:00Z" },
  teamStrength: { present: true },
  participationRoles: { present: true },
});

test("every declared input derives a typed state from the closed vocabulary", () => {
  const m = deriveInputMatrix({ artifacts: healthy(), nowIso: NOW });
  assert.equal(m.length, REGULAR_SEASON_INPUTS.length);
  for (const row of m) assert.ok(RS_INPUT_STATES.includes(row.state), `${row.id}: ${row.state}`);
});

test("the rights-blocked inputs are BLOCKED_EXTERNAL by design — never MISSING, never quietly available", () => {
  const m = deriveInputMatrix({ artifacts: healthy(), nowIso: NOW });
  assert.equal(m.find((r) => r.id === "activesInactives").state, "BLOCKED_EXTERNAL");
  assert.equal(m.find((r) => r.id === "depthCharts").state, "BLOCKED_EXTERNAL");
  assert.equal(m.find((r) => r.id === "weather").state, "UNSUPPORTED");
});

test("absence never implies health: a missing injuries feed types MISSING and drags qbStatus with it", () => {
  const arts = healthy();
  delete arts.injuries;
  const m = deriveInputMatrix({ artifacts: arts, nowIso: NOW });
  assert.equal(m.find((r) => r.id === "injuries").state, "MISSING");
  assert.equal(m.find((r) => r.id === "qbStatus").state, "MISSING", "a derivation of a missing input is missing, not derived");
});

test("staleness derives from the artifact's own stamp against the declared window", () => {
  const arts = healthy();
  arts.injuries = { present: true, stamp: "2026-09-07T09:00:00Z" }; // 75h old vs 48h window
  const m = deriveInputMatrix({ artifacts: arts, nowIso: NOW });
  assert.equal(m.find((r) => r.id === "injuries").state, "STALE");
  assert.equal(m.find((r) => r.id === "qbStatus").state, "STALE");
});

test("the verdict separates operational gaps (tickets) from design caps (facts)", () => {
  const ready = readinessVerdict(deriveInputMatrix({ artifacts: healthy(), nowIso: NOW }));
  assert.equal(ready.state, "READY_WITH_DESIGN_CAPS");
  assert.deepEqual(ready.operationalGaps, []);
  assert.ok(ready.designCaps.includes("activesInactives"));
  const arts = healthy(); delete arts.schedule;
  const gapped = readinessVerdict(deriveInputMatrix({ artifacts: arts, nowIso: NOW }));
  assert.equal(gapped.state, "OPERATIONAL_GAPS");
  assert.deepEqual(gapped.operationalGaps, ["schedule:MISSING"]);
});

test("the evaluation contract is FROZEN with its bars intact — a band, not a floor, and the stopping rule inherited", () => {
  const c = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/nfl/regular-season-evaluation-contract.json"), "utf8"));
  assert.equal(c.artifact, "nfl-regular-season-evaluation-contract");
  assert.match(c.bars.marginHead.requirement, /0\.75-0\.85/, "coverage bar is a BAND — interval-widening cannot pass it");
  assert.match(c.bars.winHead.hardStop, /STOP_AND_DEMOTE/, "the stopping rule is inherited verbatim");
  assert.match(c.cohortRule, /Rejected preseason candidates stay rejected/);
  assert.match(c.amendmentRule, /BEFORE the first regular-season fit/);
  assert.ok(c.evaluationMode.minimumSample >= 64, "no verdict on a favorable week");
});
