/**
 * SHARED TRENDS · NBA PARITY (trends-shared 2026-11-11): after the split into one shared board + per-sport adapters, the
 * NBA page renders EXACTLY what it rendered before — every state of the frozen snapshot (taken on claude/trends-slice
 * d0dda3a07f, before the refactor): the HTML, the drawer file and the model, byte for byte — with ONE deliberate
 * delta (founder 2026-11-11, records never mixed): the hidden sportsbook-line block now carries data-trn-record="line" and
 * its SPORTSBOOK LINE badge. That delta is applied to the frozen HTML explicitly below; nothing else may differ.
 * Run: npx tsx --test src/components/trends/trends-nba-parity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
process.env.__NEXT_TRAILING_SLASH = "true";
const T = await import("../../lib/sports/nba/trends.ts");
const { snapshotCases } = await import("../../lib/sports/nba/__fixtures__/trends-fixture.mjs");
const { default: View } = await import("../nba/trends/trends-view.tsx");
const SNAP = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/lib/sports/nba/__fixtures__/trends-nba-snapshot.json"), "utf8"));

test("NBA adapter + shared board = the pre-split NBA Trends, every state, byte for byte (+ the line badge only)", () => {
  const cases = snapshotCases(T);
  assert.equal((SNAP.html.tonight.match(/data-trn-hit=/g) ?? []).length, 2, "the frozen states include line blocks, so the delta is exercised");
  assert.deepEqual(Object.keys(cases), Object.keys(SNAP.html));
  for (const [k, t] of Object.entries(cases)) {
    const expected = SNAP.html[k].replace(/<div hidden="" data-trn-hit="([^"]+)">/g, (_, id) => `<div hidden="" data-trn-hit="${id}" data-trn-record="line"><span class="trn-badge is-line">SPORTSBOOK LINE</span>`);
    assert.equal(renderToStaticMarkup(React.createElement(View, { trends: t })), expected, `${k}: page HTML`);
    assert.deepEqual(T.trendsDrawerPayload(t), SNAP.payload[k], `${k}: drawer file`);
    assert.deepEqual(JSON.parse(JSON.stringify(t)), SNAP.model[k], `${k}: model`);
  }
});

test("the NBA page is the shared board: no second table, filter or panel implementation", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/components/nba/trends/trends-view.tsx"), "utf8");
  assert.match(src, /<TrendsBoard model=\{trends\} spec=\{NBA_TRENDS_SPEC\} \/>/);
  assert.doesNotMatch(src, /<table|<select|useState/);
  assert.deepEqual(fs.readdirSync(path.join(process.cwd(), "src/components/nba/trends")).sort(), ["trends-section.tsx", "trends-view.tsx"]);
});
