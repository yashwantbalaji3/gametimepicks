/**
 * PERSONALISATION — the line between arithmetic and advice, enforced.
 *
 * Everything else on this site is the same output for every visitor, which is what makes "here is
 * our record" checkable. This feature breaks that symmetry, so the constraints that keep it
 * defensible are asserted rather than left to review:
 *
 *   · nothing leaves the browser
 *   · flat staking only — no Kelly, no progression
 *   · the reader is never told to stake
 *   · stating a bankroll makes the MEASURED record more prominent, not less
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { unitStake, bankrollOutcome, DEFAULT_PREFS, UNIT_PCT_MAX } from "./reader-prefs.ts";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
/** Source minus commentary — a comment explaining a rule must not satisfy or trip the rule. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const STORE = "src/lib/prefs/reader-prefs.ts";
const PANEL = "src/components/prefs/reader-prefs-panel.tsx";

test("a unit is flat arithmetic on the reader's own two numbers", () => {
  assert.equal(unitStake({ ...DEFAULT_PREFS, bankroll: 500, unitPct: 2 }), 10);
  assert.equal(unitStake({ ...DEFAULT_PREFS, bankroll: 1000, unitPct: 5 }), 50);
  assert.equal(unitStake({ ...DEFAULT_PREFS, bankroll: null }), null, "no bankroll, no number");
});

test("no Kelly, no progression — the only control is a capped flat percentage", () => {
  /*
   * Kelly needs a real edge estimate and this stream's measured ROI is negative in every tier;
   * sizing "optimally" against an edge that is not there converts a losing model into a faster
   * loss. A martingale would be worse. Neither may appear.
   */
  const src = code(STORE) + code(PANEL);
  // Mechanics, by name. "progression" is NOT in this list: the panel's own copy says "there is no
  // progression here", and a bare-word ban forbids the denial along with the thing — the trap this
  // repo keeps walking into. It is asserted below as a negated-only word instead.
  for (const banned of ["kelly", "martingale", "doubleAfter", "parlayUp", "stakeMultiplier"]) {
    assert.doesNotMatch(src, new RegExp(banned, "i"), `${banned} sizing must not exist here`);
  }
  // Wherever "progression" appears, it is being ruled out — never implemented.
  for (const m of src.matchAll(/(.{0,24})progression/gi)) {
    assert.match(m[1], /\b(no|never|without|not)\b[^.]*$/i, `"progression" must only appear in a denial, got "...${m[1]}progression"`);
  }
  assert.ok(UNIT_PCT_MAX <= 10, "the flat percentage is capped");
});

test("the reader is never TOLD to stake", () => {
  const prose = read(PANEL).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  for (const advice of [
    /you should (bet|stake|put)/i,
    /we recommend/i,
    /recommended stake/i,
    /best bet/i,
    /place this/i,
  ]) {
    assert.doesNotMatch(prose, advice, `advice phrasing "${advice}" must not appear`);
  }
  assert.match(prose, /Nothing here is a recommendation to stake/i, "and it says so outright");
});

test("the measured outcome is a completed past applied to their number, never a projection", () => {
  // −6.6% over 234 cards at $10 a card is −$154.44. It is what happened, phrased as such.
  assert.equal(bankrollOutcome({ bankroll: 500, risk: "medium", unitPct: 2 }, -0.066, 234), -154.44);
  assert.equal(bankrollOutcome({ bankroll: 500, risk: "low", unitPct: 2 }, null, 100), null, "no record, no claim");

  const prose = read(PANEL).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  assert.match(prose, /would have turned/i, "phrased as a completed past");
  assert.match(prose, /what already happened, not a forecast/i, "and says it is not a forecast");
  for (const projection of [/expected (return|profit)/i, /you (will|can expect)/i, /projected profit/i]) {
    assert.doesNotMatch(prose, projection, "no forward-looking claim");
  }
});

test("stating a bankroll makes the record MORE prominent, not less", () => {
  // The consequence block renders only when a bankroll exists, and it is the loudest thing the
  // panel produces. A personalisation feature on a negative stream that made it feel better would
  // be the most misleading thing on the site.
  const src = read(PANEL);
  assert.match(src, /outcome != null && rec/, "the measured consequence is gated on having a bankroll");
  assert.match(src, /vault-danger/, "a negative outcome is styled as a loss, not neutral");
});

test("nothing leaves the browser", () => {
  const src = code(STORE) + code(PANEL);
  for (const egress of ["fetch(", "XMLHttpRequest", "navigator.sendBeacon", "WebSocket", "/api/"]) {
    assert.ok(!src.includes(egress), `a bankroll must never be transmitted (${egress})`);
  }
  assert.match(code(STORE), /localStorage/, "it is browser-local storage and nothing else");
});

test("a stated tolerance REORDERS the ladder — it never hides the calmer tiers", () => {
  /*
   * Filtering would let a reader who picked Longshot forget the three calmer bands exist, and
   * Longshot is this stream's worst record by a distance (−25.0%). Someone selecting it is exactly
   * the reader who most needs the others still on screen.
   */
  const board = code("src/components/parlays/risk-ladder-board.tsx");
  assert.match(board, /sort\(\(a, b\) => Number\(b\.tier === prefs\.risk\)/, "the tolerance sorts");
  assert.doesNotMatch(board, /cards\.filter\(\(c\) => c\.tier === prefs\.risk\)/, "and never filters the rest away");
});
