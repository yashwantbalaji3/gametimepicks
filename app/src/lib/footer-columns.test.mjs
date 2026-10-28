/**
 * THE FOOTER IS GAMETIMEPICKS, IN FOUR COLUMNS (overnight 2026-10-28 · W3).
 *
 * Before: 48 links under the rail's groups (Main · Sports · Picks & parlays · Learn & record), a brand mark that read
 * "MODEL LAB" — the name of one page, /models — and the tagline "Simulation-first model picks." After: the GameTimePicks
 * wordmark alone, a tagline true of every sport, four columns that say what is in them, every destination still listed,
 * and the build stamp under a small "Site build" label.
 *
 * Run: npx tsx --test src/lib/footer-columns.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { destinationsFor, FOOTER_COLUMNS, FOOTER_COLUMN_LABEL, footerColumnOf, NAV_GROUP_LABEL } from "./navigation.ts";

const APP = process.cwd();
const FOOTER = fs.readFileSync(path.join(APP, "src/components/footer.tsx"), "utf8");
const code = FOOTER.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the brand is GameTimePicks — no 'Model Lab' marker, and the tagline says what the site is", () => {
  assert.doesNotMatch(code, /marker=/, "the footer wordmark carries no marker (it read MODEL LAB)");
  assert.match(code, /<BrandMark variant="compact" ambient \/>/);
  assert.match(code, /aria-label="GameTimePicks home"/);
  assert.match(code, /Sports forecasts, game simulations and a public record of how they did\./);
  assert.doesNotMatch(code, /Simulation-first model picks/);
  assert.doesNotMatch(code, /model lab/i, "Model Lab is a page in the sitemap, never the footer's brand");
});

test("four columns, in order: Sports · Picks & parlays · Results · About & legal", () => {
  assert.deepEqual(FOOTER_COLUMNS.map((c) => FOOTER_COLUMN_LABEL[c]), ["Sports", "Picks & parlays", "Results", "About & legal"]);
  assert.equal(FOOTER_COLUMN_LABEL.picks, NAV_GROUP_LABEL.products, "the rail and the footer name the products cluster the same way");
  assert.match(code, /FOOTER_COLUMNS\.map\(\(column\) =>/);
  assert.match(code, /footerColumnOf\(d\) === column/);
});

test("every footer destination lands in exactly one column, and no column is empty", () => {
  const all = destinationsFor("footer");
  const cols = Object.fromEntries(FOOTER_COLUMNS.map((c) => [c, all.filter((d) => footerColumnOf(d) === c).map((d) => d.href)]));
  assert.equal(Object.values(cols).flat().length, all.length, "no destination dropped or doubled");
  for (const c of FOOTER_COLUMNS) assert.ok(cols[c].length >= 3, `${c} has ${cols[c].length} links`);
  for (const h of ["/nfl", "/nba", "/mlb", "/epl", "/ufc", "/sports", "/live"]) assert.ok(cols.sports.includes(h), `${h} under Sports`);
  for (const h of ["/markets", "/build", "/bank-builder", "/moonshot", "/mr-dub"]) assert.ok(cols.picks.includes(h), `${h} under Picks & parlays`);
  for (const h of ["/results", "/results/picks", "/results/nba", "/results/parlay-lab", "/models"]) assert.ok(cols.results.includes(h), `${h} under Results`);
  for (const h of ["/about", "/learn", "/methodology", "/responsible-use"]) assert.ok(cols.about.includes(h), `${h} under About & legal`);
  /* legacy-route-hiding reads the first 6000 characters after "Site map": the live sport precedes the NBA record. */
  const order = all.slice().sort((a, b) => FOOTER_COLUMNS.indexOf(footerColumnOf(a)) - FOOTER_COLUMNS.indexOf(footerColumnOf(b)));
  assert.ok(order.findIndex((d) => d.href === "/mlb") < order.findIndex((d) => d.href === "/results/nba"));
});

test("legal and support sit in About & legal, and Terms/Privacy are linked only once they may publish", () => {
  assert.match(code, /const legal = column === "about";/);
  assert.match(code, /\{legal \? LEGAL_LINKS\.map/);
  assert.match(code, /\{legal && supportConfigured \?/);
  assert.match(FOOTER, /\.filter\(\(l\) => legalRouteIsPublic\(l\.id\)\)/, "the approval gate on the legal links is unchanged");
  assert.doesNotMatch(code, /href="\/(terms|privacy)/, "no hard-coded legal link");
});

test("the build stamp stays, de-emphasised under a small 'Site build' line; data sources and disclosures stay", () => {
  const line = code.slice(code.indexOf(">Site build<"));
  assert.ok(code.includes(">Site build<"), "a Site build label");
  assert.match(line.slice(0, 1500), /last build/);
  assert.match(line.slice(0, 1500), /<FooterFreshness/);
  assert.match(line.slice(0, 1500), /"live data"/, "the data mode the e2e footer spec reads");
  assert.match(code, /Data sources/);
  assert.match(code, /Not betting advice\. No promises of results\. Paper-only — educational and research use only\./, "KEEP: the disclosure is untouched");
});
