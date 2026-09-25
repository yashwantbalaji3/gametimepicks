/**
 * KICKOFF-AWARE REFRESH — the deadline, and the two ways of spending money for nothing.
 *
 * Run: npx tsx --test src/lib/ops/kickoff-refresh.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { decideKickoffRefresh, FRESH_MINUTES, LEAD_MINUTES } from "./kickoff-refresh.mjs";

const SCHED = [
  { providerEventId: "401872953", shortName: "LAC @ BUF", dateUtc: "2026-09-27T17:00Z" },
  { providerEventId: "401872958", shortName: "ARI @ SF", dateUtc: "2026-09-27T20:05Z" },
  { providerEventId: "401872962", shortName: "LAR @ DEN", dateUtc: "2026-09-27T20:25Z" },
];
const capturedAt = (iso) => ({ propMarkets: { state: "PROBED" }, propPrices: { capturedAt: iso } });

test("it dispatches inside the pregame window a wall-clock cron cannot reach", () => {
  /* T-30m: the slot the old cadence asked for and, at a measured minimum delay of 1h40m, the one
     GitHub could never deliver. A checker that runs often reaches it. */
  const d = decideKickoffRefresh({ scheduleRows: SCHED, capture: capturedAt("2026-09-27T09:00:00Z"), nowIso: "2026-09-27T16:30:00Z" });
  assert.equal(d.decision, "DISPATCH");
  assert.equal(d.state, "STALE_BEFORE_KICKOFF");
  assert.equal(d.events[0].providerEventId, "401872953");
  assert.equal(d.events[0].minutesToKickoff, 30);
});

test("RECOVERY DOES NOT DUPLICATE A RUN THAT ALREADY SATISFIED ITS SLOT", () => {
  /*
   * ⚠ THE EXPENSIVE FAILURE. The Sunday sweep cron is 78 credits. If it fires at 13:00Z and lands
   * three hours late at 16:00Z — normal delivery here — a checker that judged freshness by the CRON
   * rather than by the artifact would see "no run near the slot" at 16:15Z and buy the entire week
   * a second time, 30 minutes before kickoff.
   *
   * So freshness is read from propPrices.capturedAt: the prices that actually landed, not the run
   * that was supposed to produce them.
   */
  const d = decideKickoffRefresh({ scheduleRows: SCHED, capture: capturedAt("2026-09-27T16:00:00Z"), nowIso: "2026-09-27T16:15:00Z" });
  assert.equal(d.decision, "HOLD");
  assert.equal(d.state, "ALREADY_FRESH", "a late sweep that DID land must suppress the recovery");

  /* The same guard from the other side: a run that has started but not yet written prices. */
  const inflight = decideKickoffRefresh({ scheduleRows: SCHED, capture: capturedAt("2026-09-27T09:00:00Z"), nowIso: "2026-09-27T16:30:00Z", runInFlight: true });
  assert.equal(inflight.decision, "HOLD");
  assert.equal(inflight.state, "RUN_IN_FLIGHT", "a queued or running sweep must not be dispatched on top of");

  /* And once the prices really are stale, it must still fire — the guard is not an off switch. */
  const stale = decideKickoffRefresh({ scheduleRows: SCHED, capture: capturedAt(`2026-09-27T${String(16 - Math.ceil(FRESH_MINUTES / 60) - 1).padStart(2, "0")}:00:00Z`), nowIso: "2026-09-27T16:30:00Z" });
  assert.equal(stale.decision, "DISPATCH");
});

test("A STARTED EVENT IS NEVER RE-PROBED AS A PREGAME EVENT", () => {
  /*
   * The capture's window is pre-start only, so a dispatch triggered by an in-progress game buys
   * nothing for it — and would re-trigger for the game's whole duration, a spend loop driven by a
   * fixture that can no longer be priced.
   */
  const atKickoff = decideKickoffRefresh({ scheduleRows: [SCHED[0]], capture: capturedAt("2026-09-27T09:00:00Z"), nowIso: "2026-09-27T17:00:00Z" });
  assert.equal(atKickoff.decision, "HOLD");
  assert.equal(atKickoff.state, "NO_KICKOFF_SOON", "a game at its kickoff instant is no longer pregame");

  const inPlay = decideKickoffRefresh({ scheduleRows: [SCHED[0]], capture: capturedAt("2026-09-27T09:00:00Z"), nowIso: "2026-09-27T18:30:00Z" });
  assert.equal(inPlay.decision, "HOLD");
  assert.deepEqual(inPlay.events, [], "an in-progress game is not evidence for buying anything");

  /* A mixed slate keeps only the games that have not started. */
  const mixed = decideKickoffRefresh({ scheduleRows: SCHED, capture: capturedAt("2026-09-27T09:00:00Z"), nowIso: "2026-09-27T18:30:00Z" });
  assert.equal(mixed.decision, "DISPATCH");
  assert.deepEqual(mixed.events.map((e) => e.providerEventId), ["401872958", "401872962"],
    "the 17:00Z game has started and must be gone; the later two remain");
});

test("a far-away slate buys nothing, and an unusable clock refuses", () => {
  const far = decideKickoffRefresh({ scheduleRows: SCHED, capture: capturedAt("2026-09-25T09:00:00Z"), nowIso: "2026-09-25T16:30:00Z" });
  assert.equal(far.decision, "HOLD");
  assert.equal(far.state, "NO_KICKOFF_SOON", `nothing within ${LEAD_MINUTES} minutes is not a reason to spend`);

  const noClock = decideKickoffRefresh({ scheduleRows: SCHED, capture: capturedAt("2026-09-27T09:00:00Z"), nowIso: "not-a-time" });
  assert.equal(noClock.decision, "REFUSE", "a refresh is never dispatched on a guessed time");
});

test("a capture that was never probed is stale by definition, not fresh", () => {
  const never = decideKickoffRefresh({ scheduleRows: SCHED, capture: { propMarkets: { state: "NOT_PROBED" }, propPrices: null }, nowIso: "2026-09-27T16:30:00Z" });
  assert.equal(never.decision, "DISPATCH");
  assert.equal(never.state, "NEVER_PROBED_BEFORE_KICKOFF");
});
