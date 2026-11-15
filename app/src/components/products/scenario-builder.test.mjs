/**
 * Scenario builder card — synthetic legs only (no real price or player).
 * Run (from app/): npx tsx --test src/components/products/scenario-builder.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: SB } = await import("./scenario-builder.tsx");
const leg = (id, ev, team, price, tier = "5/5", probability = null) => ({ playerId: id, name: `P${id}`, team, eventId: ev, family: "player_receptions", side: "over", line: { line: 4.5, price, sportsbook: "draftkings", capturedAt: "2026-11-15T12:00:00Z" }, tier, decimal: price > 0 ? 1 + price / 100 : 1 + 100 / -price, probability });

test("empty: exact refusal reasons, no amount-driven invention", () => {
  const html = renderToStaticMarkup(React.createElement(SB, { product: "bankBuilder", legs: [], candidates: 1150, refusedBy: { NO_OBSERVED_LINE: 1150 }, asOf: "slate" }));
  assert.match(html, /data-scenario-state="NO_QUALIFYING_BUILD"/);
  assert.match(html, /Of 1,150 candidate legs, 0 passed/);
  assert.match(html, /1,150<\/td><td>no sportsbook line captured before kickoff/);
  assert.doesNotMatch(html, /Illustrative gross return/);
});

test("built across games: gross return from prices, independence stated; any miss loses all", () => {
  const html = renderToStaticMarkup(React.createElement(SB, { product: "bankBuilder", legs: [leg("a", "e1", "A", -150, "5/5", 0.6), leg("b", "e2", "B", -150, "5/5", 0.6)], candidates: 2, refusedBy: {}, asOf: "slate" }));
  assert.match(html, /data-scenario-state="BUILT"/);
  assert.match(html, /\$139</, "$50 × (5/3)² = $138.89, shown to the dollar above $100");
  assert.match(html, /Model chance all legs win: 36\.0%/);
  assert.match(html, /Any single losing leg loses the whole \$50\b/);
  assert.match(html, /history, not a probability/);
});

test("same game: no combined chance; Moonshot copy names the long shot", () => {
  const html = renderToStaticMarkup(React.createElement(SB, { product: "moonshot", legs: [leg("a", "e1", "A", 200, "5/5", 0.4), leg("b", "e1", "B", 200, "5/5", 0.4)], candidates: 2, refusedBy: {}, asOf: "slate" }));
  assert.match(html, /data-joint="JOINT_PROBABILITY_UNAVAILABLE"/);
  assert.doesNotMatch(html, /Model chance all legs win/);
  assert.match(html, /Same-game legs/);
  assert.match(html, /usually loses the whole stake/);
});
