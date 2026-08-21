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
   * The page-level claim holds on EVERY slate: ladder cards and a "Data pending" badge may not be
   * rendered together. Asserted before the split, because it is not conditional on emptiness.
   */
  assert.doesNotMatch(text, /Data pending/,
    "the page still badges itself Data pending while rendering ladder cards");

  /*
   * The emptiness claim is conditional, and this is what the early return was reaching for. It
   * tested for the LABEL, which the scoped chip renders on every slate — so on a slate that HAD
   * legs (78 of them on 2026-08-20) the guard demanded an empty-state sentence that would have been
   * a lie. Skip on the count, which is the fact the sentence is about.
   */
  if (!/\b0 Advanced-builder legs\b/.test(text)) return;  // a slate with legs has no emptiness to explain
  assert.match(text, /No eligible legs right now/,
    "the advanced builder must still explain its own emptiness where it happens");
});
