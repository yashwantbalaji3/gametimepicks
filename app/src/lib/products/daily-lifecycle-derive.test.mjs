/**
 * Lifecycle derivation guards (P211 · Release A) — the bridge from canonical authorities to the
 * closed vocabulary, proven on SYNTHETIC artifacts (no live reads — live data would make these
 * fixtures rot with the slate). Every path: no-play, off-season, operational gap, active, awaiting,
 * win→advanced, loss→restarted/stopped, void, stale-progression stop, unearned-active fail-close.
 *
 * Run: npx tsx --test src/lib/products/daily-lifecycle-derive.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveLifecycle } from "./daily-lifecycle-derive.mjs";

const base = (over = {}) => ({
  product: "bank-builder", date: "2026-08-26", boardHash: "abc123", lockAt: "2026-08-26T15:52:00Z",
  policyVersion: "activation-policy:pre-freeze", entry: { state: "ACTIVE", reason: "1 lane(s) qualified", card: [{ id: "bb-a-1" }] },
  settledDay: null, portfolioLane: null, progressionFresh: false, ...over,
});

test("NO_PLAY and OFF_SEASON pass the authority's reason through verbatim", () => {
  const np = deriveLifecycle(base({ entry: { state: "NO_PLAY", reason: "nothing met policy — a hold is the answer" } }));
  assert.equal(np.state, "NO_PLAY");
  assert.equal(np.evidence.reason, "nothing met policy — a hold is the answer");
  const os = deriveLifecycle(base({ entry: { state: "OFF_SEASON", reason: "league dormant by its own schedule" } }));
  assert.equal(os.state, "OFF_SEASON");
});

test("operational gaps type as INCIDENT, never as a product decision", () => {
  for (const state of ["INPUTS_MISSING", "NOT_RUN", "STALE", "INCIDENT"]) {
    const r = deriveLifecycle(base({ entry: { state, reason: "no board generated" } }));
    assert.equal(r.state, "INCIDENT", state);
    assert.match(r.evidence.incidentRef, new RegExp(`^${state}:`));
  }
});

test("ACTIVE without settlement lanes stays ACTIVE; empty settle rows (no legs) do not move it", () => {
  const live = deriveLifecycle(base());
  assert.equal(live.state, "ACTIVE");
  assert.equal(live.evidence.cardRef, "bb-a-1");
  const emptyRows = deriveLifecycle(base({ settledDay: { settledAt: "2026-08-27T05:59:00Z", lanes: [{ product: "bank-builder", step: 1, result: "pending", legs: [] }] } }));
  assert.equal(emptyRows.state, "ACTIVE", "a stake row with no legs is not a card under settlement");
});

test("an ACTIVE claim without a lock stamp fails closed — unearned, typed", () => {
  const r = deriveLifecycle(base({ lockAt: null }));
  assert.equal(r.state, "INCIDENT");
  assert.match(r.evidence.incidentRef, /unearned:ACTIVE/);
});

test("real pending lanes move to AWAITING_RESULT; a WIN with fresh progression lands ADVANCED", () => {
  const lanes = [{ product: "bank-builder", step: 3, result: "pending", legs: [{}, {}] }];
  const awaiting = deriveLifecycle(base({ settledDay: { settledAt: "2026-08-27T05:59:00Z", lanes } }));
  assert.equal(awaiting.state, "AWAITING_RESULT");
  const won = deriveLifecycle(base({
    settledDay: { settledAt: "2026-08-27T05:59:00Z", lanes: [{ ...lanes[0], result: "win" }] },
    portfolioLane: { status: "active", currentStep: 4 }, progressionFresh: true,
  }));
  assert.equal(won.state, "ADVANCED");
  assert.equal(won.evidence.progressionRef, "portfolio:bank-builder:step3→4");
  assert.equal(won.evidence.settlementRef, "settled/2026-08-26.json@2026-08-27T05:59:00Z");
});

test("a LOSS lands RESTARTED at step 1 or STOPPED per the portfolio; VOID types as VOIDED", () => {
  const lossLane = [{ product: "moonshot", step: 2, result: "loss", legs: [{}] }];
  const restarted = deriveLifecycle(base({ product: "moonshot", entry: { state: "ACTIVE", card: [{ id: "ms-1" }] }, settledDay: { settledAt: "s", lanes: lossLane }, portfolioLane: { status: "active", currentStep: 1 }, progressionFresh: true }));
  assert.equal(restarted.state, "RESTARTED");
  const stopped = deriveLifecycle(base({ product: "moonshot", entry: { state: "ACTIVE", card: [{ id: "ms-1" }] }, settledDay: { settledAt: "s", lanes: lossLane }, portfolioLane: { status: "stopped", currentStep: 2 }, progressionFresh: true }));
  assert.equal(stopped.state, "STOPPED");
  const voided = deriveLifecycle(base({ settledDay: { settledAt: "s", lanes: [{ product: "bank-builder", step: 1, result: "void", legs: [{}] }] } }));
  assert.equal(voided.state, "VOIDED");
});

test("stale progression evidence stays unclaimed — the day stops honestly at SETTLED_*", () => {
  const r = deriveLifecycle(base({
    settledDay: { settledAt: "s", lanes: [{ product: "bank-builder", step: 3, result: "win", legs: [{}] }] },
    portfolioLane: { status: "active", currentStep: 4 }, progressionFresh: false,
  }));
  assert.equal(r.state, "SETTLED_WIN", "current-state portfolio may only speak for the latest settled day");
});

test("determinism: the same authorities derive byte-identical receipts on replay", () => {
  const input = base({ settledDay: { settledAt: "s", lanes: [{ product: "bank-builder", step: 1, result: "pending", legs: [{}] }] } });
  assert.deepEqual(deriveLifecycle(input), deriveLifecycle(input));
});
