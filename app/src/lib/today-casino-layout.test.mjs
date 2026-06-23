/**
 * Locks the /today ordering (owner restructure): quick-action buttons FIRST, then the three flagship
 * surfaces in order — Bank Builder ladders, Moonshot ladders, World Cup exclusive parlays — then the
 * World Cup focus, the COMPACT Bank Builder status rail, and the filterable suggested parlays. The old
 * tall "Bank Builder · {dateLabel}" recap is gone (compact rail replaces it).
 * Source-level checks (suite runs pre-build).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("src/app/today/page.tsx", "utf8");

test("the 'What's live today' counts hero is removed", () => {
  assert.ok(!src.includes("What&apos;s live today"), "old hero heading must be gone");
});

test("quick-action buttons lead the page (1-click reach to every key area)", () => {
  const nav = src.indexOf('aria-label="Quick actions"');
  const wc = src.indexOf("<TodaysFocusWorldCup");
  assert.ok(nav > 0, "quick-action nav present");
  assert.ok(wc > 0, "World Cup focus present");
  assert.ok(nav < wc, "quick actions appear before the World Cup focus");
  for (const dest of ["/games", "/world-cup", "/picks", "/build", "/bank-builder", "/results"]) {
    assert.ok(src.includes(`href: "${dest}"`), `quick action links to ${dest}`);
  }
});

test("compact Bank Builder status rail replaces the tall recap, before suggested parlays", () => {
  const rail = src.indexOf("<BankBuilderStatusRail");
  // Suggested parlays now render through the canonical methodology engine (ParlaysExplorer) —
  // the same component /parlays and /picks use (World Cup + Mixed + by-risk with leg drawers).
  const parlays = src.indexOf("<ParlaysExplorer");
  assert.ok(rail > 0, "compact Bank Builder status rail present");
  assert.ok(parlays > 0, "engine-backed suggested parlays present");
  assert.ok(rail < parlays, "Bank Builder status precedes suggested parlays");
  // the old tall recap is gone
  assert.ok(!src.includes("Bank Builder · {dateLabel}"), "old tall Bank Builder recap removed");
});

test("the three flagship ladders lead the content: Bank Builder → Moonshot → WC exclusive parlays → World Cup focus → Bank Builder status", () => {
  const bb = src.indexOf('aria-label="Bank Builder ladders"');
  const moon = src.indexOf('aria-label="Moonshot ladders"');
  const wcParlays = src.indexOf("<WorldCupSpecialsBox");
  const wc = src.indexOf("<TodaysFocusWorldCup");
  const rail = src.indexOf("<BankBuilderStatusRail");
  assert.ok(bb > 0 && moon > 0, "both flagship ladder sections present");
  assert.ok(bb < moon, "Bank Builder ladders lead Moonshot ladders");
  assert.ok(moon < wcParlays, "Moonshot ladders precede the WC exclusive parlays");
  assert.ok(wcParlays < wc, "WC exclusive parlays precede the World Cup focus");
  assert.ok(wc < rail, "World Cup focus precedes the Bank Builder status rail");
  // The two flagship ladders reuse the shared ProductLanesLadder surface.
  assert.ok(src.includes("<ProductLanesLadder"), "renders the shared product ladder for the lead sections");
});

test("heat system tokens exist in the design system", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.ok(css.includes("--gtp-bank-heat:") && css.includes("--gtp-bank-lava:"), "heat tokens present");
  assert.ok(css.includes(".gtp-heat-pulse { animation: none; }"), "heat pulse is reduced-motion gated");
});
