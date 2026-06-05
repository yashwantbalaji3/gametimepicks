/**
 * Tests for `results-breakdown.ts`.
 *
 * Lock the honesty rules:
 *   - Pushes excluded from hit rate.
 *   - Pending slips never count toward wins/losses.
 *   - Slips with no usable combined odds → unaligned bucket (not
 *     silently dropped, not fabricated into a section).
 *   - Sport bucketing: every leg shares one sport → that sport;
 *     otherwise multi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatHitRateLabel,
  summarizeByRiskSection,
  summarizeBySportBucket,
  summarizePublishedRecord,
} from "./results-breakdown.ts";

test("summarizePublishedRecord sums sections; hitRate excludes pushes+pending", () => {
  const r = summarizePublishedRecord({
    low: { wins: 3, losses: 1, pushes: 0, pending: 0 },
    medium: { wins: 1, losses: 3, pushes: 0, pending: 0 },
    high: { wins: 0, losses: 4, pushes: 1, pending: 2 },
    longshot: { wins: 0, losses: 0, pushes: 0, pending: 0 },
  });
  assert.equal(r.wins, 4);
  assert.equal(r.losses, 8);
  assert.equal(r.pushes, 1);
  assert.equal(r.pending, 2);
  assert.equal(r.decisive, 12); // wins+losses only
  assert.ok(Math.abs(r.hitRate - 4 / 12) < 1e-9);
});

test("summarizePublishedRecord: empty / null → zeroed record, hitRate null (no fabrication)", () => {
  for (const input of [null, undefined, {}]) {
    const r = summarizePublishedRecord(input);
    assert.deepEqual(
      { w: r.wins, l: r.losses, p: r.pushes, pend: r.pending, d: r.decisive, hr: r.hitRate },
      { w: 0, l: 0, p: 0, pend: 0, d: 0, hr: null },
    );
  }
});

function _mkSlip({ status, sports = ["mlb"], odds = [-110, -110] }) {
  const legs = odds.map((o, i) => ({
    sport: sports[i % sports.length] ?? "mlb",
    oddsForSide: o,
  }));
  return { status, legs };
}

test("formatHitRateLabel: 0/0 → '—'", () => {
  assert.equal(formatHitRateLabel(0, 0), "—");
});

test("formatHitRateLabel: 1/3 → '33.3%'", () => {
  assert.equal(formatHitRateLabel(1, 2), "33.3%");
});

test("summarizeByRiskSection: empty input → all zeros", () => {
  const out = summarizeByRiskSection([]);
  for (const sec of ["low", "medium", "high", "longshot"]) {
    assert.equal(out.sections[sec].total, 0);
    assert.equal(out.sections[sec].decisive, 0);
    assert.equal(out.sections[sec].hitRate, null);
  }
  assert.equal(out.unaligned.total, 0);
});

test("summarizeByRiskSection: 2-leg -110/-110 → Low", () => {
  const out = summarizeByRiskSection([
    _mkSlip({ status: "win", odds: [-110, -110] }),
  ]);
  assert.equal(out.sections.low.total, 1);
  assert.equal(out.sections.low.wins, 1);
  assert.equal(out.sections.low.decisive, 1);
  assert.equal(out.sections.low.hitRate, 1);
});

test("summarizeByRiskSection: pushes excluded from hit rate", () => {
  const out = summarizeByRiskSection([
    _mkSlip({ status: "win", odds: [-110, -110] }),
    _mkSlip({ status: "push", odds: [-110, -110] }),
  ]);
  assert.equal(out.sections.low.total, 2);
  assert.equal(out.sections.low.wins, 1);
  assert.equal(out.sections.low.pushes, 1);
  assert.equal(out.sections.low.decisive, 1);
  assert.equal(out.sections.low.hitRate, 1);
});

test("summarizeByRiskSection: pending excluded from decisive", () => {
  const out = summarizeByRiskSection([
    _mkSlip({ status: "pending", odds: [-110, -110] }),
    _mkSlip({ status: "loss", odds: [-110, -110] }),
  ]);
  assert.equal(out.sections.low.total, 2);
  assert.equal(out.sections.low.pending, 1);
  assert.equal(out.sections.low.losses, 1);
  assert.equal(out.sections.low.decisive, 1);
  assert.equal(out.sections.low.hitRate, 0);
});

test("summarizeByRiskSection: 5 legs at -110 → Longshot", () => {
  const out = summarizeByRiskSection([
    _mkSlip({ status: "win", odds: [-110, -110, -110, -110, -110] }),
  ]);
  // 5 × -110 → ~+2448 combined, 5 legs → both gates pass for Longshot.
  assert.equal(out.sections.longshot.total, 1);
  assert.equal(out.sections.longshot.wins, 1);
  // All other sections empty.
  assert.equal(out.sections.low.total, 0);
  assert.equal(out.sections.medium.total, 0);
  assert.equal(out.sections.high.total, 0);
});

test("summarizeByRiskSection: 4 legs at -110 (Longshot odds but not legs) → unaligned", () => {
  const out = summarizeByRiskSection([
    _mkSlip({ status: "loss", odds: [-110, -110, -110, -110] }),
  ]);
  // 4 × -110 → +1234 (Longshot odds), but 4 legs is below Longshot's
  // 5-leg floor → unaligned by the strict gate.
  assert.equal(out.sections.longshot.total, 0);
  assert.equal(out.unaligned.total, 1);
  assert.equal(out.unaligned.losses, 1);
});

test("summarizeByRiskSection: slip with a null-odds leg → unaligned", () => {
  const out = summarizeByRiskSection([
    {
      status: "win",
      legs: [
        { sport: "mlb", oddsForSide: -110 },
        { sport: "mlb", oddsForSide: null },
      ],
    },
  ]);
  // Combined odds unavailable → unaligned (never fabricated into a
  // section).
  assert.equal(out.unaligned.total, 1);
  assert.equal(out.sections.low.total, 0);
});

test("summarizeBySportBucket: single-sport NBA → nba", () => {
  const out = summarizeBySportBucket([
    _mkSlip({ status: "win", sports: ["nba"], odds: [-110, -110] }),
  ]);
  assert.equal(out.nba.total, 1);
  assert.equal(out.mlb.total, 0);
  assert.equal(out.multi.total, 0);
});

test("summarizeBySportBucket: mixed NBA+MLB → multi", () => {
  const out = summarizeBySportBucket([
    _mkSlip({ status: "loss", sports: ["nba", "mlb"], odds: [-110, -110] }),
  ]);
  assert.equal(out.multi.total, 1);
  assert.equal(out.multi.losses, 1);
  assert.equal(out.nba.total, 0);
  assert.equal(out.mlb.total, 0);
});

test("summarizeBySportBucket: no legs → other (not silently dropped)", () => {
  const out = summarizeBySportBucket([
    { status: "win", legs: [] },
  ]);
  assert.equal(out.other.total, 1);
  assert.equal(out.nba.total, 0);
  assert.equal(out.mlb.total, 0);
  assert.equal(out.multi.total, 0);
});
