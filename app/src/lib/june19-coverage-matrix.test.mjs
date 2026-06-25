import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";
import { loadMoonshotLane } from "./moonshot/moonshot-lane.ts";
import { buildCoverageMatrix } from "./parlays/coverage-matrix.ts";

const slate = loadTodaySlate("2026-06-19", "2026-06-19T19:25:00Z");
const m = buildCoverageMatrix(slate, loadMoonshotLane(), "2026-06-19T19:25:00Z");
const RB = ["low", "medium", "high", "longshot"];
const SCOPES = ["world_cup_single_game", "world_cup_multi_game", "mlb", "mixed", "moonshot", "bank_builder"];

test("coverage matrix has all six scopes, each with all four canonical risk buckets", () => {
  assert.deepEqual(m.rows.map((r) => r.scope), SCOPES, "all six scope rows in order");
  for (const r of m.rows) {
    assert.deepEqual(r.cells.map((c) => c.risk), RB, `${r.scope} has all four risks`);
    assert.deepEqual(r.cells.map((c) => c.label), ["Low Risk", "Medium Risk", "High Risk", "Longshot"], "canonical labels");
  }
});

test("row totals + risk totals both reconcile to the grand total", () => {
  for (const r of m.rows) assert.equal(r.total, r.cells.reduce((n, c) => n + c.count, 0), `${r.scope} total = sum of cells`);
  const rowSum = m.rows.reduce((n, r) => n + r.total, 0);
  const riskSum = RB.reduce((n, rb) => n + m.riskTotals[rb], 0);
  assert.equal(rowSum, m.grandTotal, "rows sum to grand total");
  assert.equal(riskSum, m.grandTotal, "risk totals sum to grand total");
  // Each risk column total equals the sum of that column across rows.
  for (const rb of RB) assert.equal(m.riskTotals[rb], m.rows.reduce((n, r) => n + (r.cells.find((c) => c.risk === rb)?.count ?? 0), 0), `${rb} column reconciles`);
});

test("every empty cell carries a real reason (never a vague blank)", () => {
  for (const r of m.rows) for (const c of r.cells) {
    if (c.count === 0) {
      assert.ok(c.message && c.message.length > 0, `${r.scope}.${c.risk} empty cell has a message`);
      assert.equal(c.status, "empty");
      assert.ok(!/no qualified parlays/i.test(c.message), "no vague empty copy");
    } else {
      assert.ok(c.status === "filled" || c.status === "underfilled");
    }
  }
});

test("Low Risk is honestly empty everywhere (not a gate failure) and the summary explains it", () => {
  assert.equal(m.riskTotals.low, 0, "no Low Risk card anywhere today");
  assert.ok(m.diagnosticsSummary.some((s) => /Low Risk/i.test(s) && /-200|filler|honest/i.test(s)), "summary explains the Low Risk empty");
});

test("Moonshot row after the Step 1 cross-slate card settled LOST: no active card counted", () => {
  const moon = m.rows.find((r) => r.scope === "moonshot");
  // The +1152 Step 1 restart card settled LOST (NZ/Egypt BTTS No missed) → lane stopped, nothing live to count.
  assert.equal(moon.total, 0, "Moonshot settled LOST (stopped) → no active card");
  for (const rb of ["low", "medium", "high", "longshot"]) assert.equal(moon.cells.find((c) => c.risk === rb).count, 0, `Moonshot ${rb} = 0 (lane stopped)`);
});

test("Core Bank Builder row after the completed run was BANKED: fresh cycle-2 has no active card, and its own row is never double-counted into generic suggestions", () => {
  const bb = m.rows.find((r) => r.scope === "bank_builder");
  // The June-24 dual-lane run was BANKED + archived; the live lanes are a fresh Step-1 cycle-2 with no
  // placed card, so the Bank Builder row is honestly empty (no fabricated active card).
  assert.equal(bb.total, 0, "no live Bank Builder card — fresh cycle-2, awaiting the next qualified card");
  for (const rb of ["low", "medium", "high", "longshot"]) assert.equal(bb.cells.find((c) => c.risk === rb).count, 0, `Bank Builder ${rb} = 0 (no active card)`);
  // Every empty Bank Builder cell still discloses the exclusion policy (its own row, never promoted as a generic suggestion).
  for (const c of bb.cells) assert.match(c.message, /tracked separately|double-count|not promoted/i, `${c.risk} cell discloses the no-double-count exclusion policy`);
  // Active Bank Builder legs are not promoted as generic Mixed/MLB suggestions.
  assert.ok(m.diagnosticsSummary.some((s) => /own row|double-count|separately/i.test(s)), "exclusion policy disclosed");
});

test("coverage snapshot JSON is published with totals", () => {
  const d = JSON.parse(fs.readFileSync("public/data/parlays/coverage-matrix.json", "utf8"));
  assert.ok(Array.isArray(d.rows) && d.rows.length === 6, "six rows persisted");
  assert.ok(typeof d.grandTotal === "number", "grand total persisted");
  assert.ok(d.riskTotals && RB.every((rb) => typeof d.riskTotals[rb] === "number"), "risk totals persisted");
  assert.equal(d.rows.reduce((n, r) => n + r.total, 0), d.grandTotal, "snapshot reconciles");
});

test("Parlay Lab UI renders the full matrix (totals footer, Moonshot + Bank Builder rows, mobile overflow)", () => {
  const src = fs.readFileSync("src/components/parlays/parlays-explorer.tsx", "utf8");
  assert.match(src, /Suggested parlay coverage/, "matrix title");
  assert.match(src, /riskTotals\[rb\]/, "renders per-risk totals footer");
  assert.match(src, /grandTotal/, "renders grand total");
  assert.match(src, /overflow-x-auto/, "mobile horizontal scroll wrapper");
  assert.match(src, /Why are some buckets empty/, "empty-reason drawer");
  // Built on the server (node:fs) and passed in — never imported into the client bundle. The canonical
  // suggested-parlay surface is now the Parlay Lab at /picks (/parlays + /parlay-lab redirect to it).
  const page = fs.readFileSync("src/app/picks/page.tsx", "utf8");
  assert.match(page, /buildCoverageMatrix\(\w+, loadMoonshotLane\(\)/, "matrix built server-side in the canonical Parlay Lab (/picks)");
  // The legacy /parlays route is a thin redirect to the canonical lobby — not a competing page.
  const legacy = fs.readFileSync("src/app/parlays/page.tsx", "utf8");
  assert.match(legacy, /redirect\(["']\/picks["']\)/, "/parlays redirects to the canonical /picks");
});
