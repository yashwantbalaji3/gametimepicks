/**
 * Session 2 · the Ask answer's DISPLAY clean-up. Taken from real Production answers on 2026-09-30, which showed the
 * verifier's citation tokens ("[E2:report]") and raw ISO timestamps to readers. Presentation only: every word and
 * number that is not a citation token or a timestamp's spelling must survive unchanged.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { listItemOf, readableAnswer } from "./readable-answer.mjs";

test("citation tokens are removed in every observed shape, and nothing else is", () => {
  assert.equal(readableAnswer("Moneyline pick is NYY, confidence LEAN. [E2:report]"), "Moneyline pick is NYY, confidence LEAN.");
  assert.equal(readableAnswer("the next published forecasts are for 2026-10-01 [E1.1, E2.1]."), "the next published forecasts are for 2026-10-01.");
  assert.equal(readableAnswer("1 of 4 MLB games in progress ([E2:live])."), "1 of 4 MLB games in progress.");
  assert.equal(readableAnswer("as no forecast is published [E4.1]"), "as no forecast is published");
  // Brackets that are not citations stay.
  assert.equal(readableAnswer("PIT [away] 54.4%"), "PIT [away] 54.4%");
});

test("a markdown link keeps its label; the href is never shown as text", () => {
  assert.equal(readableAnswer("See [today's slate](/today/) for more."), "See today's slate for more.");
  // A line that is ONLY a link repeats the chip under the answer — dropped rather than shown twice.
  assert.equal(readableAnswer("From GameTimePicks' own data:\n\n- one fact\n\n- [Open Suggested cards](/build/)"), "Here's what GameTimePicks holds on that:\n\n- one fact");
});

test("an ISO timestamp is shown as the same instant in ET; a bare date is untouched", () => {
  assert.equal(readableAnswer("(updated 2026-09-30T11:16:33.113Z)"), "(updated Sep 30, 7:16 AM ET)");
  assert.equal(readableAnswer("as of 2026-09-30T19:52:52.761Z, 1 game"), "as of Sep 30, 3:52 PM ET, 1 game");
  assert.equal(readableAnswer("on 2026-10-02T00:15Z"), "on Oct 1, 8:15 PM ET");
  assert.equal(readableAnswer("results for 2026-09-29"), "results for 2026-09-29");
});

test("every number in a real answer survives the clean-up", () => {
  const real = "PHI @ ATL (MLB) (updated 2026-09-30T11:16:33.113Z): Moneyline pick is PHI (model probability 51.2%, market-implied 50.9%, confidence LEAN). Run line pick is ATL +1.5 at 1.5 [E2:report]";
  const numbers = (t) => (t.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "").match(/\d+(?:\.\d+)?/g) ?? []);
  assert.deepEqual(numbers(readableAnswer(real)).filter((n) => !["30", "7", "16"].includes(n)), numbers(real).filter((n) => !["2"].includes(n)));
});

test("🔴 every bullet style a writer uses is a list item; bold is not (Production: Gemini's '* ' lists ran together)", () => {
  assert.equal(listItemOf("* **PHI 4, ATL 3** (Bottom 10th)"), "**PHI 4, ATL 3** (Bottom 10th)");
  assert.equal(listItemOf("- one"), "one");
  assert.equal(listItemOf("• one"), "one");
  assert.equal(listItemOf("1. one"), "one");
  assert.equal(listItemOf("2) one"), "one");
  assert.equal(listItemOf("**Bank Builder** was won"), null, "a bold opener is emphasis, not a bullet");
  assert.equal(listItemOf("Plain sentence."), null);
});
