/**
 * The cadence must be able to finish the season.
 *
 * Run: npx tsx --test src/lib/sports/epl/odds-budget.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { firingSpends, parseWeeklySlots, projectSeasonSpend, slotFirings } from "./odds-budget.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const WORKFLOW = fs.readFileSync(path.join(REPO, ".github/workflows/epl-matchweek.yml"), "utf8");
const CAPTURE = fs.readFileSync(path.join(REPO, "docs/receipts/ODDS_AUTHORIZATION_EPL.md"), "utf8");
const LEDGER = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/odds/epl/authorization-ledger.json"), "utf8"));
const FIXTURE_DIR = path.join(APP, "public/data/soccer/epl/fixtures");
const fixtures = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, fs.readdirSync(FIXTURE_DIR).find((f) => f.startsWith("capture-"))), "utf8"),
).rows;

/** The window the capture actually enforces, read from the script rather than restated here. */
const WINDOW_H = Number(
  /--require-kickoff-within-hours",\s*"(\d+)"/.exec(fs.readFileSync(path.join(APP, "scripts/epl/capture-epl-odds.mjs"), "utf8"))?.[1],
);

test("the window is read from the capture, and the ceiling from the receipt — no restated constants", () => {
  // Both numbers exist somewhere authoritative. Copying either into this file would let the guard
  // pass while the thing it guards had changed underneath it.
  assert.ok(Number.isFinite(WINDOW_H) && WINDOW_H > 0, "the capture must declare its kickoff window");
  assert.match(CAPTURE, /500 credits/, "the receipt states the ceiling this projection is checked against");
});

test("LIVE · the committed cadence can pay for the whole season", () => {
  const slots = parseWeeklySlots(WORKFLOW);
  assert.ok(slots.length > 0, "the workflow must declare crons for this to mean anything");
  const first = fixtures.map((f) => Date.parse(f.kickoffIso)).filter(Number.isFinite).sort((a, b) => a - b)[0];

  const out = projectSeasonSpend(fixtures, slots, {
    fromIso: new Date(first).toISOString(),
    creditsPerCall: 2,          // h2h + totals across one region — the provider's own formula
    windowHours: WINDOW_H,
    alreadySpent: LEDGER.cumulativeCredits ?? 0,
    ceiling: 500,
  });
  assert.equal(
    out.verdict, "WITHIN_CEILING",
    `this cadence spends ${out.projectedTotal} of ${out.ceiling} credits across the season — ` +
    `${out.spendingFirings} spending firings of ${out.firings}. Add a slot and it runs dry mid-season, ` +
    `where the symptom is every fixture falling to READY_EXCEPT_ODDS with nothing on the page to explain it.`,
  );
});

test("WITHOUT the fixture guard the same cadence BREACHES — the guard is doing the work", () => {
  // A projection that passes either way proves nothing about the guard. windowHours: null models the
  // old behaviour exactly: every slot calls the provider whether or not a match is coming.
  const slots = parseWeeklySlots(WORKFLOW);
  const first = fixtures.map((f) => Date.parse(f.kickoffIso)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  const unguarded = projectSeasonSpend(fixtures, slots, {
    fromIso: new Date(first).toISOString(), creditsPerCall: 2, windowHours: null,
    alreadySpent: LEDGER.cumulativeCredits ?? 0, ceiling: 500,
  });
  assert.equal(unguarded.verdict, "BREACHES_CEILING", "the unguarded cadence is supposed to be the failing case");
});

test("a kickoff already under way does not justify a purchase", () => {
  // The receipt permits PREGAME prices only, and the capture excludes in-progress events. A window
  // whose only match has kicked off has nothing purchasable in it.
  const now = Date.parse("2026-08-22T12:00:00Z");
  assert.equal(firingSpends(now, [Date.parse("2026-08-22T11:30:00Z")], 30), false, "already started");
  assert.equal(firingSpends(now, [Date.parse("2026-08-22T14:00:00Z")], 30), true, "still ahead");
  assert.equal(firingSpends(now, [now], 30), false, "exactly now is not ahead");
});

test("the window reaches from a night-before slot to the next morning's earliest kickoff", () => {
  // The load-bearing case for choosing 30h. A 21:00 UTC Friday run must be able to buy for an 11:30
  // Saturday kickoff (14.5h) and a 21:00 Sunday run for a Monday 19:00 (22h) — while still refusing
  // a slot whose nearest match is the following weekend.
  const fri21 = Date.parse("2026-08-21T21:00:00Z");
  assert.equal(firingSpends(fri21, [Date.parse("2026-08-22T11:30:00Z")], WINDOW_H), true, "next-morning kickoff must be reachable");
  const sun21 = Date.parse("2026-08-23T21:00:00Z");
  assert.equal(firingSpends(sun21, [Date.parse("2026-08-24T19:00:00Z")], WINDOW_H), true, "Monday evening must be reachable");
  assert.equal(firingSpends(sun21, [Date.parse("2026-08-29T14:00:00Z")], WINDOW_H), false, "next weekend must NOT be");
});

test("a weekly slot fires on its own weekday and no other", () => {
  const firings = slotFirings({ hour: 21, minute: 0, dow: 5 }, Date.parse("2026-08-17T00:00:00Z"), Date.parse("2026-09-01T00:00:00Z"));
  assert.ok(firings.length >= 2);
  for (const t of firings) {
    assert.equal(new Date(t).getUTCDay(), 5);
    assert.equal(new Date(t).getUTCHours(), 21);
  }
});
