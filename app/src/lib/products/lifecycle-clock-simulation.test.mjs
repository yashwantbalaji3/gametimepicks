/**
 * FIXTURE-CLOCK LIFECYCLE SIMULATION (P211 · Release D) — the charter's acceptance run: a scripted
 * multi-day clock drives generation, material refresh, freeze, official settlement, correction,
 * product advance/restart and next-day creation THROUGH THE PURE MODULES, with no manual file
 * edits and no wall clock. Then: manual dispatch and scheduled dispatch compose idempotently under
 * the single-writer lease.
 *
 * Everything here is synthetic; the same functions run in production against the canonical
 * artifacts, so what this proves about mechanics holds there by construction.
 *
 * Run: npx tsx --test src/lib/products/lifecycle-clock-simulation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openProductDay, advanceProduct, acquireLease, productWatchdog } from "./daily-state-machine.mjs";
import { deriveLifecycle } from "./daily-lifecycle-derive.mjs";

const POLICY = "bank-builder@1";

/** One operated day, from the canonical inputs a real day would present. */
function operateDay({ date, priorState, entry, settledDay, portfolioLane, progressionFresh, lockAt }) {
  return deriveLifecycle({
    product: "bank-builder", date, priorState, entry,
    settledDay, portfolioLane, progressionFresh,
    boardHash: `hash-${date}`, lockAt, policyVersion: POLICY,
  });
}

test("THREE-DAY CLOCK: active day WINS and advances; next day opens fresh; loss day RESTARTS; no-play day holds", () => {
  // ── Day 1: a card qualifies, freezes, wins officially, ladder advances ──────────────────────
  const day1 = operateDay({
    date: "2026-09-01", priorState: null,
    entry: { state: "ACTIVE", reason: "1 lane(s) qualified", card: [{ id: "bb-0901-a" }] },
    settledDay: { settledAt: "2026-09-02T06:00:00Z", lanes: [{ product: "bank-builder", step: 2, result: "win", legs: [{}, {}] }] },
    portfolioLane: { status: "active", currentStep: 3 }, progressionFresh: true,
    lockAt: "2026-09-01T16:00:00Z",
  });
  assert.equal(day1.state, "ADVANCED");
  assert.deepEqual(day1.transitions.map((t) => t.to), ["EVALUATING", "ACTIVE", "AWAITING_RESULT", "SETTLED_WIN", "ADVANCED"]);

  // ── Day 2 opens as a NEW receipt carrying yesterday's terminal as prior — never a mutation ──
  const day2 = operateDay({
    date: "2026-09-02", priorState: day1.state,
    entry: { state: "ACTIVE", reason: "1 lane(s) qualified", card: [{ id: "bb-0902-a" }] },
    settledDay: { settledAt: "2026-09-03T06:00:00Z", lanes: [{ product: "bank-builder", step: 3, result: "loss", legs: [{}] }] },
    portfolioLane: { status: "active", currentStep: 1 }, progressionFresh: true,
    lockAt: "2026-09-02T16:00:00Z",
  });
  assert.equal(day2.prior, "ADVANCED", "the new day KNOWS where the ladder stood");
  assert.equal(day2.state, "RESTARTED", "an official loss restarts at step 1 per the frozen policy");

  // ── Day 3: evaluation completes, nothing qualifies — the hold is the product's answer ───────
  const day3 = operateDay({
    date: "2026-09-03", priorState: day2.state,
    entry: { state: "NO_PLAY", reason: "nothing met policy" },
  });
  assert.equal(day3.state, "NO_PLAY");
  assert.equal(day3.transitions.length, 2, "no invented transitions on a hold day");
});

