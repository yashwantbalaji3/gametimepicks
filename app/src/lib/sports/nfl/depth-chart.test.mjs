/**
 * THE POINT-IN-TIME DEPTH-CHART CONSUMER (§12.1) — shadow only, and the measurement that matters.
 *
 * 🔴 THE MEASUREMENT, taken on the committed artifact against tomorrow's real slate (2026-09-27,
 * 28 team-board questions across fourteen games):
 *
 *     bound  3 days    RESOLVED  0/28      STALE 28
 *     bound  7 days    RESOLVED  0/28      STALE 28
 *     bound 14 days    RESOLVED  0/28      STALE 28
 *     bound 30 days    RESOLVED 28/28      — and 30 days is not a bound on a weekly role
 *
 *     snapshot age: min 18.3 · median 18.3 · max 18.3 days
 *
 * The handoff's recommendation was "publish one starter per pool after Sunday, from the depth-chart
 * source already committed". That source cannot answer a single question about tomorrow's slate
 * under any defensible freshness bound. `acquire-depth-chart-research.mjs` is in NO workflow and the
 * artifact has exactly ONE commit in the repository's history. The prerequisite is a refresh job,
 * not a publishing decision.
 *
 * Run: cd app && npx tsx --test src/lib/sports/nfl/depth-chart.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { indexDepthCharts, depthChartAsOf, depthChartCoverage, DEPTH_STATE } from "./depth-chart.mjs";

const DAY = 86400000;
const art = {
  snapshots: [
    { timestamp: "2026-03-31T08:05:34Z", team: "CLE",
      quarterbacks: [{ playerId: "4432762", name: "Shedeur Sanders", rank: 1 },
                     { playerId: "3122840", name: "Deshaun Watson", rank: 2 }] },
    { timestamp: "2026-09-08T11:56:57Z", team: "CLE",
      quarterbacks: [{ playerId: "3122840", name: "Deshaun Watson", rank: 1 },
                     { playerId: "4432762", name: "Shedeur Sanders", rank: 2 },
                     { playerId: "4427238", name: "Dillon Gabriel", rank: 3 }] },
    { timestamp: "2026-09-08T11:56:57Z", team: "ARI", quarterbacks: [] },
    { timestamp: "2026-09-08T11:56:57Z", team: "BAL",
      quarterbacks: [{ playerId: "3916387", name: "Lamar Jackson", rank: 1 }] },
    { timestamp: "bad", team: "NYJ", quarterbacks: [] },
    { timestamp: "2026-09-08T11:56:57Z", quarterbacks: [] },
  ],
};
const idx = indexDepthCharts(art);

test("rows without a team or a parseable timestamp are dropped and COUNTED, never silently kept", () => {
  assert.equal(idx.dropped, 2);
  assert.deepEqual(idx.teams, ["ARI", "BAL", "CLE"]);
});

test("🔴 §12 · a snapshot from AFTER the instant is unreachable through any argument", () => {
  /*
   * The whole claim §12 makes for this source is that a forward capture is point-in-time by
   * construction. That is only true if the reader enforces it — and it is the leakage guard the
   * rejected historical QB study did not have.
   */
  const early = depthChartAsOf(idx, "CLE", "2026-04-01T00:00:00Z", 365 * DAY);
  assert.equal(early.snapshotAt, "2026-03-31T08:05:34Z");
  assert.equal(early.starter.name, "Shedeur Sanders");

  const later = depthChartAsOf(idx, "CLE", "2026-09-26T00:00:00Z", 365 * DAY);
  assert.equal(later.snapshotAt, "2026-09-08T11:56:57Z");
  assert.equal(later.starter.name, "Deshaun Watson");

  // Before ANY snapshot there is no answer — not the earliest one.
  assert.equal(depthChartAsOf(idx, "CLE", "2026-01-01T00:00:00Z", 365 * DAY).state, DEPTH_STATE.NO_SNAPSHOT);
  // And no bound, however generous, can reach forward.
  for (const bound of [1 * DAY, 365 * DAY, Number.MAX_SAFE_INTEGER]) {
    assert.equal(depthChartAsOf(idx, "CLE", "2026-04-01T00:00:00Z", bound).snapshotAt, "2026-03-31T08:05:34Z");
  }
});

