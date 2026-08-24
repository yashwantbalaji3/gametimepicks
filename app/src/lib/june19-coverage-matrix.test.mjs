import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";
import { loadMoonshotLane } from "./moonshot/moonshot-lane.ts";
import { buildCoverageMatrix } from "./parlays/coverage-matrix.ts";
import path from "node:path";
import { pinnedLaneRoot } from "./bank-builder/fixtures/root.mjs";

const slate = loadTodaySlate("2026-06-19", "2026-06-19T19:25:00Z", pinnedLaneRoot());
const m = buildCoverageMatrix(slate, loadMoonshotLane(), "2026-06-19T19:25:00Z");
const RB = ["low", "medium", "high", "longshot"];
const SCOPES = ["world_cup_single_game", "world_cup_multi_game", "mlb", "mixed", "moonshot", "bank_builder"];

// P192 · PINNED LANE STATE — this regression is about a specific historical lane state, so it reads a
// pinned snapshot rather than the live ladder. Assertions unchanged; only the source is.
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

test("Moonshot row after the lane restarted ACTIVE: the active review card is counted once in its own Longshot bucket", () => {
  const moon = m.rows.find((r) => r.scope === "moonshot");
  // The July-21 MLB review card is the ACTIVE Moonshot card → counted once, in the Longshot bucket
  // (Moonshot cards are Longshot by design), in its OWN row (never double-counted into generic suggestions).
  assert.equal(moon.total, 1, "Moonshot active review card counted once");
  assert.equal(moon.cells.find((c) => c.risk === "longshot").count, 1, "the active Moonshot card sits in the Longshot bucket");
  for (const rb of ["low", "medium", "high"]) assert.equal(moon.cells.find((c) => c.risk === rb).count, 0, `Moonshot ${rb} = 0`);
});

test("Core Bank Builder row after the lanes restarted: each active card is counted once in its own row (its bucket), never double-counted into generic suggestions", () => {
  const bb = m.rows.find((r) => r.scope === "bank_builder");
  // BOTH lanes now carry an active Step-1 review card (Lane A survival + Lane B value, activated July-21) →
  // each counted ONCE, in the bucket its combined odds fit, inside the Bank Builder's OWN row — never
  // promoted into the generic WC/MLB/Mixed suggestions. Lane A (+306) → Medium, Lane B (+296) → High.
  assert.equal(bb.total, 2, "both active Bank Builder review cards (Lane A + Lane B) counted in their own row");
  assert.equal(bb.cells.find((c) => c.risk === "medium").count, 1, "one active card in the Medium bucket");
  assert.equal(bb.cells.find((c) => c.risk === "high").count, 1, "one active card in the High bucket");
  for (const rb of ["low", "longshot"]) assert.equal(bb.cells.find((c) => c.risk === rb).count, 0, `Bank Builder ${rb} = 0`);
  // Every EMPTY Bank Builder cell still discloses the exclusion policy (its own row, never promoted as a generic suggestion).
  for (const c of bb.cells.filter((x) => x.count === 0)) assert.match(c.message, /tracked separately|double-count|not promoted/i, `${c.risk} empty cell discloses the no-double-count exclusion policy`);
  // Active Bank Builder legs are not promoted as generic Mixed/MLB suggestions.
  assert.ok(m.diagnosticsSummary.some((s) => /own row|double-count|separately/i.test(s)), "exclusion policy disclosed");
});

// P200 ownership move: the published snapshot is now the risk-coverage instrument (schemaVersion 2,
// five lanes × four tiers, owner scripts/parlays/build-risk-coverage.mjs; deep guards live in
// src/lib/parlays/risk-coverage.test.mjs). The June-19 matrix semantics above stay pinned via the lib.
test("coverage snapshot JSON is published and reconciles (v2: counts recount from the cells)", () => {
  const d = JSON.parse(fs.readFileSync("public/data/parlays/coverage-matrix.json", "utf8"));
  assert.equal(d.schemaVersion, 2, "published matrix is the v2 instrument");
  assert.equal(d.rows.length, 5, "five lanes persisted");
  const counts = { PUBLISHED: 0, NO_PLAY: 0, LANE_CLOSED: 0, MISSING: 0 };
  for (const r of d.rows) for (const c of Object.values(r.tiers)) counts[c.state] += 1;
  assert.deepEqual(d.counts, counts, "snapshot reconciles: counts recount from the cells");
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
  // Program 143 moved the marketplace to /build (capability-parity release 1dd394c4). The
  // assertions MOVE with it — this guard is the matrix's only coverage, and it is what caught the
  // first Deployment B attempt deleting the capability outright.
  const page = fs.readFileSync("src/app/build/page.tsx", "utf8");
  assert.match(page, /buildCoverageMatrix\(\w+, loadMoonshotLane\(\)/, "matrix built server-side on /build");
  // The legacy /parlays route is a thin CLIENT redirect to the canonical lobby — not a competing page.
  // (Server redirect() emits an error shell under output:export, so it uses ClientRedirect.)
  const legacy = fs.readFileSync("src/app/parlays/page.tsx", "utf8");
  assert.match(legacy, /ClientRedirect/, "/parlays uses ClientRedirect");
  assert.match(legacy, /to="\/build#suggested-cards"/, "/parlays redirects to the final destination in one hop");
});
