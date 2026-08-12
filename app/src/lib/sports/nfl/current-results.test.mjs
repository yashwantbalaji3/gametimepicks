/**
 * NFL current-results adapter guards (Program 161 · Release D).
 * Every state honest, id-based join exactly-once, quarantine total, reconciliation gap zero.
 *
 * Run: npx tsx --test src/lib/sports/nfl/current-results.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { loadCurrentNflResults } from "./current-results.mjs";

const NOW = "2026-08-14T12:00:00Z";
const fresh = { sourceAsOf: "2026-08-14T10:00:00Z", generatedAt: "2026-08-14T10:00:00Z" };
const schedRow = (id, over = {}) => [id, { providerEventId: id, seasonType: 1, week: 1, home: { abbr: "CIN" }, away: { abbr: "DET" }, ...over }];
const finalRow = (id, h, a, over = {}) => ({ providerEventId: id, statusRaw: "STATUS_FINAL", ftHome: h, ftAway: a, ...over });

test("NOT_CONFIGURED when no artifact exists — never an invented empty slate", () => {
  const out = loadCurrentNflResults({ nowIso: NOW, artifact: null });
  assert.equal(out.state, "NOT_CONFIGURED");
  assert.deepEqual(out.results, []);
});

test("NO_RESULTS_YET with fresh stamps and zero completed rows", () => {
  const out = loadCurrentNflResults({ nowIso: NOW, artifact: { ...fresh, rows: [{ providerEventId: "1", statusRaw: "STATUS_SCHEDULED" }] }, scheduleIndex: new Map() });
  assert.equal(out.state, "NO_RESULTS_YET");
});

test("SOURCE_STALE when stamps exceed the freshness window — with or without rows", () => {
  const staleStamps = { sourceAsOf: "2026-08-10T10:00:00Z", generatedAt: "2026-08-10T10:00:00Z" };
  assert.equal(loadCurrentNflResults({ nowIso: NOW, artifact: { ...staleStamps, rows: [] }, scheduleIndex: new Map() }).state, "SOURCE_STALE");
  const withRows = loadCurrentNflResults({ nowIso: NOW, artifact: { ...staleStamps, rows: [finalRow("1", 21, 14)] }, scheduleIndex: new Map(schedRow("1") ? [schedRow("1")] : []) });
  assert.equal(withRows.state, "SOURCE_STALE", "stale results still parse but the state says stale");
});

test("RESULTS · id-based join, contract exercised, reconciliation exact", () => {
  const out = loadCurrentNflResults({
    nowIso: NOW,
    artifact: { ...fresh, rows: [finalRow("100", 24, 17), finalRow("tie", 20, 20)] },
    scheduleIndex: new Map([schedRow("100"), schedRow("tie", { home: { abbr: "NYJ" }, away: { abbr: "CLE" } })]),
  });
  assert.equal(out.state, "RESULTS");
  assert.equal(out.results.length, 2);
  assert.equal(out.quarantined.length, 0);
  assert.equal(out.results[0].contractCheck, "WIN", "home 24-17");
  assert.equal(out.results[1].contractCheck, "PUSH", "a tied final pushes the two-way moneyline — ties are explicit");
  assert.equal(out.results[0].home, "CIN", "identity fields come from the schedule capture, not re-derived");
  assert.deepEqual(out.reconciliation, { completedRows: 2, joined: 2, quarantined: 0, exact: true });
});

test("QUARANTINE · no schedule lineage, duplicate consumption, missing integer scores — never settled", () => {
  const out = loadCurrentNflResults({
    nowIso: NOW,
    artifact: { ...fresh, rows: [finalRow("known", 10, 7), finalRow("orphan", 14, 3), finalRow("known", 10, 7), finalRow("noscore", null, 21)] },
    scheduleIndex: new Map([schedRow("known"), schedRow("noscore")]),
  });
  assert.equal(out.results.length, 1);
  assert.equal(out.quarantined.length, 3);
  assert.match(out.quarantined[0].reason, /schedule lineage/, "the orphan names its reason");
  assert.match(out.quarantined[1].reason, /exactly once/);
  assert.match(out.quarantined[2].reason, /integer points/);
  assert.deepEqual(out.reconciliation, { completedRows: 4, joined: 1, quarantined: 3, exact: true }, "gap zero: every completed row is joined or quarantined with a reason");
});

test("the deployed path reads real disk artifacts without throwing (whatever their current state)", () => {
  const out = loadCurrentNflResults({ nowIso: new Date().toISOString() });
  assert.ok(["NOT_CONFIGURED", "NO_RESULTS_YET", "SOURCE_STALE", "RESULTS"].includes(out.state), out.state);
  if (out.state === "RESULTS") assert.equal(out.reconciliation.exact, true, "live finals must reconcile gap-zero");
});

test("OVERTIME final joins: every STATUS_FINAL* variant is terminal, and a tied final joins (settlement pushes it later)", () => {
  // Pinned for Program 167 · Release D: preseason games can end tied after one OT period, and
  // ESPN's terminal status may carry an overtime suffix. Both are FINALs to the join; what a tie
  // DOES to a leg is the settlement contract's explicit PUSH, never this adapter's business.
  const out = loadCurrentNflResults({
    nowIso: NOW,
    artifact: { ...fresh, rows: [
      finalRow("71", 27, 30, { statusRaw: "STATUS_FINAL_OVERTIME" }),
      finalRow("72", 17, 17),
    ] },
    scheduleIndex: new Map([schedRow("71"), schedRow("72")]),
  });
  assert.equal(out.state, "RESULTS");
  assert.equal(out.results.length, 2);
  const ot = out.results.find((r) => r.providerEventId === "71");
  assert.equal(ot.contractCheck, "LOSS", "OT final grades through the same contract (home 27-30 = loss)");
  const tie = out.results.find((r) => r.providerEventId === "72");
  assert.equal(tie.contractCheck, "PUSH", "a tied preseason final is an explicit moneyline PUSH — the sport's stated rule");
  assert.deepEqual(out.reconciliation, { completedRows: 2, joined: 2, quarantined: 0, exact: true });
});

test("REAL DATA · the first captured preseason final (CAR@ARI) quarantines for missing pre-event schedule lineage", () => {
  // Program 167 · Release D receipt, pinned so the precedent cannot rot: schedule captures began
  // 2026-08-09; the Aug-7 final can never acquire pre-event lineage, and a backfilled capture
  // would be a post-event reconstruction — forbidden. The lineage gate firing HERE, on the first
  // real final this pipeline ever saw, is the proof the gate is live (Sprint 045/049 lineage rule).
  const artifact = JSON.parse(JSON.stringify({
    sourceAsOf: "2026-08-11T17:40:15Z", generatedAt: "2026-08-11T17:40:15Z",
    rows: [{ providerEventId: "401873271", statusRaw: "STATUS_FINAL", ftHome: 30, ftAway: 33, seasonType: 1, week: 1 }],
  }));
  const out = loadCurrentNflResults({ nowIso: "2026-08-12T18:00:00Z", artifact, scheduleIndex: new Map() });
  assert.equal(out.state, "RESULTS");
  assert.equal(out.results.length, 0);
  assert.equal(out.quarantined.length, 1);
  assert.match(out.quarantined[0].reason, /schedule lineage/);
  assert.equal(out.reconciliation.exact, true);
});
