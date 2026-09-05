/**
 * THE PLAYER MACHINE'S REFUSALS — Program 234 · Release B.
 *
 * Run: npx tsx --test src/lib/simulate/presentation/player-machine.test.mjs
 *
 * The interesting assertions are the ones about what CANNOT happen: a second clock, a chapter past
 * the end, a stale event's response landing on the current one. Those are the failures a reader
 * watching a fixed frame would never be able to report.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlayer, apply, isRunning, atLast, PLAYER_STATES } from "./player-machine.mjs";

const p3 = () => createPlayer({ eventId: "mlb:823577", chapterCount: 3 });

test("a fresh player is idle and still", () => {
  const p = p3();
  assert.equal(p.state, "IDLE");
  assert.equal(isRunning(p), false);
  assert.ok(PLAYER_STATES.includes(p.state));
});

test("one start plays; a second start changes nothing", () => {
  const a = apply(p3(), "START");
  assert.equal(a.state, "PLAYING");
  const b = apply(a, "START");
  assert.equal(b, a, "a double-activated trigger must return the SAME object, or a second clock starts");
});

test("the end of the last chapter is COMPLETED, not chapter n+1", () => {
  let p = apply(p3(), "START");
  p = apply(p, "NEXT"); // 1
  p = apply(p, "NEXT"); // 2 — last
  assert.equal(p.index, 2);
  assert.ok(atLast(p));
  p = apply(p, "NEXT");
  assert.equal(p.state, "COMPLETED");
  assert.equal(p.index, 2, "the cursor must not run past the chapters that exist");
  assert.equal(apply(p, "NEXT"), p, "COMPLETED does not advance");
});

test("previous refuses to go before the first chapter", () => {
  const p = apply(p3(), "START");
  assert.equal(apply(p, "PREV"), p);
});

test("previous from COMPLETED returns to the last chapter, paused", () => {
  let p = apply(p3(), "START");
  p = apply(apply(apply(p, "NEXT"), "NEXT"), "NEXT");
  assert.equal(p.state, "COMPLETED");
  const back = apply(p, "PREV");
  assert.equal(back.state, "PAUSED");
  assert.equal(back.index, 2);
});

test("pause stops the clock; resume restarts it without moving the cursor", () => {
  let p = apply(apply(p3(), "START"), "NEXT");
  const paused = apply(p, "PAUSE");
  assert.equal(isRunning(paused), false);
  assert.equal(paused.index, 1);
  const resumed = apply(paused, "RESUME");
  assert.equal(isRunning(resumed), true);
  assert.equal(resumed.index, 1);
});

test("replay restarts from the beginning and bumps the run counter", () => {
  let p = apply(apply(p3(), "START"), "NEXT");
  const again = apply(p, "REPLAY");
  assert.equal(again.index, 0);
  assert.equal(again.state, "PLAYING");
  assert.equal(again.run, p.run + 1, "the run counter is how a component re-keys animations without owning a timer");
});

test("A LATE RESPONSE FOR ANOTHER EVENT IS DROPPED", () => {
  const p = apply(p3(), "START");
  const stale = apply(p, "NEXT", { eventId: "mlb:999999" });
  assert.equal(stale, p, "a chapter belonging to a different game must never advance this one");
  const own = apply(p, "NEXT", { eventId: "mlb:823577" });
  assert.equal(own.index, 1, "its own event still advances, or the guard has disabled the player");
});

test("a manifest that refused to build yields an UNAVAILABLE player with a reason", () => {
  const p = createPlayer({ eventId: "mlb:1", chapterCount: 0, unavailable: true, reason: "no artifact" });
  assert.equal(p.state, "UNAVAILABLE");
  assert.equal(p.reason, "no artifact");
  assert.equal(apply(p, "START"), p, "an unavailable presentation cannot be started");
});

test("zero chapters is unavailable, not an empty playing state", () => {
  assert.equal(createPlayer({ eventId: "mlb:1", chapterCount: 0 }).state, "UNAVAILABLE");
});

test("FAIL is reachable from every live state and always states a reason", () => {
  for (const start of [p3(), apply(p3(), "START"), apply(apply(p3(), "START"), "PAUSE")]) {
    const failed = apply(start, "FAIL");
    assert.equal(failed.state, "ERROR");
    assert.ok(failed.reason && failed.reason.length > 0, "an error must never be silent");
  }
});

test("bad construction throws rather than producing a player nobody can drive", () => {
  assert.throws(() => createPlayer({ eventId: "", chapterCount: 3 }));
  assert.throws(() => createPlayer({ eventId: "x", chapterCount: -1 }));
  assert.throws(() => createPlayer({ eventId: "x", chapterCount: 1.5 }));
});