test("🔴 the staleness bound is REQUIRED — a default is where an 18-day-old answer gets returned", () => {
  assert.throws(() => depthChartAsOf(idx, "CLE", "2026-09-26T00:00:00Z"), /maxAgeMs is required/);
  assert.throws(() => depthChartAsOf(idx, "CLE", "2026-09-26T00:00:00Z", null), /maxAgeMs is required/);
  assert.throws(() => depthChartAsOf(idx, "CLE", "2026-09-26T00:00:00Z", NaN), /maxAgeMs is required/);
});

test("🔴 a stale snapshot yields NO STARTER, and keeps the order so the staleness stays measurable", () => {
  const r = depthChartAsOf(idx, "CLE", "2026-09-26T00:00:00Z", 14 * DAY);
  assert.equal(r.state, DEPTH_STATE.STALE);
  assert.equal(r.starter, null, "a stale chart may not name a current starter");
  assert.deepEqual(r.backups, []);
  assert.equal(r.order.length, 3, "losing the evidence is how this went unnoticed for eighteen days");
  assert.ok(r.ageMs > 17 * DAY && r.ageMs < 19 * DAY);
});

test("inside the bound a starter resolves, and the backups keep their order", () => {
  const r = depthChartAsOf(idx, "CLE", "2026-09-10T00:00:00Z", 7 * DAY);
  assert.equal(r.state, DEPTH_STATE.RESOLVED);
  assert.equal(r.starter.name, "Deshaun Watson");
  assert.deepEqual(r.backups.map((b) => b.name), ["Shedeur Sanders", "Dillon Gabriel"]);
});

test("a snapshot with no usable ranking is NO_ORDER, not a starter of one", () => {
  const r = depthChartAsOf(idx, "ARI", "2026-09-10T00:00:00Z", 7 * DAY);
  assert.equal(r.state, DEPTH_STATE.NO_ORDER);
  assert.equal(r.starter, null);
});

test("an unranked or id-less quarterback cannot become the starter by being first in the array", () => {
  const messy = indexDepthCharts({ snapshots: [{ timestamp: "2026-09-08T00:00:00Z", team: "X",
    quarterbacks: [{ name: "No Id", rank: 1 }, { playerId: "9", name: "Unranked" },
                   { playerId: "7", name: "Real Starter", rank: 2 }] }] });
  const r = depthChartAsOf(messy, "X", "2026-09-09T00:00:00Z", 7 * DAY);
  assert.equal(r.starter.name, "Real Starter", "identity and a rank are both required to hold a role");
});

test("🔴 the founder-gate measurement · the committed artifact answers NOTHING about a Week-4 slate", () => {
  /* The shape of the real result, reproduced on the fixture: every snapshot is one age, and the
     only bound that resolves is one no weekly role could justify. */
  const qs = [{ team: "CLE", asOf: "2026-09-26T16:50:00Z" }, { team: "BAL", asOf: "2026-09-26T16:50:00Z" }];
  for (const days of [3, 7, 14]) {
    const c = depthChartCoverage(idx, qs, days * DAY);
    assert.equal(c.counts[DEPTH_STATE.RESOLVED] ?? 0, 0, `${days}-day bound must resolve nothing`);
    assert.equal(c.counts[DEPTH_STATE.STALE], 2);
  }
  const loose = depthChartCoverage(idx, qs, 30 * DAY);
  assert.equal(loose.counts[DEPTH_STATE.RESOLVED], 2, "only a bound that is not a bound resolves it");
  assert.ok(loose.ageDays.median > 17, `median age ${loose.ageDays.median} days`);
});

test("this module is SHADOW — it never writes, never fetches, and no producer imports it", () => {
  /* §12: do not mutate tomorrow's frozen public baseline to advance this work. Kept by absence. */
  const src = readSelf();
  assert.equal(/writeFileSync|fetch\(/.test(src), false);
});

function readSelf() {
  return require_("src/lib/sports/nfl/depth-chart.mjs");
}
function require_(rel) {
  return require("node:fs").readFileSync(require("node:path").join(process.cwd(), rel), "utf8");
}
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
