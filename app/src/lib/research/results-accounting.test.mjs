/**
 * SPRINT 052 — every generated row must land in exactly one bucket.
 *
 * The failures being pinned are all quiet ones. A page that starts from the settled ledger reports a
 * smaller population than existed, because rows that were generated but never gradable are not written
 * to the ledger at all (Sprint 046). Those rows then read as if they never happened — and any rate
 * computed over the remainder is a rate over a silently curated subset.
 *
 * So the accounting identity is asserted directly, including against the REAL slates on disk, where a
 * gap would mean the product is quietly dropping rows it does not know how to classify.
 *
 * Run: npx tsx --test src/lib/research/results-accounting.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  GRADABLE_MARKETS,
  OUTCOME_LABEL,
  OUTCOME_MEANING,
  reconcile,
} from "./results-accounting.ts";

const APP = process.cwd();

const gen = (id, over = {}) => ({ id, marketKey: "batter_hits", lean: "Over", ...over });
const settledMap = (pairs) => new Map(pairs.map(([id, outcome, extra = {}]) => [id, { id, outcome, ...extra }]));

// ── the identity ───────────────────────────────────────────────────────────────

test("a clean slate reconciles to gap zero", () => {
  const r = reconcile({
    date: "2026-07-27",
    generated: [gen("w"), gen("l"), gen("v"), gen("p", { lean: "Pass" })],
    settled: settledMap([["w", "Win"], ["l", "Loss"], ["v", "Void"]]),
    slateComplete: true,
  });
  assert.equal(r.gap, 0);
  assert.equal(r.integrity, "CLEAN");
  assert.equal(r.generated, r.accounted);
  assert.equal(r.decisive, 2);
  assert.equal(r.decisiveHitRate, 0.5);
});

test("unavailable rows absent from the ledger are recovered, and close the gap", () => {
  // The Sprint 046 finding: the ledger never writes these, so a ledger-first page loses them.
  const withoutRecovery = reconcile({
    date: "2026-07-27",
    generated: [gen("w"), gen("ghost")],
    settled: settledMap([["w", "Win"]]),
    slateComplete: true,
  });
  assert.equal(withoutRecovery.pending, 1, "with no recovery source the row is pending, never a loss");

  const withRecovery = reconcile({
    date: "2026-07-27",
    generated: [gen("w"), gen("ghost")],
    settled: settledMap([["w", "Win"]]),
    unavailableIds: new Set(["ghost"]),
    slateComplete: true,
  });
  assert.equal(withRecovery.unavailable, 1);
  assert.equal(withRecovery.pending, 0);
  assert.equal(withRecovery.gap, 0);
  assert.match(withRecovery.notes.join(" "), /the ledger does not record them/);
});

test("a missing row is never counted as a loss", () => {
  const r = reconcile({
    date: "2026-07-27",
    generated: [gen("a"), gen("b"), gen("c")],
    settled: settledMap([["a", "Win"]]),
    unavailableIds: new Set(["b"]),
    slateComplete: true,
  });
  assert.equal(r.losses, 0, "two unsettled rows must not become losses");
  assert.equal(r.unavailable + r.pending, 2);
});

test("pass and void stay out of the decisive denominator", () => {
  const r = reconcile({
    date: "2026-07-27",
    generated: [gen("w"), gen("v"), gen("p1", { lean: "Pass" }), gen("p2", { lean: "No Play" })],
    settled: settledMap([["w", "Win"], ["v", "Void"]]),
    slateComplete: true,
  });
  assert.equal(r.decisive, 1);
  assert.equal(r.decisiveHitRate, 1, "1 win of 1 decisive");
  assert.equal(r.passes, 2);
  assert.equal(r.voids, 1);
  assert.equal(r.gap, 0);
});

test("a row in an ungradable market is a pass, not a gap", () => {
  const r = reconcile({
    date: "2026-07-27",
    generated: [gen("w"), gen("x", { marketKey: "batter_home_runs" })],
    settled: settledMap([["w", "Win"]]),
    slateComplete: true,
  });
  assert.equal(r.passes, 1);
  assert.equal(r.gap, 0);
  assert.ok(!GRADABLE_MARKETS.includes("batter_home_runs"));
});

test("pending rows on a completed slate are reported as PARTIAL, not hidden", () => {
  const r = reconcile({
    date: "2026-07-27",
    generated: [gen("w"), gen("stuck")],
    settled: settledMap([["w", "Win"]]),
    slateComplete: true,
  });
  assert.equal(r.integrity, "PARTIAL");
  assert.match(r.notes.join(" "), /remain unresolved on a completed slate/);
  assert.equal(r.decisiveHitRate, 1, "the unresolved row must not dilute the rate");
});

test("a pending row on a live slate is not a defect", () => {
  const r = reconcile({
    date: "2026-07-29",
    generated: [gen("w"), gen("live")],
    settled: settledMap([["w", "Win"]]),
    slateComplete: false,
  });
  assert.equal(r.integrity, "CLEAN");
  assert.equal(r.pending, 1);
});

// ── quarantine ─────────────────────────────────────────────────────────────────

test("a quarantined slate exposes NO rate of any kind", () => {
  const r = reconcile({
    date: "2026-07-28",
    generated: [gen("a"), gen("b"), gen("c")],
    settled: settledMap([]),
    quarantined: true,
  });
  assert.equal(r.integrity, "QUARANTINED");
  assert.equal(r.decisiveHitRate, null, "null, not zero — an absence of measurement, not a measurement");
  assert.equal(r.terminalCoverage, null);
  assert.equal(r.settlementCompletion, null);
  assert.equal(r.generated, 3, "the generated population is still reported");
  assert.equal(r.lineage, "QUARANTINED");
  assert.match(r.notes.join(" "), /no hit rate exists for it/);
});

test("quarantine wins over any settled rows that happen to exist", () => {
  const r = reconcile({
    date: "2026-07-28",
    generated: [gen("a")],
    settled: settledMap([["a", "Win"]]),
    quarantined: true,
  });
  assert.equal(r.wins, 0, "a withheld slate must not report wins even if rows are present");
  assert.equal(r.decisiveHitRate, null);
});

// ── lineage honesty ────────────────────────────────────────────────────────────

test("legacy rows are labelled, never retro-stamped as verified", () => {
  const r = reconcile({
    date: "2026-07-27",
    generated: [gen("a"), gen("b")],
    settled: settledMap([["a", "Win", { eventId: "mlb:x:1" }], ["b", "Loss"]]),
    slateComplete: true,
  });
  assert.equal(r.lineage, "LEGACY_LINEAGE");
  assert.match(r.notes.join(" "), /rather than retro-stamped/);
});

test("full lineage is only claimed when every settled row carries it", () => {
  const r = reconcile({
    date: "2026-07-30",
    generated: [gen("a"), gen("b")],
    settled: settledMap([["a", "Win", { eventId: "e1" }], ["b", "Loss", { eventId: "e2" }]]),
    slateComplete: true,
  });
  assert.equal(r.lineage, "VERIFIED_LINEAGE");
});

test("a date with nothing settled reports an explicit unknown", () => {
  const r = reconcile({ date: "2026-07-29", generated: [gen("a")], settled: settledMap([]) });
  assert.equal(r.lineage, "UNKNOWN_WITH_REASON");
});

// ── rates never fabricate ──────────────────────────────────────────────────────

test("a zero denominator yields null, never 0%", () => {
  const r = reconcile({
    date: "2026-07-27",
    generated: [gen("p", { lean: "Pass" })],
    settled: settledMap([]),
    slateComplete: true,
  });
  assert.equal(r.decisive, 0);
  assert.equal(r.decisiveHitRate, null, "0/0 must be null — rendering 0% would read as 'we lost everything'");
});

// ── against the real slates ────────────────────────────────────────────────────

test("real committed slates reconcile to gap zero", () => {
  const boards = path.join(APP, "public/data/mlb/boards");
  const ledgerPath = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");
  const byDate = new Map();
  for (const line of fs.readFileSync(ledgerPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (!byDate.has(row.date)) byDate.set(row.date, new Map());
    byDate.get(row.date).set(row.id, row);
  }

  let checked = 0;
  for (const date of ["2026-07-25", "2026-07-26", "2026-07-27"]) {
    const p = path.join(boards, `${date}.json`);
    if (!fs.existsSync(p)) continue;
    const board = JSON.parse(fs.readFileSync(p, "utf8"));
    const generated = (board.leans ?? []).map((l) => ({ id: l.id, marketKey: l.marketKey, lean: l.lean }));
    const settled = byDate.get(date) ?? new Map();

    // Rows the ledger never wrote are recovered as unavailable, which is the whole point.
    const unavailableIds = new Set(
      generated
        .filter((g) => GRADABLE_MARKETS.includes(g.marketKey) && g.lean !== "Pass" && !settled.has(g.id))
        .map((g) => g.id),
    );

    const r = reconcile({ date, generated, settled, unavailableIds, slateComplete: true });
    checked += 1;
    assert.equal(r.gap, 0, `${date} left ${r.gap} row(s) unaccounted`);
    assert.equal(r.generated, r.accounted, `${date} population does not close`);
    assert.ok(r.decisive > 0, `${date} should have decisive rows`);
  }
  assert.ok(checked >= 3, "at least three real slates must be checked, or this proves nothing");
});

// ── vocabulary ─────────────────────────────────────────────────────────────────

test("every outcome state has a label and a plain-language meaning", () => {
  for (const s of ["WIN", "LOSS", "VOID", "PENDING", "UNAVAILABLE", "PASS", "QUARANTINED"]) {
    assert.ok(OUTCOME_LABEL[s], `${s} has no label`);
    assert.ok(OUTCOME_MEANING[s]?.length > 30, `${s} has no usable explanation`);
  }
  // The three that are most often misread as losses must say so explicitly.
  for (const s of ["VOID", "PENDING", "UNAVAILABLE"]) {
    assert.match(OUTCOME_MEANING[s], /Not a loss\./, `${s} must state plainly that it is not a loss`);
  }
});
