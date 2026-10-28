/**
 * ONE NAME PER URL, ON EVERY NAVIGATION SURFACE (overnight 2026-10-28 · W3).
 *
 * The rail, the top bar, the phone bar, the phone/tablet Menu sheet and the footer all render the canonical label from
 * lib/navigation.ts. Search was the surface that had drifted: it listed /today as "Today's Picks" (the name reserved
 * for /markets — p1-journeys.test), /build as "Parlay Center" and /system-status as "System status", while every menu
 * said Today, Parlays and System Status. Two nav labels had also drifted from the page they open ("Research engine" for
 * a page titled Research; "Deep-dive track record" for a page whose H1 is "Model audit deep-dive").
 *
 * Run: npx tsx --test src/lib/nav-label-parity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { NAV_DESTINATIONS } from "./navigation.ts";
import { MOBILE_NAV_ITEMS } from "./nav-active-route.ts";
import { searchHref, searchPageRows } from "./search/search-pages.ts";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const norm = (h) => (h === "/" ? "/" : h.replace(/\/$/, ""));

test("every URL carries exactly one label across the rail, top bar, phone bar, Menu sheet, footer and search", () => {
  const labels = new Map();
  const note = (surface, href, label) => {
    const k = norm(href);
    if (!labels.has(k)) labels.set(k, new Map());
    labels.get(k).set(surface, label);
  };
  for (const d of NAV_DESTINATIONS) note("registry (rail · top bar · Menu sheet · footer)", d.href, d.label);
  for (const i of MOBILE_NAV_ITEMS) note("phone bar (accessible name)", i.href, i.label);
  for (const r of searchPageRows()) note("search", r.href, r.label);
  const split = [];
  for (const [href, bySurface] of labels) {
    if (new Set(bySurface.values()).size > 1) split.push(`${href}: ${[...bySurface].map(([s, l]) => `${s}="${l}"`).join(" · ")}`);
  }
  assert.deepEqual(split, [], "one URL, more than one name");
  assert.ok(labels.size >= 30, "anti-vacuity: the whole registry was compared");
});

test("every menu destination is a search page, under its menu label, exactly once", () => {
  const rows = searchPageRows();
  for (const d of NAV_DESTINATIONS) {
    const hits = rows.filter((r) => r.href === searchHref(d.href));
    assert.equal(hits.length, 1, `${d.href}: ${hits.length} search page rows`);
    assert.equal(hits[0].label, d.label, `${d.href}: search says "${hits[0].label}", the menus say "${d.label}"`);
  }
  const hrefs = rows.map((r) => r.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "no URL is listed twice under two names");
  assert.ok(hrefs.includes("/models/") && hrefs.includes("/results/forecasts/"), "Model Lab and the Forecast Record overview stay searchable");
});

test("the retired search names are gone — and /today is never 'Today's Picks'", () => {
  const rows = searchPageRows();
  assert.equal(rows.find((r) => r.href === "/today/")?.label, "Today");
  assert.equal(rows.find((r) => r.href === "/build/")?.label, "Parlays");
  assert.equal(rows.find((r) => r.href === "/system-status/")?.label, "System Status");
  for (const old of ["Today's Picks", "Parlay Center", "System status"]) {
    assert.ok(!rows.some((r) => r.label === old), `no search page row is named "${old}"`);
  }
  /* A reader typing the old name still lands: it is a search WORD on the one row, not a second name. */
  assert.ok(rows.find((r) => r.href === "/build/").terms.includes("parlay center"));
});

test("each surface renders the registry's label, never its own", () => {
  assert.match(read("src/components/command-rail.tsx"), /label: d\.label,/, "rail");
  assert.match(read("src/components/nav.tsx"), /label: d\.label,/, "top bar");
  assert.match(read("src/components/mobile-bottom-nav.tsx"), />\{d\.label\}</, "Menu sheet");
  assert.match(read("src/components/footer.tsx"), /\{d\.label\}/, "footer");
  assert.match(read("src/lib/search/search-pages.ts"), /label: d\.label, sub: d\.desc/, "search");
});

test("the two relabelled destinations now carry the page's own name", () => {
  const label = (href) => NAV_DESTINATIONS.find((d) => d.href === href)?.label;
  assert.equal(label("/research"), "Research");
  assert.match(read("src/app/research/page.tsx"), /<Eyebrow>Research<\/Eyebrow>/, "the /research page calls itself Research");
  assert.equal(label("/results/model-audit"), "Model audit deep-dive");
  assert.match(read("src/app/results/model-audit/page.tsx"), /<h1[\s\S]{0,200}?Model audit deep-dive/, "…the H1 of /results/model-audit");
  assert.equal(label("/responsible-use"), "Responsible Use");
  assert.match(read("src/app/responsible-use/page.tsx"), /title: "Responsible Use/, "…and the title of /responsible-use");
});
