/**
 * P185 · RELEASE E — a page header describes the page, not one section of it.
 *
 * What was live on /build: both the status badge and the count chip were derived from `pool`, the
 * ADVANCED BUILDER's gated leg pool. That pool is legitimately empty on a slate where nothing
 * clears the suggested-card gates — and the advanced builder says so in its own words further down
 * the page ("No eligible legs right now"). Read at PAGE level it badged the whole surface
 * "Data pending" and printed "0 Eligible legs" directly above a risk ladder rendering seven real
 * legs across two tiers. The reader is told the page is empty while looking at its cards.
 *
 * This is the same shape as the Release D findings: a number built for one scope reused for a
 * broader claim.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const page = strip(fs.readFileSync(path.join(APP, "src/app/build/page.tsx"), "utf8"));

test("the page status is not decided by the advanced builder's pool alone", () => {
  assert.doesNotMatch(page, /status=\{pool\.length > 0 \? "pregame" : "data_pending"\}/,
    'the whole page was badged "Data pending" because ONE section had nothing');
  assert.match(page, /status=\{pool\.length > 0 \|\| ladderCardCount > 0 \? "pregame" : "data_pending"\}/,
    "the status must consider everything the page can show");
  assert.match(page, /const ladderCardCount = riskLadder\?\.cards\?\.length \?\? 0;/,
    "the ladder's own card count is the second input");
});

test("a zero count says WHICH pool it counted", () => {
  assert.match(page, /counts=\{\{ builderLegs: pool\.length/,
    'the chip must be labelled for the advanced builder, not as a page-level "Eligible legs"');
  const header = fs.readFileSync(path.join(APP, "src/components/picks-surface-header.tsx"), "utf8");
  assert.match(header, /\["builderLegs", "Advanced-builder legs"\]/, "the scoped label exists");
});

test("the advanced builder keeps its own honest empty state", () => {
  /* Scoping the header must not have moved the fact — only stopped it speaking for the page. */
  const f = path.join(APP, "out", "build", "index.html");
  if (!fs.existsSync(f)) return;
  const text = fs.readFileSync(f, "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (!/Advanced-builder legs/.test(text)) return;         // the scoped chip is not on the page at all

  /*
   * The page renders BOTH inputs to its own status badge — `builderLegs` as "N Advanced-builder
   * legs" and `suggestedCards` as "N Suggested cards" — so the page-level claim is checkable
   * against the page itself rather than against a proxy string.
   *
   * The original guard early-returned on the presence of the LABEL, which the scoped chip renders
   * on every slate. So on a slate that HAD legs (78 on 2026-08-20) it demanded an empty-state
   * sentence that would have been false, and on an empty slate it forbade a "Data pending" badge
   * that was true. Both halves are conditional, and each is now keyed to the COUNT it is about.
   */
  const count = (label) => {
    const m = text.match(new RegExp(`(\\d+) ${label}`));
    return m ? Number(m[1]) : null;
  };
  const legs = count("Advanced-builder legs");
  const cards = count("Suggested cards");

  // The defect this guard was written for: a page badged empty above its own rendered cards.
  if (legs !== null && cards !== null && (legs > 0 || cards > 0)) {
    assert.doesNotMatch(text, /Data pending/,
      `the page badges itself Data pending while showing ${legs} builder legs and ${cards} ladder cards`);
  }

  // And the fact must still be stated WHERE it happens, whenever the builder is the empty one.
  if (legs === 0) {
    assert.match(text, /No eligible legs right now/,
      "the advanced builder must still explain its own emptiness where it happens");
  }
});
