import { test } from "node:test";
import assert from "node:assert/strict";

import { buildGrowthOpsView, NOT_YET_MEASURED } from "./growth-ops.ts";

const DARK = { enabled: false, endpoint: null };

test("with the provider dark, every real-user metric is NOT YET MEASURED (never a fabricated zero)", () => {
  const v = buildGrowthOpsView({ today: "2026-07-24", latestSlate: "2026-07-24", nowUtcHour: 16, sinkConfig: DARK });
  for (const r of v.funnel) assert.equal(r.value, NOT_YET_MEASURED);
  for (const r of v.sourceMix) assert.equal(r.value, NOT_YET_MEASURED);
  assert.equal(v.sink.state, "disabled");
});

test("real counts populate ONLY when a live query path supplies them", () => {
  const v = buildGrowthOpsView({ today: "2026-07-24", latestSlate: "2026-07-24", nowUtcHour: 16, sinkConfig: { enabled: true, endpoint: "https://a/e" }, measuredCounts: { daily_hub_view: 42, "source:x": 7 } });
  assert.equal(v.funnel.find((r) => r.event === "daily_hub_view").value, 42);
  assert.equal(v.funnel.find((r) => r.event === "game_report_open").value, NOT_YET_MEASURED); // not supplied → still unmeasured
  assert.equal(v.sourceMix.find((r) => r.step === "x").value, 7);
  assert.equal(v.sink.state, "live");
});

test("sink state distinguishes disabled / misconfigured / live", () => {
  assert.equal(buildGrowthOpsView({ today: "2026-07-24", latestSlate: null, nowUtcHour: 16, sinkConfig: { enabled: false, endpoint: null } }).sink.state, "disabled");
  assert.equal(buildGrowthOpsView({ today: "2026-07-24", latestSlate: null, nowUtcHour: 16, sinkConfig: { enabled: false, endpoint: "https://a/e" } }).sink.state, "misconfigured");
  assert.equal(buildGrowthOpsView({ today: "2026-07-24", latestSlate: null, nowUtcHour: 16, sinkConfig: { enabled: true, endpoint: "https://a/e" } }).sink.state, "live");
});

test("health SURFACES a stale/failed daily-production incident (does not mask it)", () => {
  // July-24 today, latest slate July-23, and it is PAST the morning window (UTC hour ≥ 15 = ≥ 11 ET) → incident.
  const v = buildGrowthOpsView({ today: "2026-07-24", latestSlate: "2026-07-23", nowUtcHour: 15, sinkConfig: DARK });
  assert.equal(v.health.slateFreshness, "stale");
  assert.equal(v.health.daysBehind, 1);
  assert.match(v.health.incident, /late\/failed.*2026-07-23.*workflow_dispatch/);
});

test("health = generating within the morning window; fresh when same-day; ≥2 behind is always stale", () => {
  assert.equal(buildGrowthOpsView({ today: "2026-07-24", latestSlate: "2026-07-23", nowUtcHour: 13, sinkConfig: DARK }).health.slateFreshness, "generating");
  assert.equal(buildGrowthOpsView({ today: "2026-07-24", latestSlate: "2026-07-23", nowUtcHour: 13, sinkConfig: DARK }).health.incident, null);
  assert.equal(buildGrowthOpsView({ today: "2026-07-24", latestSlate: "2026-07-24", nowUtcHour: 13, sinkConfig: DARK }).health.slateFreshness, "fresh");
  assert.equal(buildGrowthOpsView({ today: "2026-07-24", latestSlate: "2026-07-22", nowUtcHour: 12, sinkConfig: DARK }).health.slateFreshness, "stale");
});
