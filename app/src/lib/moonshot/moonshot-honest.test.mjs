/**
 * Moonshot V2 · H — the pool passes the ONE card-leg rule; the record states its window and what the fold has not
 * taken in; the legacy tracker never prints the current record and never invents a 0–0; MLB prop keys are props.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: RecordComposition } = await import("../../components/bank-builder/record-composition.tsx");
const src = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

test("🔴 M-1 · the Moonshot pool passes every leg through the ONE card-leg rule", () => {
  const acc = src("src/lib/daily-portfolio/accounting.ts");
  const block = acc.slice(acc.indexOf("const poolForMoon"), acc.indexOf("const moonRungs"));
  // The gate must BE the filter expression — `true || !legIsMarketContext(…)` would still contain the call.
  assert.match(block, /\.filter\(\(p\) => !legIsMarketContext\(\{ sport: String\(p\.sport \?\? "MLB"\)\.toUpperCase\(\), market: p\.marketKey \?\? null \}, marketContext\)\)/);
});

test("🔴 M-2 · the record says how far it runs and what the fold has not taken in — for Moonshot's own results", () => {
  const html = renderToStaticMarkup(React.createElement(RecordComposition, {
    product: "moonshot", recordLabel: "4–35", window: { from: "2026-08-15", to: "2026-09-22" }, composition: null,
    backlog: { after: "2026-09-22", haltedAt: "2026-09-23", blocking: [{ product: "moonshot", lane: "A", legs: [{ matchup: "Toronto Blue Jays @ Baltimore Orioles", selection: "Over 7" }] }], decided: { "bank-builder": { won: 5, lost: 5 }, moonshot: { won: 0, lost: 5 } } },
  }));
  assert.match(html, /Record 4–35/);
  assert.match(html, /to Tue, Sep 22/);
  assert.match(html, /Not yet in this record: 5 decided Moonshot results after Tue, Sep 22 \(0–5\)/, "Moonshot's own decided results, not Bank Builder's");
  const page = src("src/app/moonshot/page.tsx");
  assert.match(page, /<RecordComposition product="moonshot"/);
  assert.match(page, /\$\{moonshot\.displayRecord\.fromDate \?\? "—"\} to \$\{moonshotFoldedThrough \?\? "—"\}/, "the tile names its end date");
});

test("🔴 the legacy tracker never prints the current record, never invents 0–0, and treats batter_/pitcher_ keys as props", () => {
  const page = src("src/app/moonshot/page.tsx");
  const call = page.slice(page.indexOf("<MoonshotLaneTracker"), page.indexOf("/>", page.indexOf("<MoonshotLaneTracker")));
  assert.doesNotMatch(call, /record=\{/, "the current record is not handed to the legacy tracker");
  const t = src("src/components/moonshot/moonshot-lane-tracker.tsx");
  assert.match(t, /const rec = record \?\? null;/);
  assert.doesNotMatch(t, /record \?\? \{ wins: 0, losses: 0/, "a missing record is never 0–0");
  assert.match(t, /\/\^\(\?:player\|batter\|pitcher\)_\/i/);
});
