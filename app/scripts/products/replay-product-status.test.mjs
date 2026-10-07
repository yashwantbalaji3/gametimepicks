/**
 * Stage 4A pinned replay: the founder-decided contract (schema 1) agrees with today's leg floor (engine-v2 leg-floor@2)
 * on every committed universe receipt, Oct 2–6, 2026. Fixed window and a scorecard fixture, so neither the nightly
 * scorecard rewrite nor new universe days can move it. Any slice that changes the diff count must stop here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { replayProductStatus } from "./replay-product-status.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(fs.readFileSync(path.join(HERE, "__fixtures__/model-health-asof-2026-10-02..06.json"), "utf8"));
const DATES = ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"];

test("4A is behaviour-neutral: zero verdict differences from leg-floor@2 over the pinned window", () => {
  const report = replayProductStatus({ dates: DATES, healthAsOf: (asOf) => FIXTURE.byAsOf[asOf] ?? null });
  assert.deepEqual(report.map((r) => r.date), DATES);
  for (const r of report) {
    assert.ok(r.healthAt, `${r.date}: a scorecard as of the day was used`);
    assert.deepEqual(r.diffs, {}, `${r.date}: no verdict differences`);
    assert.equal(r.contractEligible, r.v2Eligible, r.date);
    assert.equal(r.v2Eligible, r.committedEligible, `${r.date}: the rebuild matches the committed universe`);
  }
  assert.equal(report.reduce((n, r) => n + r.receipts, 0), 1250);
  assert.equal(report.reduce((n, r) => n + r.contractEligible, 0), 60);
});
