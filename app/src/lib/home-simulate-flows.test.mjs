/**
 * HOME / SIMULATE / TODAY FLOW ALIGNMENT (UX mission, Phase 4). The homepage pushes to BOTH the simulation
 * lobby (/simulate) and Today's Picks, without duplicating the full lobby onto /today. Copy-only; no money.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { assertProtectedLedgerIntact } from "./mr-dub/protected-invariant.mjs";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
// 2026-07-08: the homepage's simulate + today CTAs now both live in the landing hero (the homepage was
// restructured into a focused simulation-first landing page). Intent preserved: Home pushes to BOTH
// /simulate and Today's Picks, without duplicating the full lobby onto /today.
const hero = read("src/components/home/landing-hero.tsx");
const todayPage = read("src/app/today/page.tsx");

test("Home's Simulate CTA points to the clean /simulate route", () => {
  assert.match(hero, /href="\/simulate"/, "the Simulate CTA links to /simulate (not the raw /games)");
  assert.match(hero, /Simulate Today.{0,10}s Games/i, "the CTA is simulate-first");
});

test("Home's PRIMARY action opens today's official forecasts (/today), not a priced picks page", () => {
  /* REPOINTED W4 (2026-10-28) — this pinned the defect. The hero carried three equal buttons (Simulate / "See Today's
     Picks" → /markets, a priced market-comparison page / Parlay Center) and none led to today's official forecasts, the
     core product. The primary action is now "See today's forecasts" → /today; Simulate stays as the one secondary.
     /markets is unchanged and stays in the navigation ("Picks"). */
  assert.match(hero, /HERO_PRIMARY = Object\.freeze\(\{ label: "See today\\u2019s forecasts", href: "\/today" \}\)/, "the primary action is 'See today's forecasts' → /today");
  assert.match(hero, /href=\{HERO_PRIMARY\.href\}/, "the first button renders it");
  assert.ok(hero.indexOf("href={HERO_PRIMARY.href}") < hero.indexOf('href="/simulate"'), "the forecasts action comes before Simulate");
  assert.doesNotMatch(hero, /href="\/markets"|See Today.{0,10}s Picks/i, "the hero no longer sends first-time visitors to the priced picks page");
});

test("/today is NOT mislabeled as the simulation lobby (it is the picks/no-play board)", () => {
  assert.match(todayPage, /title: "Today · GameTime Picks"/, "/today is titled 'Today', not 'Simulate Games'");
  assert.ok(!/title="Simulate Games"/.test(todayPage), "/today does not render the simulate-lobby header");
});

test("the flow alignment touches NO canonical money", () => {
  assertProtectedLedgerIntact(app); // P256: history + crown fixed; bankroll = July base + Rule S fold (was a whole-file md5 pin)
});
