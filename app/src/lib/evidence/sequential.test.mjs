/**
 * E-1 — the sequential evidence evaluator. Report-only. These tests pin the properties §15 asks for: looking every
 * night does not inflate false verdicts, a correlated slate counts as one block, a backtest alone never promotes,
 * baselines are point-in-time, and pending / void / withdrawn are never scored.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clusterBySlate, confidenceSequence, confidencePath, discountedPrior, calibrationFit, evidenceVerdict, marketBadge, FLOORS,
} from "./sequential.mjs";
import { pairedDifferences, exclusionReason, marketDiff, slateOf, FAMILY_BASELINES, WARMUP_EVENTS } from "./baselines.mjs";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const day = (k) => new Date(Date.UTC(2026, 3, 1 + k)).toISOString().slice(0, 10);
const normal = (rand) => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());

test("clusters: one block per slate, in slate order; missing is dropped, not zero", () => {
  const c = clusterBySlate([{ slate: "2026-04-02", d: 1 }, { slate: "2026-04-01", d: -1 }, { slate: "2026-04-02", d: 2 }, { slate: "2026-04-01", d: null }]);
  assert.deepEqual(c, [{ slate: "2026-04-01", n: 1, sum: -1, sumSq: 1 }, { slate: "2026-04-02", n: 2, sum: 3, sumSq: 5 }]);
});

test("no bound before three slates: a point estimate only", () => {
  const cs = confidenceSequence([{ slate: "a", n: 15, sum: -3 }, { slate: "b", n: 15, sum: -3 }]);
  assert.equal(cs.meanDiff, -0.2);
  assert.equal(cs.lower, null);
  assert.equal(cs.upper, null);
});

function nullCrossings({ dayEffectSd, seed }) {
  const rand = mulberry32(seed);
  const sims = 300;
  let csCrossed = 0;
  let naiveCrossed = 0;
  for (let s = 0; s < sims; s += 1) {
    const clusters = [];
    let cs = false;
    let naive = false;
    for (let k = 0; k < 60; k += 1) {
      const n = 4 + Math.floor(rand() * 10);
      const dayEffect = normal(rand) * dayEffectSd;
      const items = Array.from({ length: n }, () => ({ slate: day(k), d: dayEffect + normal(rand) * 0.3 }));
      clusters.push(clusterBySlate(items)[0]);
      const b = confidenceSequence(clusters);
      if (b.lower != null && (b.lower > 0 || b.upper < 0)) cs = true;
      if (k >= 2) {
        const N = clusters.reduce((a, c) => a + c.n, 0);
        const mu = clusters.reduce((a, c) => a + c.sum, 0) / N;
        const V = clusters.reduce((a, c) => a + (c.sum - c.n * mu) ** 2, 0);
        if (Math.abs(mu) > (1.96 * Math.sqrt(V)) / N) naive = true;
      }
    }
    if (cs) csCrossed += 1;
    if (naive) naiveCrossed += 1;
  }
  return { sims, csCrossed, naiveCrossed };
}

test("looking every night: under no true difference the always-valid bound rarely ever excludes 0, a peeked fixed-n interval often does", () => {
  for (const [dayEffectSd, seed] of [[0, 7], [0.15, 8]]) {
    const { sims, csCrossed, naiveCrossed } = nullCrossings({ dayEffectSd, seed });
    assert.ok(csCrossed / sims <= 0.05, `day effect ${dayEffectSd}: always-valid bound crossed in ${csCrossed}/${sims} null paths`);
    assert.ok(naiveCrossed > csCrossed * 3, `day effect ${dayEffectSd}: peeking at a fixed interval should cross far more (${naiveCrossed} vs ${csCrossed})`);
  }
});

test("a real difference is found: a model 0.05 better per event is called BETTER once the evidence is there", () => {
  const rand = mulberry32(11);
  const clusters = [];
  for (let k = 0; k < 40; k += 1) {
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += -0.05 + normal(rand) * 0.2;
    clusters.push({ slate: day(k), n: 12, sum });
  }
  const cs = confidenceSequence(clusters);
  assert.ok(cs.upper < 0, `upper ${cs.upper}`);
  const path = confidencePath(clusters);
  assert.equal(path.length, 40);
  assert.equal(path[0].lower, null);
  assert.equal(path[1].lower, null);
  assert.notEqual(path[2].lower, null);
});

test("a correlated slate counts as one block: 15 wins that all moved together are not 15 independent wins", () => {
  // Same per-event values; in A each day is internally identical (fully correlated), in B the days are mixed.
  const vals = [-0.4, 0.3, -0.2, 0.35, -0.3, 0.25];
  const A = vals.map((v, k) => ({ slate: day(k), n: 15, sum: 15 * v }));
  const mixed = [];
  for (let k = 0; k < 6; k += 1) for (let i = 0; i < 15; i += 1) mixed.push({ slate: day(k), d: vals[(k + i) % 6] });
  const B = clusterBySlate(mixed);
  const a = confidenceSequence(A);
  const b = confidenceSequence(B);
  assert.equal(a.n, b.n);
  assert.ok(a.halfWidth > 3 * b.halfWidth, `correlated ${a.halfWidth} vs mixed ${b.halfWidth}`);
});

test("backtest prior: capped at four slates' worth, and on its own it never meets the forward floors", () => {
  const prior = discountedPrior({ meanDiff: -0.08, sdPerEvent: 0.3, events: 2000, slates: 100 });
  assert.equal(prior.slates, 4);
  assert.equal(prior.events, 80);
  const alone = confidenceSequence([], { prior });
  assert.equal(alone.n, 0);
  assert.equal(evidenceVerdict({ cs: alone }).meter, "TOO_EARLY");
  assert.equal(evidenceVerdict({ cs: alone }).wouldBe, "NONE");
  const fwd = [{ slate: day(0), n: 10, sum: -0.5, sumSq: 1.2 }, { slate: day(1), n: 10, sum: -0.9, sumSq: 0.9 }, { slate: day(2), n: 10, sum: -0.6, sumSq: 1.0 }];
  const without = confidenceSequence(fwd);
  const withPrior = confidenceSequence(fwd, { prior });
  assert.ok(withPrior.halfWidth < without.halfWidth, "a strong prior narrows the bound");
  assert.equal(withPrior.n, 30, "the prior is not counted as forward events");
  assert.equal(discountedPrior(null), null);
});

test("calibration: a calibrated forecaster fits slope ~1, an overconfident one fits slope < 1", () => {
  const rand = mulberry32(3);
  const good = [];
  const over = [];
  for (let i = 0; i < 3000; i += 1) {
    const p = 0.1 + 0.8 * rand();
    const y = rand() < p ? 1 : 0;
    good.push({ p, y });
    const logit = Math.log(p / (1 - p)) * 2;
    over.push({ p: 1 / (1 + Math.exp(-logit)), y });
  }
  const g = calibrationFit(good);
  assert.equal(g.state, "COMPUTED");
  assert.ok(g.slopeContainsOne && g.interceptContainsZero, JSON.stringify(g));
  const o = calibrationFit(over);
  assert.ok(o.slopeHi < 1, JSON.stringify(o));
  assert.equal(calibrationFit(good.slice(0, 12)).state, "NOT_COMPUTABLE");
});

test("verdict: floors, Established eligibility, and pause signals", () => {
  const cal = { state: "COMPUTED", slopeContainsOne: true, interceptContainsZero: true };
  const better = { n: 120, slates: 6, meanDiff: -0.05, lower: -0.09, upper: -0.01 };
  assert.equal(evidenceVerdict({ cs: better, calibration: cal }).wouldBe, "ESTABLISHED_ELIGIBLE");
  assert.equal(evidenceVerdict({ cs: better, calibration: { ...cal, slopeContainsOne: false } }).wouldBe, "NONE");
  assert.equal(evidenceVerdict({ cs: better, calibration: cal, healthState: "BREACHED" }).wouldBe, "PAUSE_SIGNAL");
  assert.equal(evidenceVerdict({ cs: { ...better, slates: 2 }, calibration: cal }).meter, "TOO_EARLY");
  const worse = { n: 120, slates: 6, meanDiff: 0.05, lower: 0.01, upper: 0.09 };
  assert.equal(evidenceVerdict({ cs: worse }).wouldBe, "PAUSE_SIGNAL");
  const open = evidenceVerdict({ cs: { n: 120, slates: 6, meanDiff: -0.01, lower: -0.05, upper: 0.03 } });
  assert.equal(open.meter, "EVIDENCE_BUILDING");
  assert.equal(open.lean, "LEANING_BETTER");
  assert.equal(evidenceVerdict({ cs: { n: 25, slates: 4, meanDiff: -0.1, lower: -0.2, upper: -0.01 }, distribution: true, calibration: cal }).floorsMet, true);
  assert.equal(FLOORS.minSlates, 3);
});

test("market badge is separate and needs its own floors", () => {
  assert.equal(marketBadge({ n: 0, slates: 0 }), "NOT_COMPUTABLE");
  assert.equal(marketBadge({ n: 50, slates: 2, lower: -1, upper: 1 }), "TOO_EARLY");
  assert.equal(marketBadge({ n: 50, slates: 5, lower: -0.1, upper: -0.01 }), "BEATS_MARKET");
  assert.equal(marketBadge({ n: 50, slates: 5, lower: 0.01, upper: 0.1 }), "TRAILS_MARKET");
  assert.equal(marketBadge({ n: 50, slates: 5, lower: -0.1, upper: 0.1 }), "UNDECIDED");
});

// ── Ledger rows ──────────────────────────────────────────────────────────────────────────────────────────────────
let seq = 0;
const row = (over = {}) => ({
  forecastId: `fl1-${String(seq++).padStart(16, "0")}`,
  sport: "NFL", family: "nfl_game_winner", forecastKind: "BINARY_PROBABILITY", modelId: "m", modelVersion: "1",
  publicationStatus: "PUBLISHED", eventStart: "2026-09-14T17:00:00Z", publishedAt: "2026-09-13T12:00:00Z", receiptId: null,
  probability: 0.6, classProbabilities: null, market: null,
  settlement: { state: "SETTLED", finalValue: 1, finalCategory: "HOME" },
  measurement: { logLoss: -Math.log(0.6), observed: 1, absoluteError: null },
  ...over,
});

test("pending, void, withdrawn and unmeasured rows are excluded and counted, never scored as losses", () => {
  assert.equal(exclusionReason(row({ settlement: { state: "PENDING" }, measurement: {} })), "pending");
  assert.equal(exclusionReason(row({ settlement: { state: "VOID" }, measurement: {} })), "void");
  assert.equal(exclusionReason(row({ publicationStatus: "WITHDRAWN" })), "withdrawn");
  assert.equal(exclusionReason(row({ settlement: { state: "NO_MEASUREMENT" }, measurement: {} })), "noMeasurement");
  assert.equal(exclusionReason(row()), null);
  const out = pairedDifferences([row(), row({ settlement: { state: "PENDING" }, measurement: {} }), row({ settlement: { state: "VOID" }, measurement: {} })], "nfl_game_winner");
  assert.equal(out.items.length, 1);
  assert.deepEqual(out.excluded, { pending: 1, void: 1 });
});

test("coin baseline: d = model log loss − ln 2", () => {
  const out = pairedDifferences([row()], "nfl_game_winner");
  assert.equal(FAMILY_BASELINES.nfl_game_winner, "COIN");
  assert.ok(Math.abs(out.items[0].d - (-Math.log(0.6) - Math.LN2)) < 1e-12);
});

test("trailing-rate baseline is point-in-time: later outcomes never change an earlier slate's score", () => {
  const mk = (k, y) => row({ family: "anytime_td", eventStart: `${day(k)}T17:00:00Z`, probability: 0.3, measurement: { logLoss: y ? -Math.log(0.3) : -Math.log(0.7), observed: y } });
  const rows = [];
  for (let k = 0; k < 5; k += 1) for (let i = 0; i < 10; i += 1) rows.push(mk(k, i < 3 ? 1 : 0));
  const later = rows.concat(Array.from({ length: 10 }, () => mk(5, 1)));
  const a = pairedDifferences(rows, "anytime_td");
  const b = pairedDifferences(later, "anytime_td");
  const warm = a.items.filter((it) => it.d == null).length;
  assert.equal(warm, WARMUP_EVENTS, "the first slates are warm-up with no baseline");
  assert.equal(a.excluded.warmup, WARMUP_EVENTS);
  const firstScored = a.items.findIndex((it) => it.d != null);
  assert.equal(a.items[firstScored].d, b.items[firstScored].d);
  // Slate 3's baseline rate uses slates 0-2 only: (9 + 1) / (30 + 2).
  const q = 10 / 32;
  assert.ok(Math.abs(a.items[firstScored].d - (-Math.log(0.3) - -Math.log(q))) < 1e-12);
});

test("no pre-registered baseline means no score, not an invented one", () => {
  const out = pairedDifferences([row({ family: "player_receptions", forecastKind: "CONTINUOUS_PROJECTION", probability: null, measurement: { absoluteError: 2 } })], "player_receptions");
  assert.equal(out.baselineId, "NONE");
  assert.equal(out.items[0].d, null);
});

test("market diff: log loss vs the recorded market; projections vs the frozen line; absent market stays absent", () => {
  const b = row({ market: { impliedProbability: 0.5 } });
  assert.ok(Math.abs(marketDiff(b) - (-Math.log(0.6) - Math.LN2)) < 1e-12);
  const c = row({ forecastKind: "CONTINUOUS_PROJECTION", market: { line: 32.5 }, settlement: { state: "SETTLED", finalValue: 40 }, measurement: { absoluteError: 22 } });
  assert.equal(marketDiff(c), 22 - 7.5);
  const m = row({ forecastKind: "MULTICLASS_PROBABILITY", market: { impliedProbability: { home: 0.5, draw: 0.25, away: 0.25 } }, settlement: { state: "SETTLED", finalCategory: "home" }, measurement: { logLoss: 0.6 } });
  assert.ok(Math.abs(marketDiff(m) - (0.6 - Math.log(2))) < 1e-12);
  assert.equal(marketDiff(row({ market: { impliedProbability: null, price: { yes: 600 } } })), null);
});

test("slate date: ET day of the start, then the pregame publish time, then a date in the receipt id", () => {
  assert.deepEqual(slateOf(row({ eventStart: "2026-09-15T00:20:00Z" })), { slate: "2026-09-14", source: "eventStart" });
  assert.deepEqual(slateOf(row({ eventStart: null, publishedAt: "2026-10-03T15:06:48Z" })), { slate: "2026-10-03", source: "publishedAt" });
  assert.deepEqual(slateOf(row({ eventStart: null, publishedAt: null, receiptId: "mlb/homer-nukes/settled-2026-09-08.json" })), { slate: "2026-09-08", source: "receiptId" });
  assert.equal(slateOf(row({ eventStart: null, publishedAt: null })), null);
});

test("the committed report is report-only, one family and version per entry, and never pools", () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const p = path.join(ROOT, "data/internal/evidence/model-evidence.json");
  assert.ok(fs.existsSync(p), "model-evidence.json is produced by scripts/evidence/build-model-evidence.mjs");
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(doc.mode, "REPORT_ONLY");
  assert.equal(doc.dataClass, "INTERNAL_RESEARCH");
  for (const k of ["overall", "total", "accuracy", "pooled"]) assert.ok(!(k in doc), `no ${k} figure`);
  const keys = new Set();
  for (const e of doc.families) {
    const k = `${e.sport}|${e.family}|${e.modelId}|${e.modelVersion}`;
    assert.ok(!keys.has(k), `duplicate entry ${k}`);
    keys.add(k);
    assert.ok(["NONE", "ESTABLISHED_ELIGIBLE", "PAUSE_SIGNAL"].includes(e.evidence.wouldBe));
    if (e.primary.state === "COMPUTED" && e.primary.lower != null) assert.ok(e.primary.lower <= e.primary.meanDiff && e.primary.meanDiff <= e.primary.upper);
  }
});
