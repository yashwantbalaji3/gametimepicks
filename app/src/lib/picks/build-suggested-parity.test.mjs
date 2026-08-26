/**
 * Suggested Cards parity guards — Build vs /picks (Program 142, Train 1 step 3C · Deployment A).
 *
 * The merge gate is that the destination must provide the capability BEFORE /picks is retired.
 * Program 141 learned that lesson the hard way by deleting the ranked board on a wrong assumption,
 * so parity here is asserted structurally rather than assumed from "it uses the same component".
 *
 * The strongest available check is that both surfaces derive from the SAME loader and render the
 * SAME component — not that two screenshots look alike. If either page ever composes its own list,
 * these fail.
 *
 * Run: npx tsx --test src/lib/picks/build-suggested-parity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

const BUILD = "src/app/build/page.tsx";
const PICKS = "src/app/picks/page.tsx";
const LOADER = "src/lib/picks/suggested-cards.ts";

test("THE PARITY GATE · /build derives cards from the one shared loader; /picks is a redirect", () => {
  // Deployment B shipped: /picks is a ClientRedirect stub, so /build is the sole consumer. The
  // rule these guards protect is unchanged — ONE composition, ONE renderer — only the surface
  // count moved from two to one.
  const src = read(BUILD);
  assert.match(src, /loadSuggestedCards\(/, "/build must call the shared loader");
  assert.doesNotMatch(src, /normalizeOptimizerSlips\(/, "/build must not compose cards inline");
  assert.doesNotMatch(src, /normalizeUfcCards\(/, "/build must not compose cards inline");

  const picks = read(PICKS);
  assert.match(picks, /ClientRedirect/, "/picks must be a redirect stub, not a page");
  assert.doesNotMatch(picks, /loadSuggestedCards|PicksExperience/, "/picks must not render cards any more");
});

test("/build renders the ONE card component — no third implementation", () => {
  assert.match(read(BUILD), /<PicksExperience cards=/, "/build must reuse PicksExperience");
  const build = read(BUILD);
  assert.doesNotMatch(build, /projectedReturn|payout\s*=|stake\s*\*/, "Build must not reimplement stake maths");
});

test("the gating rules travel with the loader, so Build inherits every one of them", () => {
  const loader = read(LOADER);
  assert.match(loader, /ufcSettled\(\) \? null/, "settled UFC cards excluded");
  assert.match(loader, /loadDailyMixedCards\(today\)/, "stale daily-mixed date-gated");
  assert.match(loader, /wcParlays\.date === today/, "stale World Cup artifact date-gated");
});

test("Manual Builder stays the default; Suggested Cards is a named, addressable section", () => {
  const src = read(BUILD);
  // Order matters: /build's job is construction. The builder must render before the browse list.
  assert.ok(src.indexOf("<BuildExperience") < src.indexOf('id="suggested-cards"'),
    "the manual builder must remain first — this page is for building");
  assert.match(src, /<section id="suggested-cards" aria-labelledby="suggested-cards-heading"/,
    "the section must be addressable and labelled for assistive tech");
  assert.match(src, /id="suggested-cards-heading"/, "the labelling target must exist");
  assert.match(src, /scroll-mt-/, "an anchored section needs scroll offset or it lands under the header");
});

test("an empty card list is the model's answer, never a broken page", () => {
  const src = read(BUILD).replace(/\s+/g, " ");
  assert.match(src, /No suggested cards for today/, "the empty state must be explicit");
  assert.match(src, /not a missing update/i, "it must distinguish a no-play from an outage");
  // And it must offer somewhere to go rather than dead-ending. (P208: onward = the Build Your Own
  // mode and the ranked Picks surface — the destinations, not any one label for them.)
  assert.match(src, /\/build\/custom/, "the empty state routes onward to the builder");
  assert.match(src, /\/markets/, "the empty state routes onward to the ranked picks surface");
});

test("stake language stays paper-only and claims no profit", () => {
  const src = read(BUILD).replace(/\s+/g, " ");
  assert.match(src, /Paper-only and educational/i, "the paper-only frame must be stated");
  assert.match(src, /not an expectation of profit/i, "a projected return is arithmetic, not a forecast");
  assert.doesNotMatch(src, /guaranteed|best bet|sure thing|expected profit/i);
});

test("PRODUCTION TRUTH · the built /build carries the section and /picks still works", () => {
  const buildOut = path.join(APP, "out/build/index.html");
  if (!fs.existsSync(buildOut)) return;                   // no build in this run
  const html = fs.readFileSync(buildOut, "utf8");
  assert.match(html, /id="suggested-cards"/, "the section must be in the export");
  assert.match(html, /Suggested cards/, "its heading must render");

  // Deployment B: /picks exports as a redirect stub — present, small, and pointing at Build.
  const picksOut = path.join(APP, "out/picks/index.html");
  if (fs.existsSync(picksOut)) {
    assert.match(fs.readFileSync(picksOut, "utf8"), /build#suggested-cards/, "/picks must redirect to Build");
  }
});
