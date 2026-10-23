/**
 * Release B (competitor benchmark #1193 gaps 2, 3, 8 · founder sprint directive 2026-10-23): shorter phone homepage,
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
  for (const s of ["topUpcoming(topReads, UPCOMING_READS_SHOWN)", "<SuggestedParlaysPreview", "<FlagshipCards", "<FeaturedSimulationsSection", "<HowItWorks />", "<FooterCta />"]) {
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
});

test("rendered: every SportsToday, HomeTools and MobileMore link carries a ≥ 44px minimum height", () => {
  const lanes = [{ sport: "nfl", label: "NFL", hubHref: "/nfl/", stateLabel: "Live today" }, { sport: "nba", label: "NBA", hubHref: "/nba/", stateLabel: "Games today" }];
  const h = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(SportsToday, { lanes }), React.createElement(HomeTools), React.createElement(MobileMore, { items: [{ label: "How it works", sub: "x", href: "/methodology/" }] })));
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
  assert.match(read("src/components/sports/sport-switcher.tsx"), /minHeight: 44/);
  assert.match(read("src/components/saved/save-forecast-button.tsx"), /const minHeight = 44;/);
  assert.match(read("src/components/command-center/prediction-card.tsx"), /minHeight: 44, display: "inline-flex", alignItems: "center" \}\}>Open report/);
  assert.match(read("src/components/nfl/forecast/styles.tsx"), /\.nf-tab\{flex:0 0 auto;min-height:44px;/);
});
