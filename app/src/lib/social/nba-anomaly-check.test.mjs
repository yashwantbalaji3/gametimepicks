import assert from "node:assert/strict";
import { test } from "node:test";

import { ANOMALY_MARKETS, VERDICT, anomaliesFor, laneHistory, laneRows, reviewThresholds, runAnomalyCheck } from "./nba-anomaly-check.mjs";
import { socialPackageViolations } from "./social-package.mjs";
import { loadAnomalyInputs, prepareGameDay } from "../../../scripts/social/render-social-pack.mjs";

const flat = { rule: "t", byMarket: Object.fromEntries(ANOMALY_MARKETS.map((m) => [m, { n: 100, review: 8, typical: 4 }])) };
const row = (o) => ({ playerId: "1", name: "A", team: "BOS", eventId: "9", market: "pts", expectedMinutes: 30, median: 20, ...o });
const hist = (o) => new Map([["1", { games: 5, minutes: 30, starterShare: 1, totals: { pts: 20, reb: 5, ast: 5, threePm: 2 }, ...o }]]);
const run = (o) => runAnomalyCheck({ rows: [row(o.row)], thresholds: flat, history: o.history ?? hist(), lines: o.lines ?? null, windowStarterRate: o.starter ?? new Map() });

test("thresholds are recomputed from graded rows and keep only qualifying ones", () => {
  const g = (family, actual, extra = {}) => ({ state: "GRADED", family, measurement: { actual, minutes: 30 }, frozen: { median: 0, expectedMinutes: 30 }, ...extra });
  const rows = ANOMALY_MARKETS.flatMap((m) => Array.from({ length: 10 }, (_, i) => g(m, i + 1)));
  rows.push({ ...g("pts", 500), state: "NO_MEASUREMENT" }, { ...g("pts", 500), frozen: { median: 0, expectedMinutes: 10 } }, { ...g("pts", 500), measurement: { actual: 500, minutes: 0 } });
  const t = reviewThresholds(rows);
  assert.equal(t.byMarket.pts.n, 10);
  assert.equal(t.byMarket.pts.review, 9);
  assert.equal(t.byMarket.pts.typical, 6);
  assert.throws(() => reviewThresholds([]));
});
test("a quiet row passes, with or without a line", () => {
  assert.equal(run({}).anomalyCheck, "PASS");
  assert.equal(run({ lines: [{ playerId: "1", market: "pts", line: 22.5 }] }).anomalies.length, 0);
});
test("model-only: the player's own history triggers the check and the cause is named", () => {
  const minutes = run({ row: { median: 10, expectedMinutes: 15 } });
  assert.equal(minutes.anomalyCheck, "REVIEW");
  assert.equal(minutes.anomalies[0].verdict, VERDICT.INCORRECT_MINUTES);
  assert.equal(run({ row: { median: 10 } }).anomalies[0].verdict, VERDICT.MODEL_DEFECT);
  assert.equal(run({ row: { median: 10 }, starter: new Map([["1", 0]]) }).anomalies[0].verdict, VERDICT.STALE_PLAYER_ROSTER);
});
test("real line: every verdict path, and no line or price in any detail", () => {
  const L = (line, o = {}) => [{ playerId: "1", market: "pts", line, ...o }];
  const cases = [
    [run({ lines: L(31.5, { team: "NY" }) }), VERDICT.BAD_JOIN],
    [run({ lines: [{ playerId: "2", market: "pts", line: 31.5 }] }), VERDICT.BAD_JOIN],
    [run({ lines: L(20.5, { spread: 9 }) }), VERDICT.SPORTSBOOK_MISMATCH],
    [run({ lines: L(31.5) }), VERDICT.LEGITIMATE_LARGE_DISAGREEMENT],
    [run({ row: { median: 10, expectedMinutes: 15 }, lines: L(10.5) }), VERDICT.GENUINE_EXPECTATION],
    [run({ history: new Map(), lines: L(31.5) }), VERDICT.LEGITIMATE_LARGE_DISAGREEMENT],
  ];
  for (const [r, v] of cases) {
    assert.equal(r.anomalies[0].verdict, v);
    assert.ok(!/31\.5|10\.5|20\.5/.test(r.anomalies[0].detail), r.anomalies[0].detail);
  }
  assert.equal(cases[4][0].anomalyCheck, "PASS");
});
test("history joins lanes to boxes, skips DNPs and counts a game once", () => {
  const lane = { games: [{ providerEventId: "9", players: { away: [{ providerAthleteId: "1" }, { providerAthleteId: "2" }], home: [] } }] };
  const box = { status: "STATUS_FINAL", players: [{ providerAthleteId: "1", minutes: 30, starter: true, pts: 10, reb: 1, ast: 2, threePm: 0 }, { providerAthleteId: "2", didNotPlay: true }] };
  const h = laneHistory([lane, lane], new Map([["9", box]]));
  assert.equal(h.get("1").games, 1);
  assert.equal(h.has("2"), false);
  assert.equal(laneHistory([lane], new Map([["9", { ...box, status: "STATUS_IN_PROGRESS" }]])).size, 0);
});
test("a package may not print a line or a price in an anomaly", () => {
  const base = { anomalyCheck: "REVIEW", anomalies: [{ playerId: "1", market: "pts", verdict: "MODEL_DEFECT", detail: "line 27.5 at -110" }] };
  assert.ok(socialPackageViolations(base).some((v) => /may not print/.test(v)));
});
test("committed 10-30 slate: stat and Top 5 packages carry the check; the known cases are flagged", () => {
  const inputs = loadAnomalyInputs("2026-10-30");
  assert.ok(inputs.thresholds.byMarket.pts.n > 500);
  const { posts } = prepareGameDay({ date: "2026-10-30", asOf: "2026-10-30T18:00:00Z", anomalyInputs: inputs });
  const carrying = posts.filter((p) => /STATS|TOP5/.test(p.contentType));
  assert.equal(carrying.length, 13);
  for (const p of carrying) assert.ok(["PASS", "REVIEW"].includes(p.anomalyCheck));
  assert.ok(posts.filter((p) => /WINNER|TONIGHT/.test(p.contentType)).every((p) => p.anomalyCheck === undefined));
  const lane = { games: [] };
  assert.equal(laneRows(lane).length, 0);
  const pts = (id) => posts.flatMap((p) => p.anomalies ?? []).filter((a) => a.playerId === id && a.market === "pts");
  for (const id of ["4065648", "3945274"]) assert.equal(pts(id)[0].verdict, VERDICT.INCORRECT_MINUTES);
  assert.ok(anomaliesFor({ anomalies: [] }, [], ["pts"]).anomalyCheck === "PASS");
});
