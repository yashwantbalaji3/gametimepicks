/**
 * UFC STALE-CARD GATE (Sprint 018 · Phase 3 — product honesty).
 *
 * /ufc decided "is this the next card?" purely by comparing the newest SETTLED event's name to the current
 * card's name. When the newest settled event was a DIFFERENT (older) card, that check said "not settled",
 * and a card whose date had already passed kept rendering as "Next · <event> · <date>" with its full fight
 * card and market reads. UFC 329 (2026-07-11) was still presented as upcoming two weeks later.
 *
 * A name comparison cannot answer a time question. These tests pin that the page also gates on DATE, reusing
 * the same isEventPast() helper the homepage path already used — one rule, not two.
 *
 * Run: npx tsx --test src/lib/ufc-stale-card-gate.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isEventPast } from "./home/load-spotlight.ts";

const page = fs.readFileSync(path.join(process.cwd(), "src", "app", "ufc", "page.tsx"), "utf8");

test("the page gates on DATE, not only on the settled event's name", () => {
  assert.match(page, /import \{ isEventPast \} from/, "reuses the shared helper — no second date rule");
  assert.match(page, /const cardIsPast = isEventPast\(/, "derives a past-card flag");
  assert.match(page, /const notUpcoming = ufcSettled \|\| cardIsPast/, "either condition means 'not upcoming'");
});

test("everything that presents the card as UPCOMING is suppressed by notUpcoming, not by ufcSettled alone", () => {
  // These are the surfaces that render the fight card / engine reads / hero as an active slate.
  for (const [label, re] of [
    ["hero stats", /const heroStats = notUpcoming/],
    ["fight reports", /const fightReports = notUpcoming \?/],
    ["engine rows", /const engineRows = !notUpcoming/],
    ["tabs", /const tabs: ShellTab\[\] = notUpcoming/],
    ["status kind", /statusKind=\{notUpcoming \?/],
  ]) {
    assert.match(page, re, `${label} must key off notUpcoming`);
  }
});

test("the settled-specific COPY still keys off ufcSettled — a past card is not claimed to be settled", () => {
  // Only a genuinely settled event may say "previous event settled → see Results".
  assert.match(page, /ufcSettled\s*\n?\s*\?\s*`Previous event settled/, "settled copy stays settled-only");
  assert.match(page, /cardIsPast\s*\n?\s*\?\s*`\$\{eventName\} has finished — awaiting official results`/,
    "a past-but-unsettled card says results are pending, never 'Next'");
});

test("isEventPast is the shared rule and behaves correctly at the boundary", () => {
  assert.equal(isEventPast("2026-07-25", "2026-07-11T00:00:00Z"), true, "two weeks ago is past");
  assert.equal(isEventPast("2026-07-25", "2026-07-25T23:00:00Z"), false, "same day is NOT past — card is tonight");
  assert.equal(isEventPast("2026-07-25", "2026-08-01T00:00:00Z"), false, "future is not past");
  assert.equal(isEventPast("2026-07-25", undefined), false, "unknown date fails OPEN (never hides a real card)");
});

test("real artifact: the shipped UFC card is correctly classified today", () => {
  const dir = path.join(process.cwd(), "public", "data", "ufc");
  const sched = JSON.parse(fs.readFileSync(path.join(dir, "schedule-latest.json"), "utf8"));
  assert.ok(sched.eventDate, "the schedule artifact carries an eventDate to gate on");
  // Whatever today is, the classification must be a pure function of the two dates — asserted, not assumed.
  const asOf = "2026-07-25";
  const past = isEventPast(asOf, sched.eventDate);
  assert.equal(past, sched.eventDate.slice(0, 10) < asOf, "classification matches a plain date comparison");
});
