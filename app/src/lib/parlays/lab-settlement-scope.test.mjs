/**
 * WHAT THE LAB SETTLER CAN SEE, AND WHAT IT MAY CONCLUDE.
 *
 * Run: npx tsx --test src/lib/parlays/lab-settlement-scope.test.mjs
 *
 * Two defects found on 2026-08-22, either of which alone would have corrupted the record.
 *
 * IT COULD ONLY SEE BASEBALL. The settler read one directory — risk-ladder, which is MLB's. UFC had
 * been publishing paper cards to risk-ladder-ufc since 2026-08-18 and EPL to risk-ladder-epl the
 * same night, and neither was ever opened. Three settlement receipts existed and all three were
 * MLB-only. gradeUfcLeg — written specifically so a non-MLB card could not be "publishable and
 * ungradeable" — had never once been called, because the only ladder in scope contained nothing but
 * MLB legs.
 *
 * IT GRADED FIGHTS THAT HAD NOT HAPPENED. results-latest.json is not a snapshot of one event; it is
 * a historical corpus of 1,545 bouts across 126 events. The loader indexed every one by fighter name
 * with no date check, so asked to settle the 2026-08-22 card it matched Gregory Rodrigues to a March
 * bout, Roman Dolidze to a March loss and Gauge Young to April, and reported "3/5 cards decided" for
 * fights nobody had fought. One --apply away from a receipt full of fabricated outcomes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const SRC = fs.readFileSync(path.join(APP, "scripts/parlays/settle-lab-cards.mjs"), "utf8");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("the settler reads EVERY sport's ladder, not just baseball's", () => {
  assert.match(code, /risk-ladder-ufc/, "UFC cards must be in scope");
  assert.match(code, /risk-ladder-epl/, "EPL cards must be in scope");
  // Named in one map, so a fourth sport is one entry rather than a fourth place to forget.
  assert.match(code, /LADDER_DIRS\s*=\s*\{/);
});

test("a ladder is recognised by HAVING CARDS, not by a state field", () => {
  /*
   * MLB's ladder carries no `state` — it predates the convention — while UFC's and EPL's say
   * PUBLISHED. Requiring the field excluded every MLB ladder ever written, which is the one sport
   * that had been settling. Caught by re-running a settled day and finding it suddenly unobservable.
   */
  assert.match(code, /doc\?\.state && doc\.state !== "PUBLISHED"/, "a missing state must not exclude a ladder");
  assert.match(code, /Array\.isArray\(doc\?\.cards\)/);
});

test("A UFC RESULT MAY ONLY SETTLE THE CARD IT BELONGS TO", () => {
  // The whole defect in one line: the index must be confined to the date being settled.
  assert.match(code, /r\.eventDate !== DATE/, "results must be filtered to the card's own event date");
});

test("LIVE · the corpus is historical, which is why the date filter is load-bearing", () => {
  const p = path.join(APP, "public/data/ufc/results-latest.json");
  if (!fs.existsSync(p)) return;
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  const dates = new Set((doc.results ?? []).map((r) => r.eventDate));
  // If this ever became a single-event snapshot the filter would still be correct, but the premise
  // recorded above would have changed and the next reader deserves to know.
  assert.ok(dates.size > 1, "results-latest.json is a corpus spanning many events, not one card");
  assert.ok((doc.results ?? []).length > 100, "and it is large enough that a name will collide");
});

test("every leg carries a sport, defaulted from the ladder it came from", () => {
  // A leg with no sport routes to the MLB box-score reader, asks StatsAPI for an undefined gamePk
  // and grades pending forever. Single-sport ladders should not have to repeat themselves per leg.
  assert.match(code, /sport: l\.sport \?\? sport/);
});

test("a missing display label does not stop a grade", () => {
  // MLB's cards carry tierLabel; UFC's and EPL's carry only tier. The settler crashed on the
  // missing caption — refusing to grade over a cosmetic difference.
  assert.match(code, /card\.tierLabel \?\? card\.tier/);
});

test("the UFC ladder is dated by its CARD, not by the day it was built", () => {
  const ladder = fs.readFileSync(path.join(APP, "scripts/ufc/build-ufc-ladder.mjs"), "utf8");
  // A ladder written 2026-08-18 for an event on 2026-08-22 baked the wrong date into every slipId,
  // and the settler looks a ladder up BY DATE — so it could never be found on the night it mattered.
  assert.match(ladder, /card\?\.event\?\.slateDate \?\? etDay\(NOW\)/);
});
