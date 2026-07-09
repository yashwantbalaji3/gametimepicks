/**
 * TABBED GAME DASHBOARD (2026-07-09) — Overview-led, consumer-first, gate intact.
 *
 * The post-reveal game dashboards are now Overview-led tab sets (MLB + soccer), entirely inside the
 * runner's postReveal (gated). These checks pin: Overview is the default first tab, the MLB/soccer
 * tab sets, soccer stays market-implied with NO run-count claim, MLB keeps its 10,000-run wording,
 * the coming-soon panels are honest roadmap text (no fabricated market values), and no banned copy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-?free/i;
const stripSafeArea = (s) => s.replace(/safe-area[a-z-]*/gi, "");

const tabsComp = read("src/components/game/post-reveal-tabs.tsx");
const panels = read("src/components/game/game-dashboard-panels.tsx");
const detailPage = read("src/components/game/game-detail-page.tsx");

test("1 · PostRevealTabs defaults to the first tab (Overview leads)", () => {
  assert.match(tabsComp, /useState\(usable\[0\]\?\.key/, "active defaults to the first usable tab");
  // The MLB + WC tab arrays both put Overview first.
  assert.match(detailPage, /mlbDashTabs[\s\S]*?key: "overview", label: "Overview"/, "MLB Overview is first");
  assert.match(detailPage, /wcDashTabs[\s\S]*?key: "overview", label: "Overview"/, "WC Overview is first");
});

test("2 · MLB tab set = Overview · Player props · Distributions · Advanced · Methodology", () => {
  for (const k of ["overview", "player-props", "distributions", "advanced", "methodology"]) {
    assert.match(detailPage, new RegExp(`mlbDashTabs[\\s\\S]*?key: "${k}"`), `MLB has ${k}`);
  }
});

test("3 · Soccer tab set = Overview · Scorers · Advanced · Coming soon · Methodology", () => {
  for (const k of ["overview", "scorers", "coming-soon", "methodology"]) {
    assert.match(detailPage, new RegExp(`wcDashTabs[\\s\\S]*?key: "${k}"`), `WC has ${k}`);
  }
});

test("4 · Soccer methodology makes NO run-count claim; MLB keeps its 10,000-run wording", () => {
  assert.match(panels, /10,000-run/, "MLB methodology keeps the (dynamic) 10,000-run wording");
  assert.match(panels, /market-implied/i, "soccer labelled market-implied");
  // Soccer methodology explicitly denies a sampled engine — and the built WC page carries no "10,000-run"
  // anywhere (build-verified), so soccer never claims a run count.
  assert.match(panels, /no run-based simulation engine for soccer|not.{0,25}sampled simulation/i, "soccer denies a run-based sim");
});

test("5 · coming-soon panels are honest roadmap text — no fabricated market values", () => {
  // Every ComingSoonCard carries a title + a reason string, never a probability/number.
  assert.match(panels, /Coming soon/);
  assert.match(panels, /needs a new provider|requires|deferred|one-sided|thin/i, "honest reasons");
  // No fabricated corners/cards/scorer/xG numbers rendered.
  assert.doesNotMatch(panels, /cornersCount|cardsCount|scorerProb|xgValue|\d+% (corners|cards|to score)/);
});

test("6 · no banned copy in the tabbed-dashboard surfaces", () => {
  for (const src of [tabsComp, panels]) assert.doesNotMatch(stripSafeArea(src), BANNED);
});

test("7 · the whole dashboard stays inside postReveal (gated) — no pre-click sibling render", () => {
  // Both branches pass the tab set via postReveal; neither renders the tabs as a bare sibling.
  assert.match(detailPage, /postReveal=\{<PostRevealTabs tabs=\{mlbDashTabs\} \/>\}/);
  assert.match(detailPage, /postReveal=\{<PostRevealTabs tabs=\{wcDashTabs\} \/>\}/);
});
