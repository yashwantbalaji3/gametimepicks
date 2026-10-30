/* Model-versus-line cell: projection only unless authorized AND valid; colour never from the projection alone. */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { LineComparisonCell, LineComparisonLegend } = await import("./line-comparison-cell.tsx");
const r = (el) => renderToStaticMarkup(el);
const VALID = { direction: "ABOVE", median: 24.8, line: 22.5, difference: 2.3, book: "draftkings", capturedAt: "2026-10-28T20:00:00Z" };

test("private (default — the cell cannot apply the per-family direction gate, so it never follows the site switch) and switch off: projection only, no line, no colour, no legend", () => {
  for (const extra of [{}, { display: { public: false } }]) {
    const html = r(React.createElement(LineComparisonCell, { median: 24.8, comparison: VALID, ...extra }));
    assert.match(html, /data-line-cmp="projection-only"/);
    assert.doesNotMatch(html, /22\.5|draftkings|vault-success/);
    assert.equal(r(React.createElement(LineComparisonLegend, extra)), "");
  }
});

test("authorized + valid: +2.3 vs 22.5 in green with book and ET capture time; legend explains colours", () => {
  const html = r(React.createElement(LineComparisonCell, { median: 24.8, comparison: VALID, display: { public: true } }));
  assert.match(html, /data-line-cmp="ABOVE"/);
  assert.match(html, /\+2\.3 vs 22\.5/);
  assert.match(html, /var\(--vault-success\)/);
  assert.match(html, /draftkings · 4:00 PM ET/);
  assert.match(r(React.createElement(LineComparisonLegend, { display: { public: true } })), /not a probability, a pick or a betting recommendation/);
});

test("authorized but unavailable: projection only, neutral, with the reason as a title", () => {
  const html = r(React.createElement(LineComparisonCell, { median: 24.8, comparison: { direction: "UNAVAILABLE", reason: "STALE" }, display: { public: true } }));
  assert.match(html, /projection-only/);
  assert.match(html, /too old to compare/);
  assert.doesNotMatch(html, /vault-(success|danger)/);
});
