/**
 * Release-history + reality-gated watch guards (Program 162 · Release C).
 *
 * The two invariants that make the command center honest:
 *   1. PRUNING — a shipped release lives in history and ONLY in history: no work-board card may
 *      reference a history commit, and no history entry may still be an open ticket.
 *   2. NO INVENTED RECEIPTS — every entry either carries its commit sha or says UNRECORDED in
 *      plain words; watches carry parseable observation times and can never be closed by code.
 *
 * Run: npx tsx --test src/lib/launch/release-history.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { RELEASE_HISTORY, RELEASE_HISTORY_VERSION } from "./release-history.mjs";
import { REALITY_GATED_WATCHES, withCountdown } from "./watches.mjs";
import { buildWorkBoard } from "./work-board.mjs";

test("history schema: newest first, unique recorded commits, ISO dates, outcome + departments on every row", () => {
  assert.equal(RELEASE_HISTORY_VERSION, 1);
  assert.ok(RELEASE_HISTORY.length >= 15, "Programs 144-162 are covered");
  const commits = RELEASE_HISTORY.map((r) => r.commit).filter(Boolean);
  assert.equal(new Set(commits).size, commits.length, "a commit ships once");
  let prev = "9999-99-99";
  for (const r of RELEASE_HISTORY) {
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, r.program);
    assert.ok(r.date <= prev, `newest first — ${r.program} out of order`);
    prev = r.date;
    assert.ok(r.outcome.length > 30, `${r.program}: an outcome is a sentence, not a label`);
    assert.ok(Array.isArray(r.departments) && r.departments.length >= 1, r.program);
    if (r.commit === null) assert.match(r.outcome, /UNRECORDED/, "a missing receipt says so in words — never invented");
  }
});

test("PRUNING · shipped releases are absent from every active lane", () => {
  const board = buildWorkBoard();
  const cards = [...Object.values(board.columns).flat(), ...board.founderQueue];
  const commits = RELEASE_HISTORY.map((r) => r.commit).filter(Boolean);
  for (const c of cards) {
    const text = `${c.id} ${c.title} ${c.evidence ?? ""} ${c.nextAction}`;
    for (const sha of commits) assert.ok(!text.includes(sha), `${c.id} references shipped commit ${sha} — history is not a lane`);
  }
});

test("watches: parseable observation times, evidence named, REALITY_GATED cards on the board but never in today's sprint", () => {
  for (const w of REALITY_GATED_WATCHES) {
    assert.ok(Number.isFinite(Date.parse(w.observeAtUtc)), w.id);
    assert.ok(w.evidenceToInspect.length > 40, `${w.id} names concrete evidence to inspect, not a label`);
    assert.ok(w.productiveBefore.length > 20, `${w.id} names productive pre-work — a watch is not idle time`);
  }
  const board = buildWorkBoard();
  const gated = board.columns.REALITY_GATED ?? [];
  assert.equal(gated.length, REALITY_GATED_WATCHES.length, "every watch is a visible card");
  assert.ok(board.sprints.today.every((t) => t.state !== "REALITY_GATED"), "time-gated work never masquerades as today's execution");
});

test("withCountdown: pure clock parameter, soonest first, due flags honest on both sides", () => {
  const view = withCountdown("2026-08-13T15:00:00Z"); // past the Aug-13 cadence slot (the Aug-12 run was verified and the watch moved forward)
  for (let i = 1; i < view.length; i++) assert.ok(Date.parse(view[i - 1].observeAtUtc) <= Date.parse(view[i].observeAtUtc));
  const cadence = view.find((w) => w.id === "watch-daily-cadence");
  assert.equal(cadence.due, true, "a passed observation time reads as due — it never silently vanishes");
  const nba = view.find((w) => w.id === "watch-nba-first-joined-final");
  assert.equal(nba.due, false);
  assert.equal(nba.overdue, false);
  // OVERDUE is a distinct hygiene state: >24h past the observation time without an update.
  const old = withCountdown("2026-08-20T00:00:00Z").find((w) => w.id === "watch-daily-cadence");
  assert.equal(old.overdue, true, "a missed observation cannot rot quietly as merely DUE");
  assert.ok(nba.hoursUntil > 24 * 30, "the NBA watch is honestly months out");
  assert.throws(() => withCountdown("not-a-clock"));
});
