/**
 * The Parlay Lab entry point: the bankroll gate, and the vault door.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const ENTRY = "src/components/parlays/parlay-lab-entry.tsx";
const CSS = "src/app/globals.css";
const latest = JSON.parse(read("public/data/parlays/risk-ladder/latest.json"));

// ── the bankroll gate ────────────────────────────────────────────────────────────────────────────

test("a gated tier is still selectable and still shown", () => {
  /*
   * The gate slows someone down; it does not lock them out. A tier a reader cannot reach becomes a
   * tier they want, which on the worst-performing thing here (Longshot: 4.7%, 28 straight losers)
   * would be precisely the wrong incentive to build.
   */
  const src = code(ENTRY);
  assert.doesNotMatch(src, /disabled=\{gated\}/, "a gated tier is never disabled");
  assert.doesNotMatch(src, /gated \?\s*null\s*:/, "a gated tier is never hidden");
  assert.match(src, /gated && !on \? 0\.62 : 1/, "it is de-emphasised, not removed");
});

test("the gate states that it is a judgement, not a number the maths produced", () => {
  /*
   * Under flat-percentage staking a drawdown measured in units is bankroll-independent — a $100 and
   * a $10,000 bankroll ride out the same 28-card losing run and end down the same fraction. So no
   * dollar threshold falls out of the statistics, and the page must not imply one did.
   */
  const prose = read(ENTRY).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  assert.match(prose, /our judgement about who should start here, not something the maths\s+produced/i,
    "the threshold is labelled a judgement");
  assert.match(prose, /nothing is locked/i, "and says the tier is still available");
});

test("the caution is keyed to the tier's MEASURED streak, not an adjective", () => {
  const prose = read(ENTRY).replace(/\s+/g, " ");
  assert.match(prose, /worstLosingRun/, "it cites the observed losing run");
  assert.match(prose, /medianDaysToWin/, "and the typical wait between wins");
  for (const t of latest.bettorTiers ?? []) {
    assert.ok(Number.isInteger(t.worstLosingRun) && t.worstLosingRun >= 0, `${t.id} carries a measured streak`);
    assert.ok(t.minBankroll >= 0, `${t.id} carries a gate`);
  }
  // The ordering the gate implies must match the risk it is gating: harsher tiers, higher gates.
  const byId = Object.fromEntries((latest.bettorTiers ?? []).map((t) => [t.id, t]));
  assert.ok(byId.longshot.minBankroll > byId.steady.minBankroll,
    "the tier with the longest dry spells carries the highest gate");
  assert.ok(byId.longshot.worstLosingRun > byId.steady.worstLosingRun,
    "and that ordering is what the data says");
});

// ── the vault door ───────────────────────────────────────────────────────────────────────────────

test("the door is scenery: it never gates content and never blocks a click", () => {
  const css = read(CSS);
  assert.match(css, /\.gtp-vault\s*\{[^}]*pointer-events:\s*none/, "the overlay is not hit-testable");
  const src = read(ENTRY);
  assert.match(src, /aria-hidden/, "a screen reader meets the questions, not a door");
  // The panel is in the DOM regardless — the door is a sibling overlay, not a wrapper.
  assert.doesNotMatch(src, /doorOpen \?\s*<span className="gtp-vault"[\s\S]{0,400}?\{\/\* content \*\/\}/, "the door never wraps the content");
  assert.match(src, /\{doorOpen && \(/, "it is an overlay mounted beside the content");
});

test("it plays ONCE and is removed — no persistent overlay above an interactive panel", () => {
  const src = code(ENTRY);
  assert.match(src, /doorRan/, "a ref guards against replay");
  assert.match(src, /setTimeout\(\(\) => setDoorOpen\(false\)/, "and it unmounts itself");
  const css = read(CSS);
  for (const kf of ["gtp-vault-left", "gtp-vault-right", "gtp-vault-wheel"]) {
    const block = css.slice(css.indexOf(`.${kf}`) >= 0 ? 0 : 0);
    assert.ok(!new RegExp(`animation:[^;]*${kf}[^;]*infinite`).test(block),
      `${kf} must not loop — a looping vault reads as a live process, and nothing behind it is live`);
  }
});

test("reduced motion gets no door at all, not a faster one", () => {
  const css = read(CSS);
  const rm = css.slice(css.indexOf("prefers-reduced-motion"));
  assert.match(rm, /\.gtp-vault\s*\{\s*display:\s*none/, "the door is removed entirely");
  assert.match(code(ENTRY), /prefers-reduced-motion: reduce/, "and it is never even mounted");
});

test("the door only greets a first-time reader", () => {
  // Someone returning with a tier saved has already been inside; replaying the flourish on every
  // load turns a piece of theatre into a toll.
  assert.match(code(ENTRY), /if \(answered\) return;/, "a returning reader goes straight in");
});
