/**
 * P185 · RELEASE E — a page header describes the page, not one section of it.
 * P208 · RELEASE A — restated for the Parlay Center's two-mode split.
 *
 * The original defect: /build's status badge and count chip were derived from the ADVANCED
 * BUILDER's gated pool, which is legitimately empty on slates where nothing clears the card gates
 * — so the whole page said "Data pending · 0 Eligible legs" directly above a risk ladder rendering
 * real cards. A number built for one scope, reused for a broader claim.
 *
 * The two-mode split makes the scoping structural: each mode's header may speak only for what that
 * mode shows. /build (Suggested Parlays) badges from the ladder + optimizer cards; /build/custom
 * (Build Your Own) badges from the builder pool, with its count chip labelled for that pool.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const suggested = strip(fs.readFileSync(path.join(APP, "src/app/build/page.tsx"), "utf8"));
const custom = strip(fs.readFileSync(path.join(APP, "src/app/build/custom/page.tsx"), "utf8"));

test("each mode's status is decided by what that mode shows", () => {
  assert.match(suggested, /status=\{ladderCardCount > 0 \|\| suggestedCards\.length > 0 \? "pregame" : "data_pending"\}/,
    "the Suggested page badges from its own cards — never from the builder's pool");
  assert.doesNotMatch(suggested, /builderLegs/,
    "the builder's pool no longer speaks on the Suggested page at all");
  assert.match(custom, /status=\{pool\.length > 0 \? "pregame" : "data_pending"\}/,
    "the Build Your Own page badges from the pool it renders");
});

test("a zero count says WHICH pool it counted", () => {
  assert.match(custom, /counts=\{\{ builderLegs: pool\.length \}\}/,
    "the builder count is scoped to the builder page");
  const header = fs.readFileSync(path.join(APP, "src/components/picks-surface-header.tsx"), "utf8");
  assert.match(header, /\["builderLegs", "Build-your-own legs"\]/,
    "the scoped label exists, in plain product language");
});

test("the builder keeps its own honest empty state where it happens", () => {
  const f = path.join(APP, "out", "build", "custom", "index.html");
  if (!fs.existsSync(f)) return;
  const text = fs.readFileSync(f, "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const m = text.match(/(\d+) Build-your-own legs/);
  if (!m) return; // chip absent — nothing to reconcile
  if (Number(m[1]) === 0) {
    assert.match(text, /No eligible legs right now/,
      "an empty pool must be explained on the page that renders it");
  } else {
    assert.doesNotMatch(text, /Data pending/,
      `the page badges itself Data pending while its chip shows ${m[1]} legs`);
  }
});
