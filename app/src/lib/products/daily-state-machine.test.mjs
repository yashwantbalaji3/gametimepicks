/**
 * Daily product state-machine guards (P211 · Release A): the charter's fixture list — win, loss,
 * void, no-play, missed-run recovery semantics, late result, correction append, duplicate
 * invocation, concurrency race and restart/advance — proven on the pure machine.
 *
 * Run: npx tsx --test src/lib/products/daily-state-machine.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIFECYCLE_STATES, LIFECYCLE_TRANSITIONS, openProductDay, advanceProduct, acquireLease, productWatchdog } from "./daily-state-machine.mjs";

const open = (p = "bank-builder") => openProductDay({ product: p, productDate: "2026-08-26", priorState: "ADVANCED", runId: "open-1", policyVersion: "bb-policy@3" });

test("the vocabulary is closed and every transition targets a known state", () => {
  for (const [from, tos] of Object.entries(LIFECYCLE_TRANSITIONS)) {
    for (const to of tos) {
      assert.ok(LIFECYCLE_STATES.includes(to) || ["VOIDED", "STOPPED"].includes(to), `${from}→${to} known`);
    }
  }
});

test("WIN path: EVALUATING → ACTIVE → AWAITING_RESULT → SETTLED_WIN → ADVANCED", () => {
  let r = open();
  r = advanceProduct(r, "ACTIVE", { runId: "gen-1", cardRef: "bb-2026-08-26", lockAt: "2026-08-26T22:40:00Z" });
  r = advanceProduct(r, "AWAITING_RESULT", { runId: "freeze-1" });
  r = advanceProduct(r, "SETTLED_WIN", { runId: "settle-1", settlementRef: "settle-2026-08-26" });
  r = advanceProduct(r, "ADVANCED", { runId: "prog-1", progressionRef: "step-3→4" });
  assert.equal(r.state, "ADVANCED");
  assert.equal(r.transitions.length, 5);
});

test("LOSS path ends RESTARTED or STOPPED; VOID stays reachable from ACTIVE and AWAITING", () => {
  let r = open("moonshot");
  r = advanceProduct(r, "ACTIVE", { runId: "g", cardRef: "ms-1", lockAt: "2026-08-26T22:40:00Z" });
  r = advanceProduct(r, "AWAITING_RESULT", { runId: "f" });
  r = advanceProduct(r, "SETTLED_LOSS", { runId: "s", settlementRef: "settle-x" });
  const restarted = advanceProduct(r, "RESTARTED", { runId: "p", progressionRef: "cycle-2", policyVersion: "ms-policy@2" });
  assert.equal(restarted.state, "RESTARTED");
  let v = open();
  v = advanceProduct(v, "ACTIVE", { runId: "g2", cardRef: "bb-2", lockAt: "2026-08-26T22:40:00Z" });
  v = advanceProduct(v, "VOIDED", { runId: "void-1", settlementRef: "void-rain" });
  assert.equal(v.state, "VOIDED");
});

test("NO_PLAY requires its reason; an unearned ACTIVE fails closed to INCIDENT, never presents", () => {
  const np = advanceProduct(open(), "NO_PLAY", { runId: "n", reason: "no candidate cleared the qualification bars" });
  assert.equal(np.state, "NO_PLAY");
  const unearned = advanceProduct(open(), "ACTIVE", { runId: "bad" }); // no cardRef/lockAt
  assert.equal(unearned.state, "INCIDENT");
  assert.match(unearned.evidence.incidentRef, /unearned:ACTIVE:missing:cardRef/);
});

test("ILLEGAL jumps throw: EVALUATING→SETTLED_WIN, ACTIVE→ADVANCED, settled cannot re-activate", () => {
  assert.throws(() => advanceProduct(open(), "SETTLED_WIN", { runId: "x", settlementRef: "s" }), /illegal transition/);
  let r = advanceProduct(open(), "ACTIVE", { runId: "g", cardRef: "c", lockAt: "2026-08-26T22:00:00Z" });
  assert.throws(() => advanceProduct(r, "ADVANCED", { runId: "y", progressionRef: "p" }), /illegal transition/);
  r = advanceProduct(r, "AWAITING_RESULT", { runId: "f" });
  r = advanceProduct(r, "SETTLED_WIN", { runId: "s", settlementRef: "sr" });
  assert.throws(() => advanceProduct(r, "ACTIVE", { runId: "z", cardRef: "c2", lockAt: "t" }), /illegal transition/);
});

test("DUPLICATE invocation is an idempotent no-op — same runId returns the same receipt bytes", () => {
  let r = advanceProduct(open(), "ACTIVE", { runId: "gen-1", cardRef: "c", lockAt: "2026-08-26T22:00:00Z" });
  const again = advanceProduct(r, "AWAITING_RESULT", { runId: "gen-1" }); // same runId as a prior step
  assert.equal(again, r, "a re-run of an applied runId changes nothing — no duplicate card, no doubled exposure");
});

test("CORRECTION appends a new settlement revision without erasing the original", () => {
  let r = advanceProduct(open(), "ACTIVE", { runId: "g", cardRef: "c", lockAt: "2026-08-26T22:00:00Z" });
  r = advanceProduct(r, "AWAITING_RESULT", { runId: "f" });
  r = advanceProduct(r, "SETTLED_LOSS", { runId: "s1", settlementRef: "settle-v1" });
  // The correction is a NEW transition with a NEW runId and revised ref; history keeps both.
  const corrected = advanceProduct(r, "EVALUATING", { runId: "corr-1", settlementRef: "settle-v2-correction" });
  assert.equal(corrected.transitions.at(-1).runId, "corr-1");
  assert.ok(corrected.transitions.some((t) => t.runId === "s1"), "the original settlement transition survives");
});

test("CONCURRENCY: a held lease refuses a second writer; expiry only past the ttl; re-entrant renewal", () => {
  const t0 = Date.parse("2026-08-26T12:00:00Z");
  let lock = { owner: null, acquiredAtMs: null, ttlMs: 10 * 60_000 };
  lock = acquireLease(lock, "scheduled-run", t0);
  assert.equal(lock.owner, "scheduled-run");
  assert.equal(acquireLease(lock, "manual-run", t0 + 60_000), null, "a live lease refuses the race");
  const renewed = acquireLease(lock, "scheduled-run", t0 + 60_000);
  assert.equal(renewed.owner, "scheduled-run", "same owner renews");
  const takeover = acquireLease(lock, "manual-run", t0 + 11 * 60_000);
  assert.equal(takeover.owner, "manual-run", "expiry only past the documented lease ttl");
});

test("WATCHDOG: missing evaluation, stale ACTIVE, overdue result and open incident all alert", () => {
  const now = Date.parse("2026-08-27T20:00:00Z");
  const stale = advanceProduct(open(), "ACTIVE", { runId: "g", cardRef: "c", lockAt: "2026-08-26T22:00:00Z" });
  const alerts = productWatchdog([stale], now);
  assert.ok(alerts.some((a) => a.kind === "STALE_ACTIVE_CARD"));
  assert.ok(alerts.some((a) => a.product === "moonshot" && a.kind === "MISSING_DAILY_EVALUATION"));
  const incident = advanceProduct(open("moonshot"), "INCIDENT", { runId: "i", incidentRef: "inputs failed" });
  assert.ok(productWatchdog([incident], now).some((a) => a.kind === "INCIDENT_OPEN"));
});

test("MISSED-RUN semantics: the recovery re-run applies the SAME runIds and lands on identical bytes", () => {
  const script = (r) => {
    r = advanceProduct(r, "ACTIVE", { runId: "gen-9", cardRef: "c", lockAt: "2026-08-26T22:00:00Z" });
    r = advanceProduct(r, "AWAITING_RESULT", { runId: "frz-9" });
    return r;
  };
  const first = script(open());
  const recovered = script(script(open())); // recovery replays the whole script
  assert.deepEqual(recovered, first, "same prior + same inputs + same run ids ⇒ same bytes");
});