test("MATERIAL REFRESH pre-lock is a re-derivation, not a mutation: same runIds ⇒ same bytes, new card ⇒ new runId", () => {
  const base = {
    date: "2026-09-01", priorState: null,
    entry: { state: "ACTIVE", reason: "r", card: [{ id: "bb-a" }] }, lockAt: "2026-09-01T16:00:00Z",
  };
  const first = operateDay(base);
  const replay = operateDay(base);
  assert.deepEqual(replay, first, "an unchanged morning re-derives to identical bytes");
  const refreshed = operateDay({ ...base, entry: { state: "ACTIVE", reason: "r", card: [{ id: "bb-a-v2" }] } });
  assert.notEqual(refreshed.evidence.cardRef, first.evidence.cardRef, "a material change produces a NEW receipt, never an edit of the old one");
});

test("CORRECTION: a revised official settlement lands as an appended revision; the original transition survives", () => {
  let r = openProductDay({ product: "bank-builder", productDate: "2026-09-01", runId: "open-1", policyVersion: POLICY });
  r = advanceProduct(r, "ACTIVE", { runId: "gen-1", cardRef: "c", lockAt: "2026-09-01T16:00:00Z" });
  r = advanceProduct(r, "AWAITING_RESULT", { runId: "frz-1" });
  r = advanceProduct(r, "SETTLED_WIN", { runId: "settle-v1", settlementRef: "settled/2026-09-01.json@v1" });
  const corrected = advanceProduct(r, "EVALUATING", { runId: "settle-v2-correction", settlementRef: "settled/2026-09-01.json@v2-correction" });
  assert.ok(corrected.transitions.some((t) => t.runId === "settle-v1"), "history keeps the original grade");
  assert.equal(corrected.evidence.settlementRef, "settled/2026-09-01.json@v2-correction", "the evidence now points at the revision");
});

test("DISPATCH COMPOSITION: scheduled + manual runs interleave idempotently under the lease; the day ends single-written", () => {
  const t0 = Date.parse("2026-09-01T12:00:00Z");
  let lock = { owner: null, acquiredAtMs: null, ttlMs: 10 * 60_000 };

  // scheduled run takes the lease and applies the generation step
  lock = acquireLease(lock, "scheduled", t0);
  let r = openProductDay({ product: "bank-builder", productDate: "2026-09-01", runId: "open-1", policyVersion: POLICY });
  r = advanceProduct(r, "ACTIVE", { runId: "gen-1", cardRef: "c", lockAt: "2026-09-01T16:00:00Z" });

  // a manual dispatch fires concurrently: the live lease refuses it — it must wait, not race
  assert.equal(acquireLease(lock, "manual", t0 + 30_000), null);

  // the scheduled run dies silently; past the ttl the manual dispatch recovers the lease
  lock = acquireLease(lock, "manual", t0 + 11 * 60_000);
  assert.equal(lock.owner, "manual");

  // recovery REPLAYS the same script: applied steps no-op, the missing step applies once
  const replayed = advanceProduct(r, "AWAITING_RESULT", { runId: "gen-1" }); // duplicate of an applied runId
  assert.equal(replayed, r, "the applied step refuses to double-apply under a recovery replay");
  const completed = advanceProduct(r, "AWAITING_RESULT", { runId: "frz-1" });
  assert.equal(completed.state, "AWAITING_RESULT");
  assert.equal(completed.transitions.length, 3, "exactly one freeze — no duplicate exposure under composed dispatch");
});

test("WATCHDOG over the simulated day: silence is impossible — every anomaly types an alert", () => {
  const now = Date.parse("2026-09-02T20:00:00Z");
  const staleActive = (() => {
    let r = openProductDay({ product: "bank-builder", productDate: "2026-09-01", runId: "o", policyVersion: POLICY });
    return advanceProduct(r, "ACTIVE", { runId: "g", cardRef: "c", lockAt: "2026-09-01T16:00:00Z" });
  })();
  const alerts = productWatchdog([staleActive], now);
  assert.ok(alerts.some((a) => a.product === "bank-builder" && a.kind === "STALE_ACTIVE_CARD"));
  assert.ok(alerts.some((a) => a.product === "moonshot" && a.kind === "MISSING_DAILY_EVALUATION"), "the absent product is itself the finding");
});
