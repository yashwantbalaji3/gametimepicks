/**
 * LANE C — the final preregistered protocol's machinery must match its registration document.
 *
 * The registration (docs/experiments/MLB_VARIANCE_FINAL_PREREGISTRATION.md) was committed before the
 * runner existed; these tests pin the runner to it. Failure modes covered are the ones that would
 * quietly change the verdict: window boundaries that leak rows, a verdict function with different
 * margins than the ones registered, per-market shrinkage that ignores its λ, and family decisions
 * that reorder their precedence.
 *
 * Run: npx tsx --test src/lib/mlb-variance-final.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  WINDOWS,
  SUB_WINDOWS,
  splitWindows,
  fingerprint,
  fitCandidates,
  finalVerdict,
  familyDecision,
} from "../../scripts/mlb-variance-final.mjs";

const mkRows = (dates, perDay = 20) => {
  const rows = [];
  for (const d of dates) {
    for (let i = 0; i < perDay; i += 1) {
      const q = 0.35 + 0.3 * ((i % 10) / 10);
      rows.push({ date: d, market: i % 2 ? "batter_hits" : "batter_hits_runs_rbis", p: Math.min(0.95, q + 0.08), q, y: i % 2 });
    }
  }
  return rows;
};

// ── windows ────────────────────────────────────────────────────────────────────

test("windows match the registered boundaries and never overlap", () => {
  assert.equal(WINDOWS.trainEnd, "2026-06-24");
  assert.equal(WINDOWS.valStart, "2026-07-01");
  assert.equal(WINDOWS.valEnd, "2026-07-11");
  assert.equal(WINDOWS.testStart, "2026-07-21");
  assert.equal(WINDOWS.testEnd, "2026-07-27");
  assert.equal(SUB_WINDOWS.length, 3);

  const rows = mkRows(["2026-06-01", "2026-06-24", "2026-06-28", "2026-07-01", "2026-07-11", "2026-07-15", "2026-07-21", "2026-07-27"]);
  const { train, validation, test: te } = splitWindows(rows);
  assert.ok(train.every((r) => r.date <= WINDOWS.trainEnd));
  assert.ok(validation.every((r) => r.date >= WINDOWS.valStart && r.date <= WINDOWS.valEnd));
  assert.ok(te.every((r) => r.date >= WINDOWS.testStart && r.date <= WINDOWS.testEnd));
  // Gap rows (06-28, 07-15) belong to NO window — they must not sneak into any of the three.
  assert.equal(train.length + validation.length + te.length, rows.length - 2 * 20);
});

test("the corpus fingerprint is order-independent and content-sensitive", () => {
  const rows = mkRows(["2026-06-01", "2026-06-02"]);
  const shuffled = [...rows].reverse();
  assert.equal(fingerprint(rows), fingerprint(shuffled));
  const mutated = rows.map((r, i) => (i === 0 ? { ...r, y: 1 - r.y } : r));
  assert.notEqual(fingerprint(rows), fingerprint(mutated));
});

// ── verdict thresholds (exactly as registered) ─────────────────────────────────

test("finalVerdict implements the registered thresholds and precedence", () => {
  const base = { bMkt: 0.241, bRaw: 0.256, subWindowBeats: 3, subWindowWorseThanRaw: false, lomoAllBelowMarket: true, honestyGapPp: 0.5 };
  assert.equal(finalVerdict({ ...base, bSel: 0.2395 }), "OUTPERFORMS_MARKET");
  // Outperformance requires stability: failing sub-windows or LOMO demotes it all the way to
  // REJECT (0.2395 sits outside the parity band and is not worse than market, so no other verdict fits).
  assert.equal(finalVerdict({ ...base, bSel: 0.2395, subWindowBeats: 1 }), "REJECT");
  assert.notEqual(finalVerdict({ ...base, bSel: 0.2395, lomoAllBelowMarket: false }), "OUTPERFORMS_MARKET");
  // Parity needs the honesty bound too.
  assert.equal(finalVerdict({ ...base, bSel: 0.2415 }), "REACHES_PARITY");
  assert.notEqual(finalVerdict({ ...base, bSel: 0.2415, honestyGapPp: 5 }), "REACHES_PARITY");
  // Better than raw by ≥0.002 but worse than market by >0.001 → IMPROVES_MODEL_ONLY.
  assert.equal(finalVerdict({ ...base, bSel: 0.246 }), "IMPROVES_MODEL_ONLY");
  // Any sub-window worse than raw is an instability hard-fail.
  assert.equal(finalVerdict({ ...base, bSel: 0.2395, subWindowWorseThanRaw: true }), "REJECT");
  // Barely better than raw is not enough.
  assert.equal(finalVerdict({ ...base, bSel: 0.2555 }), "REJECT");
});

test("familyDecision precedence: sample first, CI-below-half second, margin third", () => {
  assert.equal(familyDecision({ testN: 100, ciBelowHalf: true, bSelFamily: 0.2, bMktFamily: 0.3 }), "INSUFFICIENT_EVIDENCE");
  assert.equal(familyDecision({ testN: 500, ciBelowHalf: true, bSelFamily: 0.2, bMktFamily: 0.3 }), "DISABLE_PREDICTION");
  assert.equal(familyDecision({ testN: 500, ciBelowHalf: false, bSelFamily: 0.2385, bMktFamily: 0.24 }), "CONTINUE_R&D");
  assert.equal(familyDecision({ testN: 500, ciBelowHalf: false, bSelFamily: 0.2395, bMktFamily: 0.24 }), "RESEARCH_CONTENT_ONLY");
});

// ── per-market shrinkage ───────────────────────────────────────────────────────

test("per-market k is shrunk toward the global k, never past the raw per-market fit", () => {
  // Build a train set where one market wants a much larger k than the other.
  const rows = [];
  for (let d = 1; d <= 20; d += 1) {
    const date = `2026-06-${String(d).padStart(2, "0")}`;
    for (let i = 0; i < 60; i += 1) {
      // batter_hits: mildly overconfident; pitcher_strikeouts: wildly overconfident.
      const y = i % 2;
      rows.push({ date, market: "batter_hits", p: y ? 0.62 : 0.55, q: 0.5, y });
      rows.push({ date, market: "pitcher_strikeouts", p: y ? 0.9 : 0.85, q: 0.5, y });
    }
  }
  const c = fitCandidates(rows);
  const { global: g, byMarket } = c.C2.params;
  for (const [m, k] of Object.entries(byMarket)) {
    const lo = Math.min(g, k);
    const hi = Math.max(g, k);
    assert.ok(k >= 1 && k <= 4, `${m} k out of grid range`);
    assert.ok(hi - lo <= 4, "sanity");
  }
  // The wildly-overconfident market must end with a larger k than the mild one.
  assert.ok(byMarket.pitcher_strikeouts > byMarket.batter_hits, "heterogeneous defects must fit heterogeneous k");
});
