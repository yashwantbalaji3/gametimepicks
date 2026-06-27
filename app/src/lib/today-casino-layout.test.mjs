/**
 * Locks the v1 homepage (/today) structure: ONE story, five clean sections in order —
 *   1 identity + proof hero  →  2 receipts (AchievementBanner)  →  3 today's headline play
 *   (Bank Builder ladder)  →  4 the four paper lanes  →  5 why-trust block.
 * The old "command center" (flagship flashcards, readiness strip, UFC lead, status rail, counts hero)
 * is gone. Source-level checks (suite runs pre-build).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("src/app/today/page.tsx", "utf8");

test("v1 homepage leads with the identity + proof hero (not a command center)", () => {
  assert.ok(src.includes("A sports model that shows its work."), "identity hero headline present");
  assert.ok(src.includes("Paper-only · no real money · free"), "paper-only promise present");
  assert.ok(/homeMoney/.test(src), "hero renders the canonical money path");
  // old command-center sections are gone
  assert.ok(!src.includes('aria-label="Flagship quick links"'), "old flagship flashcards removed");
  assert.ok(!src.includes("readinessModules"), "old readiness strip removed");
  assert.ok(!src.includes("What&apos;s live today"), "old counts hero gone");
});

test("homepage section order: hero → receipts → headline play → four lanes → trust", () => {
  const hero = src.indexOf("A sports model that shows its work.");
  const receipts = src.indexOf("<AchievementBanner");
  const headline = src.indexOf("Today&rsquo;s headline play");
  const lanes = src.indexOf("The paper lanes");
  const trust = src.indexOf("Why you can trust this");
  assert.ok(hero >= 0, "hero present");
  assert.ok(receipts > hero, "receipts (AchievementBanner) follow the hero");
  assert.ok(headline > receipts, "headline play follows receipts");
  assert.ok(lanes > headline, "the four lanes follow the headline play");
  assert.ok(trust > lanes, "the trust block is last");
});

test("the four lanes link to the products (Bank Builder emphasized); headline renders the BB ladder", () => {
  for (const dest of ["/bank-builder", "/moonshot", "/world-cup-specials", "/homer-nukes"]) {
    assert.ok(src.includes(`href: "${dest}"`), `lane links to ${dest}`);
  }
  assert.ok(src.includes("<ProductLanesLadder"), "headline play renders the Bank Builder ladder");
  assert.ok(!src.includes('href: "/diamond-specials"'), "no Diamond Specials");
});

test("heat system tokens exist in the design system", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.ok(css.includes("--gtp-bank-heat:") && css.includes("--gtp-bank-lava:"), "heat tokens present");
  assert.ok(css.includes(".gtp-heat-pulse { animation: none; }"), "heat pulse is reduced-motion gated");
});
