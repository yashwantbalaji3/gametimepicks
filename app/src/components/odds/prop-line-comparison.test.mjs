/* Sport-agnostic prop-line section: rendered states on SYNTHETIC fixtures (founder P0 2026-10-29).
   Run: npx tsx --test src/components/odds/prop-line-comparison.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPropLineViews } from "../../lib/odds/prop-line-view.mjs";
import { NBA_PROP_LINE_ADAPTER } from "../../lib/sports/nba/prop-line-adapter.mjs";
import { FIXTURE_STATE_INPUTS as S } from "../../lib/odds/__fixtures__/prop-line-synthetic.mjs";

const { default: PropLineComparison, PropLineRow, PropLineLegend } = await import("./prop-line-comparison.tsx");
const ON = { public: true }, OFF = { public: false };
const view = (keys) => buildPropLineViews(keys.map((k) => S[k]), NBA_PROP_LINE_ADAPTER);
const r = (el) => renderToStaticMarkup(el);
const row = (k) => r(React.createElement(PropLineRow, { row: view([k]).rows[0] }));
const visible = (html) => html.replace(/<span class="sr-only">[\s\S]*?<\/span>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const sr = (html) => html.match(/<span class="sr-only">([\s\S]*?)<\/span>/)[1].replace(/&#x27;/g, "'");

test("switch off: the section and the legend render nothing at all", () => {
  assert.equal(r(React.createElement(PropLineComparison, { view: view(Object.keys(S)), display: OFF })), "");
  assert.equal(r(React.createElement(PropLineLegend, { legend: view(["over"]).legend, display: OFF })), "");
});

test("OVER row: player, market, model, line, OVER (word + ▲ + success token), +6.5, book, both prices, ET quote", () => {
  const h = row("over");
  assert.equal(visible(h), "Fixture Player One · AWY Points Model 36.0 Line 29.5 ▲ OVER +6.5 Fixturebook · Over −115 · Under −105 · Quoted Jan 15, 4:30 PM ET");
  assert.match(h, /data-prop-line-side="OVER" style="color:var\(--vault-success\)/);
  assert.match(sr(h), /^Fixture Player One, Points\. Over, model 36\.0 vs line 29\.5, plus 6\.5\. Fixturebook: Over minus 115, Under minus 105\. Quoted Jan 15, 4:30 PM ET\.$/);
});

test("UNDER row in danger red with the missing Under price as '—'; NEUTRAL row grey with =", () => {
  const u = row("under");
  assert.match(visible(u), /▼ UNDER −2\.3 Fixturebook · Over \+120 · Under — ·/);
  assert.match(u, /var\(--vault-danger\)/);
  assert.match(sr(u), /Under price unavailable/);
  const n = row("neutral");
  assert.match(visible(n), /= NEUTRAL 0\.0/);
  assert.match(n, /data-prop-line-side="NEUTRAL" style="color:var\(--vault-text-mute\)/);
  assert.doesNotMatch(n, /vault-(success|danger)/);
});

test("stale / unavailable / unsupported rows: uncoloured, say why, no OVER/UNDER, no difference", () => {
  const cases = { stale: /LINE STALE .*Fixturebook · Over \+140 · Under −175 · Quoted .* not compared The captured line is too old to compare\./, unmatched: /LINE UNAVAILABLE A line exists but could not be matched/, noLine: /LINE UNAVAILABLE No sportsbook line was captured/, unsupported: /UNSUPPORTED MARKET The model does not project this statistic\./ };
  for (const [k, re] of Object.entries(cases)) {
    const h = row(k);
    assert.match(visible(h), re, k);
    assert.doesNotMatch(visible(h), /\bOVER\b|\bUNDER\b|NEUTRAL|data-prop-line-diff/, k);
    assert.doesNotMatch(h, /vault-(success|danger)/, k);
  }
  assert.doesNotMatch(row("unmatched"), /Fixturebook/, "an unmatched line's book is never attributed to this player");
});

test("section: heading, honest counts, rows in input order, legend with the caveat; no ABOVE/BELOW anywhere a reader sees", () => {
  const h = r(React.createElement(PropLineComparison, { view: view(Object.keys(S)), display: ON, withoutLine: 3 }));
  assert.match(h, /<h2[^>]*>Model vs\. sportsbook line<\/h2>/);
  assert.match(visible(h), /4 compared · 2 stale · 2 unavailable · 2 unsupported · 3 projections have no captured line/);
  assert.match(h, /data-prop-line-legend/);
  assert.match(visible(h), /not a probability, a pick or a betting recommendation/);
  assert.doesNotMatch(h.replace(/data-[a-z-]+="[^"]*"/g, ""), /ABOVE|BELOW|\bEQUAL\b/);
  assert.doesNotMatch(visible(h), /\bedge\b|\block\b|best bet|\bvalue\b/i);
});

test("switch on, no verified line source: 'Sportsbook lines: Unavailable', no legend, no invented row", () => {
  const h = r(React.createElement(PropLineComparison, { view: view([]), display: ON }));
  assert.match(h, /Sportsbook lines: Unavailable/);
  assert.doesNotMatch(h, /<li|data-prop-line-legend/);
});

test("design: tokens only (no literal colour, no fallback inside var()), text ≥ 12 px, wraps without a media query", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/components/odds/prop-line-comparison.tsx"), "utf8");
  assert.doesNotMatch(src, /var\(--[a-z-]+\s*,/, "no fallback inside var()");
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-fA-F]{3,8}\b|rgba?\(/, "no literal colour");
  for (const m of src.matchAll(/fontSize:\s*(\d+)/g)) assert.ok(Number(m[1]) >= 12, `font ${m[1]}px`);
  assert.match(src, /flexWrap: "wrap"/);
  assert.doesNotMatch(src, /^"use client"/m, "server component");
});
