/**
 * Tests for the ledger calendar model. Verifies it's a faithful PRESENTATION transform of the canonical
 * daily-summary (never recomputes money) + the derived "feel" stats are correct against the REAL days.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildLedgerCalendar } from "./ledger-calendar.ts";

const summary = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "mr-dub", "daily-summary.json"), "utf8"));
const days = summary.days;

test("builds a month grid in weeks of 7, days land on the correct weekday", () => {
  const { months } = buildLedgerCalendar(days);
  assert.ok(months.length >= 1, "at least one month");
  const june = months.find((m) => m.key === "2026-06");
  assert.ok(june, "June 2026 present");
  for (const w of june.weeks) assert.equal(w.length, 7, "each week has 7 cells");
  // June 1 2026 is a Monday → index 1 in a Sunday-first grid.
  const firstReal = june.weeks[0].findIndex((c) => c.dayNum === 1);
  assert.equal(firstReal, 1, "June 1 2026 sits in the Monday column");
  // a known settled day maps into the grid with its real P/L (not recomputed)
  const cell13 = june.weeks.flat().find((c) => c.date === "2026-06-13");
  assert.equal(cell13.result, "win");
  assert.equal(cell13.day.pl, days.find((d) => d.date === "2026-06-13").pl, "cell P/L is the raw daily-summary value");
});

test("stats are read straight from the settled days (no recompute)", () => {
  const { stats } = buildLedgerCalendar(days);
  const closings = days.map((d) => d.closing);
  assert.equal(stats.highWaterMark, Math.max(...closings), "HWM = max closing");
  assert.equal(stats.currentBankroll, days[days.length - 1].closing, "current = latest closing");
  assert.ok(stats.bestDay.pl >= stats.worstDay.pl, "best ≥ worst");
  // best day = max daily P/L in the dataset (June-24, the +$10,089.23 banking day)
  const maxPl = Math.max(...days.map((d) => d.pl));
  assert.equal(stats.bestDay.pl, maxPl);
  assert.equal(stats.bestDay.date, days.find((d) => d.pl === maxPl).date);
});

test("current streak walks settled days from newest, skipping flat days", () => {
  // Synthetic: ...win, win, flat, loss  → newest is a loss → streak L1
  const synth = [
    { date: "2026-07-01", pl: 50, opening: 100, closing: 150, wins: 1, losses: 0, voids: 0, pending: 0, staked: 100, returned: 150, events: [] },
    { date: "2026-07-02", pl: 30, opening: 150, closing: 180, wins: 1, losses: 0, voids: 0, pending: 0, staked: 100, returned: 130, events: [] },
    { date: "2026-07-03", pl: 0, opening: 180, closing: 180, wins: 0, losses: 0, voids: 1, pending: 0, staked: 0, returned: 0, events: [] },
    { date: "2026-07-04", pl: -40, opening: 180, closing: 140, wins: 0, losses: 1, voids: 0, pending: 0, staked: 40, returned: 0, events: [] },
  ];
  const { stats } = buildLedgerCalendar(synth);
  assert.deepEqual(stats.currentStreak, { kind: "L", len: 1 });
  // drop the trailing loss → newest settled is the win (flat skipped) → W2
  const { stats: s2 } = buildLedgerCalendar(synth.slice(0, 3));
  assert.deepEqual(s2.currentStreak, { kind: "W", len: 2 });
});

test("per-day product icons come from the events' categories", () => {
  const { months } = buildLedgerCalendar(days);
  const cell = months.flatMap((m) => m.weeks.flat()).find((c) => c.day && c.day.events.length);
  assert.ok(cell.products.length >= 1, "a settled day with events lists ≥1 product");
  assert.ok(cell.products.every((p) => typeof p === "string"));
});

test("empty input is safe (no crash, no fabricated bankroll)", () => {
  const { months, stats } = buildLedgerCalendar([]);
  assert.deepEqual(months, []);
  assert.equal(stats.currentBankroll, 100, "defaults to starting bankroll, not a fabricated value");
  assert.equal(stats.bestDay, null);
});
