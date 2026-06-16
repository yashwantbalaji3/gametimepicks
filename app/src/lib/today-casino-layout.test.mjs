/**
 * Locks the June-16 launch-polish /today ordering (owner restructure): quick-action buttons FIRST,
 * then the World Cup focus, then the COMPACT Bank Builder status rail, then the filterable suggested
 * parlays. The old tall "Bank Builder · {dateLabel}" recap is gone (compact rail replaces it).
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
  const parlays = src.indexOf("<TodaysParlays");
  assert.ok(rail > 0, "compact Bank Builder status rail present");
  assert.ok(parlays > 0, "filterable suggested parlays present");
  assert.ok(rail < parlays, "Bank Builder status precedes suggested parlays");
  // the old tall recap is gone
  assert.ok(!src.includes("Bank Builder · {dateLabel}"), "old tall Bank Builder recap removed");
});

test("World Cup focus shows the order: World Cup leads the content sections", () => {
  const wc = src.indexOf("<TodaysFocusWorldCup");
  const rail = src.indexOf("<BankBuilderStatusRail");
  assert.ok(wc < rail, "World Cup focus precedes the Bank Builder status");
});

test("heat system tokens exist in the design system", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.ok(css.includes("--gtp-bank-heat:") && css.includes("--gtp-bank-lava:"), "heat tokens present");
  assert.ok(css.includes(".gtp-heat-pulse { animation: none; }"), "heat pulse is reduced-motion gated");
});
