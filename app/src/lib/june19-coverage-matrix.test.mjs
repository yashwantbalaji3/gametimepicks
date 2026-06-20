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

test("Moonshot row after settlement: Step 1 lost → stopped → no active card counted", () => {
  const moon = m.rows.find((r) => r.scope === "moonshot");
  assert.equal(moon.total, 0, "Moonshot settled (Step 1 lost) → no active card");
  for (const rb of ["low", "medium", "high", "longshot"]) assert.equal(moon.cells.find((c) => c.risk === rb).count, 0, `Moonshot ${rb} = 0`);
});

test("Core Bank Builder row after settlement: only Lane A (advanced) counts; stopped Lane B is not counted", () => {
  const bb = m.rows.find((r) => r.scope === "bank_builder");
  // Lane A +204 (Medium) advanced; Lane B stopped (Step 1 lost) → not counted.
  assert.equal(bb.total, 1, "one live Bank Builder lane (Lane A)");
  assert.equal(bb.cells.find((c) => c.risk === "medium").count, 1, "Lane A in the Medium bucket");
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
  // Built on the server (node:fs) and passed in — never imported into the client bundle.
  const page = fs.readFileSync("src/app/parlays/page.tsx", "utf8");
  assert.match(page, /buildCoverageMatrix\(slate, loadMoonshotLane\(\)/, "matrix built server-side in /parlays");
});
