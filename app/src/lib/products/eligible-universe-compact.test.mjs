/**
 * S1 (2026-09-30) · the compact eligible universe on /bank-builder and /moonshot is one line that opens.
 * What must stay VISIBLE when it is closed: the evaluated day, the count, and the market-priced caveat.
 * Only the per-sport reasons and the selection rule move behind the disclosure.
 *
 * Run: npx tsx --test src/lib/products/eligible-universe-compact.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
globalThis.React = React;
const { default: EligibleUniverse } = await import("../../components/products/eligible-universe.tsx");

const availability = { date: "2031-07-13", totalEligible: 24, sports: [
  { sport: "mlb", label: "MLB", eligibleLegs: 24, events: 4, marketPricedOnly: true, reason: null },
  { sport: "ufc", label: "UFC", eligibleLegs: 0, events: 0, marketPricedOnly: false, reason: "not eligible for prediction products" },
] };
const render = (props) => renderToStaticMarkup(React.createElement(EligibleUniverse, props));
const outsideDetails = (h) => h.replace(/<details[\s\S]*<\/details>/, "");

test("compact · closed state still names the evaluated day, the count and the contributing sport", () => {
  const h = render({ availability, compact: true });
  assert.match(h, /<details/);
  const summary = h.match(/<summary[\s\S]*<\/summary>/)?.[0] ?? "";
  assert.match(summary, /Eligible universe · evaluated Sun, Jul 13/);
  assert.match(summary, /24 eligible legs from MLB/);
  assert.doesNotMatch(h, /today/i);
});

test("compact · the market-priced caveat is never behind the disclosure", () => {
  const h = render({ availability, compact: true });
  assert.match(outsideDetails(h), /priced by the sportsbook market with no forecast behind it/);
  assert.doesNotMatch(outsideDetails(h), /not eligible for prediction products/, "per-sport reasons are the detail");
  assert.match(h, /not eligible for prediction products/, "…and they are still on the page");
});

test("compact · no market-only leg, no caveat; the full variant is unchanged in content", () => {
  const modelled = { ...availability, sports: availability.sports.map((s) => ({ ...s, marketPricedOnly: false })) };
  assert.doesNotMatch(render({ availability: modelled, compact: true }), /no forecast behind it/);
  const full = render({ availability });
  assert.doesNotMatch(full, /<details/);
  for (const t of [/Eligible universe · evaluated Sun, Jul 13/, /24 eligible legs · 4 games/, /no forecast behind it/, /A sport enters only/]) assert.match(full, t);
});
