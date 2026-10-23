/**
 * Release B (competitor benchmark PR 1193 gaps 2, 3, 8 · founder sprint directive 2026-10-23): shorter phone homepage,
 * discoverable tools, ≥ 44px tap targets on Home and the sport hubs.
 * Run (from app/): npx tsx --test src/components/home/mobile-home.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const { HOME_TOOLS, HomeTools, MobileMore, SportsToday } = await import("./mobile-home-parts.tsx");

function routeExists(route) {
  let dir = path.join(APP, "src/app");
  for (const seg of route.split("/").filter(Boolean)) {
    if (fs.existsSync(path.join(dir, seg))) { dir = path.join(dir, seg); continue; }
    const dyn = fs.readdirSync(dir).find((d) => /^\[[^.].*\]$/.test(d));
    if (!dyn) return false;
    dir = path.join(dir, dyn);
  }
  return fs.existsSync(path.join(dir, "page.tsx"));
}

test("tools row: Top Boards, Research Lab, Results, Forecast Record and Model Performance — every link is a real page", () => {
  for (const want of ["Top Boards", "Research Lab", "Results", "Forecast Record", "Model Performance"]) {
    assert.ok(HOME_TOOLS.some((t) => t.label.includes(want)), want);
  }
  for (const t of HOME_TOOLS) assert.ok(routeExists(t.href.replace(/[?#].*$/, "")), t.href);
});

test("phone homepage: secondary sections render from sm up, summarised by 44px links on phones; the five sports sit under the hero", () => {
  const page = read("src/app/page.tsx");
  for (const s of ["topUpcoming(topReads, UPCOMING_READS_SHOWN)", "<SuggestedParlaysPreview", "<FlagshipCards", "<FeaturedSimulationsSection"]) {
    const i = page.indexOf(s);
    assert.ok(i > 0, s);
    assert.ok(page.lastIndexOf('<div className="hidden sm:contents">', i) > page.lastIndexOf("</div>", i - 1) || page.slice(Math.max(0, i - 60), i).includes('hidden sm:contents'), `${s} is inside a sm-and-up wrapper`);
  }
  assert.ok(page.indexOf("<SportsToday lanes={commandLanes} />") > page.indexOf("<LandingHero") && page.indexOf("<SportsToday") < page.indexOf("<CommandCenter"), "the sports strip sits between the hero and the lanes");
  assert.match(page, /<MobileMore items=\{\[/);
  assert.match(page, /<HomeTools \/>/);
  // the summary's lines are destinations or statuses the page already computed — never a new number
  const more = page.slice(page.indexOf("<MobileMore"), page.indexOf("<HomeTools"));
  assert.doesNotMatch(more, /\d+ (games|parlays|simulations)/, "no invented counts");
  // the word budget (busiest-state.test): How it works / Get started gave way to links, never a second copy of the section
  assert.doesNotMatch(page, /<HowItWorks \/>|<FooterCta \/>/);
  assert.match(more, /href: "\/learn\/"/, "How it works stays one tap away");
});

test("rendered: every SportsToday, HomeTools and MobileMore link carries a ≥ 44px minimum height", () => {
  const lanes = [{ sport: "nfl", label: "NFL", hubHref: "/nfl/", stateLabel: "Live today" }, { sport: "nba", label: "NBA", hubHref: "/nba/", stateLabel: "Games today" }];
  const h = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(SportsToday, { lanes }), React.createElement(HomeTools), React.createElement(MobileMore, { items: [{ label: "How it works", href: "/learn/" }] })));
  const anchors = [...h.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
  assert.ok(anchors.length >= 2 + HOME_TOOLS.length + 1);
  for (const a of anchors) assert.match(a, /min-height:44px/, a);
  assert.match(h, /class="sm:hidden[^"]*"[^>]*aria-label="Sports today"|aria-label="Sports today" class="sm:hidden/);
});

test("shared tap targets: lane links, slate chips, sport switcher, Save, Open report, NFL filter tabs are ≥ 44px", () => {
  const cc = read("src/components/command-center/command-center.tsx");
  assert.doesNotMatch(cc, /minHeight: (24|36)\b/, "no 24/36px lane link left");
  assert.equal((cc.match(/minHeight: 44/g) ?? []).length >= 4, true);
  assert.match(read("src/components/slate-status-chips.tsx"), /minHeight: 44/);
  assert.match(read("src/components/slate-status-bar.tsx"), /minHeight: 44,/, "the Settled chip beside them too");
  assert.match(read("src/components/sports/sport-switcher.tsx"), /minHeight: 44/);
  assert.match(read("src/components/saved/save-forecast-button.tsx"), /const minHeight = 44;/);
  assert.match(read("src/components/command-center/prediction-card.tsx"), /minHeight: 44, display: "inline-flex", alignItems: "center" \}\}>Open report/);
  assert.match(read("src/components/nfl/forecast/styles.tsx"), /\.nf-tab\{flex:0 0 auto;min-height:44px;/);
});

test("A-T12 Production pass (2026-10-23, 375–1440): the targets it measured under 44px are 44px", () => {
  assert.match(read("src/components/home/home-today-mlb.tsx"), /minHeight: 44, fontSize: 11/, "Home · Open today's brief (was 38)");
  const css = read("src/app/globals.css");
  for (const cls of ["gtp-btn-primary", "gtp-btn-ghost"]) {
    const rule = css.slice(css.indexOf(`.${cls} {`), css.indexOf("}", css.indexOf(`.${cls} {`)));
    assert.match(rule, /min-height: 44px;/, `${cls}: hub hero buttons (was 35)`);
  }
  assert.match(read("src/components/sport-overview-hero.tsx"), /minHeight: 44,\n\s+fontSize: 9\.5,/, "compact hero buttons");
  assert.match(read("src/components/nfl/forecast/styles.tsx"), /\.nf-details summary\{cursor:pointer;min-height:44px;/, "NFL Official Forecast status summary (was 38)");
  assert.match(read("src/components/nfl/forecast/family-tabs.tsx"), /aria-label=\{SEARCH_PLAYERS_LABEL\}\s+style=\{\{ minHeight: 44,/, "NFL player search (was 36)");
  assert.match(read("src/components/research/terminal-summary-panel.tsx"), /className="inline-flex min-h-\[44px\] items-center[^"]*"\s*>\s*System status/, "Methodology · System status (was 20)");
});
