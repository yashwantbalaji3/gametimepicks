/**
 * Regression: a LATE (post-first-pitch, ineligible) pitcher_workload capture must NOT hide/destroy an earlier
 * ELIGIBLE one. Multi-cadence files coexist; latestEligibleWorkload picks the latest researchEligible record.
 * This is the exact failure that made pitcher_workload 0% (old single-file overwrite). No modeling.
 *
 * Run: npx tsx --test src/lib/mlb-pitcher-workload-cadence.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { latestEligibleWorkload } from "../../scripts/build-mlb-research-observations.mjs";

function tmpFeat(date, gamePk, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-"));
  const dir = path.join(root, "pitcher-workload", date);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, obj] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), JSON.stringify(obj));
  return root;
}

test("1 · a late ineligible capture does NOT hide an earlier eligible one", () => {
  const feat = tmpFeat("2026-07-22", 999, {
    "999-2026-07-22T15-00-00-000Z.json": { researchEligible: true, pitchers: { home: { id: 1 } }, capturedAt: "2026-07-22T15:00:00Z" },
    "999-2026-07-22T20-07-00-000Z.json": { researchEligible: false, pitchers: { home: { id: 2 } }, capturedAt: "2026-07-22T20:07:00Z" },
  });
  const r = latestEligibleWorkload(feat, "2026-07-22", 999);
  assert.ok(r, "returns an eligible record despite a later ineligible one");
  assert.equal(r.researchEligible, true);
  assert.equal(r.pitchers.home.id, 1, "the earlier ELIGIBLE capture is chosen, not the late ineligible one");
});

test("2 · picks the FRESHEST eligible when several eligible captures exist", () => {
  const feat = tmpFeat("2026-07-22", 999, {
    "999-2026-07-22T11-00-00-000Z.json": { researchEligible: true, pitchers: { home: { id: 1 } } },
    "999-2026-07-22T15-00-00-000Z.json": { researchEligible: true, pitchers: { home: { id: 3 } } },
  });
  assert.equal(latestEligibleWorkload(feat, "2026-07-22", 999).pitchers.home.id, 3, "latest eligible wins");
});

test("3 · returns null when every capture is ineligible (never fabricates)", () => {
  const feat = tmpFeat("2026-07-22", 999, {
    "999-2026-07-22T20-07-00-000Z.json": { researchEligible: false, pitchers: {} },
  });
  assert.equal(latestEligibleWorkload(feat, "2026-07-22", 999), null);
});

test("4 · legacy single-file <gamePk>.json is still read (backward compatible)", () => {
  const feat = tmpFeat("2026-07-22", 999, { "999.json": { researchEligible: true, pitchers: { home: { id: 7 } } } });
  assert.equal(latestEligibleWorkload(feat, "2026-07-22", 999).pitchers.home.id, 7);
});
