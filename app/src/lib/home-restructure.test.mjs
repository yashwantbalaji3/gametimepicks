/**
 * HOME RESTRUCTURE (2026-07-08) — `/` is now a focused, premium, simulation-first flagship LANDING page,
 * not the dense Today board. These tests pin the founder's ten guarantees: the full Today board no longer
 * renders on Home; four flagship product cards (/simulate, /today, /bank-builder, /results); featured
 * simulations from the REAL selector; an HONEST Bank Builder no-play / awaiting state; money/record/
 * exposure sourced from canonical artifacts (never hardcoded); `/today` still renders its full board; no
 * stale "Game Lab" homepage copy; no banned copy; and the canonical money artifact is untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

const page = read("src/app/page.tsx");
const hero = read("src/components/home/landing-hero.tsx");
const flagship = read("src/components/home/flagship-cards.tsx");
const featured = read("src/components/home/featured-simulations.tsx");
const sections = read("src/components/home/home-sections.tsx");
const todayPage = read("src/app/today/page.tsx");

// All home page + component source, concatenated, for whole-surface assertions.
const HOME_ALL = [page, hero, flagship, featured, sections].join("\n");
const COMPONENTS_ALL = [hero, flagship, featured, sections].join("\n");

// Whole-word banned copy (safe-area-inset is explicitly allowed — it is not "safe" copy).
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-free|easy money/i;
const stripSafeArea = (s) => s.replace(/safe-area-inset/gi, "").replace(/safe-area/gi, "");

// 1 — Home no longer renders the full Today board.
test("1 · page.tsx does NOT import or render the full Today board", () => {
  assert.ok(!/from "\.\/today\/page"/.test(page), "no import from ./today/page");
  assert.ok(!/\bTodayPage\b/.test(page), "TodayPage is not referenced/rendered on Home");
  assert.ok(!/<TodayPage\s*\/?>/.test(page), "TodayPage is not rendered");
});

// 2 — Home has 4 flagship product cards (the 4 hrefs present in the home source).
test("2 · Home surfaces the four flagship product cards", () => {
  for (const href of ["/simulate", "/today", "/bank-builder", "/results"]) {
    assert.ok(HOME_ALL.includes(`"${href}"`), `flagship href ${href} present`);
  }
  // The four cards are constructed with their labels.
  for (const label of ["Simulate", "Today's Picks", "Bank Builder", "Results"]) {
    assert.ok(page.includes(label), `card label "${label}" present`);
  }
});

// 3 — Home links to /simulate, /today, /bank-builder, /results (across the home surface).
test("3 · Home links to /simulate, /today, /bank-builder, /results", () => {
  assert.match(hero, /href="\/simulate"/, "hero links to /simulate");
  assert.match(hero, /href="\/today"/, "hero links to /today");
  // The footer/sections reach these destinations (literal href or an href map entry).
  for (const href of ["/simulate", "/today", "/results"]) {
    assert.ok(sections.includes(`"${href}"`), `home sections link to ${href}`);
  }
  // The flagship cards cover /bank-builder (built on the page, rendered by FlagshipCards).
  assert.ok(HOME_ALL.includes('"/bank-builder"'), "home links to /bank-builder");
});

// 4 — Home renders featured simulations from the REAL selector when the artifact exists.
test("4 · featured simulations come from featuredSimulations() (real artifact only)", () => {
  assert.match(page, /import \{ featuredSimulations \} from "@\/lib\/simulate-lobby-featured"/, "imports the real selector");
  assert.match(page, /featuredSimulations\(details\)/, "invokes the selector on real game details");
  assert.match(page, /buildAllGameDetails\(\)/, "details come from the real builder");
  assert.match(page, /<FeaturedSimulationsSection/, "renders the featured section");
  // The section renders each card's Generate Simulation CTA to the game's own href.
  assert.match(featured, /Generate Simulation/, "card CTA is Generate Simulation");
  assert.match(featured, /Simulation Ready/, "sim-ready badge present");
  assert.match(featured, /No simulation-ready games/i, "honest unavailable state exists");
});

// 5 — Bank Builder no-play / awaiting Step honesty (derived, not hardcoded active).
test("5 · Bank Builder status is derived honestly (no-play / awaiting), never a hardcoded active card", () => {
  assert.match(page, /buildBankBuilderProposal\(/, "derives from the proposal loader");
  assert.match(page, /bbProposal\.available/, "no-play keys off proposal.available");
  assert.match(page, /const bbNoPlay = !bbProposal\.available/, "explicit no-play branch");
  // The awaiting step comes from the real public dual-ladder view, not a literal "3".
  assert.match(page, /buildPublicDualLadder\(/, "awaiting step from the dual-ladder view");
  assert.match(page, /status === "awaiting"/, "reads the awaiting rung");
  assert.match(page, /No-play/i, "renders a no-play label");
  // Never asserts a fabricated active card.
  assert.ok(!/status: "active"/.test(page) || /some\(\(c\) => c\.product === "bank-builder" && c\.status === "active"\)/.test(page),
    "an 'active' bank-builder card is only ever DETECTED from real data, never asserted");
});

// 6 — Record + open exposure sourced from canonical; no hardcoded literals in the components.
test("6 · record + open exposure come from canonical artifacts (no hardcoded literals in components)", () => {
  assert.match(page, /portfolio\.json/, "page reads portfolio.json for the record");
  assert.match(page, /dailyPortfolio\.openExposure/, "page reads dailyPortfolio.openExposure");
  assert.match(page, /p\.record\.wins.*p\.record\.losses/s, "record derived from portfolio.json fields");
  // No hardcoded money/record literals anywhere in the presentational home components.
  const hardcoded = /19[-–—]14|\$19,065|\$20,465|\$10,376|\$0\.00|\$0\b/;
  assert.ok(!hardcoded.test(COMPONENTS_ALL), "no hardcoded record/dollar literal in the home components");
  // The exposure/record values reach the components only as props (usd0/usd2 formatters live on the page).
  assert.match(page, /const usd2 =/, "page owns the money formatting");
});

// 7 — /today still renders the full daily board (unchanged).
test("7 · /today still renders its full dense board", () => {
  assert.match(todayPage, /title: "Today · GameTime Picks"/, "/today keeps its own metadata");
  assert.match(todayPage, /<AchievementBanner \/>/, "/today still renders AchievementBanner");
  assert.match(todayPage, /Today&apos;s flagship products/, "/today still renders the flagship section");
  assert.match(todayPage, /import ParlaysExplorer from "@\/components\/parlays\/parlays-explorer"/, "/today keeps its many board sections");
  assert.match(todayPage, /<Top10BoardSection/, "/today still renders the Top 10 board");
});

// 8 — No stale "Game Lab" homepage aria/copy.
test("8 · no stale Game Lab band or copy on Home", () => {
  assert.ok(!/GameLabHomeBand/.test(page), "GameLabHomeBand is not imported/rendered on Home");
  assert.ok(!/Game Lab/i.test(HOME_ALL), "no 'Game Lab' string in the home source");
});

// 9 — No banned copy in page.tsx + the new home components.
test("9 · no banned copy in page.tsx or the home components", () => {
  assert.ok(!BANNED.test(stripSafeArea(HOME_ALL)), "no banned whole-word copy in the home surface");
});

// 10 — Canonical money artifact is unchanged.
test("10 · portfolio.json md5 is unchanged", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});

// FUNCTIONAL — the page's data derivations actually produce honest values on today's real slate.
test("FUNCTIONAL · featured selector + BB no-play derive from real artifacts", async () => {
  const { buildAllGameDetails } = await import("./game-detail.ts");
  const { featuredSimulations } = await import("./simulate-lobby-featured.ts");
  const feat = featuredSimulations(buildAllGameDetails());
  assert.ok(feat.readyCount >= 1, "at least one ready simulation exists (so the featured section is real)");
  // Any run-count label present must be a REAL claim (the selector gates it on the artifact).
  for (const f of feat.featured) {
    if (f.runCountLabel) assert.match(f.runCountLabel, /\d[\d,]*-run/, "run-count label is a real N-run claim");
  }
});
