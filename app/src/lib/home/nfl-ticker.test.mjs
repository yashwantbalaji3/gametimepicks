/**
 * NFL game-day ticker selection — synthetic forecasts only.
 * Run (from app/): npx tsx --test src/lib/home/nfl-ticker.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { nflTickerItems } from "./nfl-ticker.mjs";

globalThis.React = React; // components rendered here rely on the automatic JSX runtime (repo pattern)

const f = (id, kick, home, away, state = "NO_STARTING_QB_ABSENCE", wp = { home: 0.5203, away: 0.4485, tieMass: 0.0312 }) => ({ providerEventId: id, kickoffUtc: kick, home: { abbr: home }, away: { abbr: away }, teamInputs: { state }, forecastSummary: wp ? { winProbability: wp } : null });
const NOW = "2026-11-15T12:00:00Z";

test("window, order, favourite from the official forecast (same rounding as the game page: one decimal)", () => {
  const items = nflTickerItems([
    f("3", "2026-11-16T01:15Z", "BAL", "LAC", undefined, { home: 0.6685, away: 0.3011 }),
    f("1", "2026-11-15T18:00Z", "GB", "MIN"),
    f("old", "2026-11-15T05:00Z", "X", "Y"),
    f("far", "2026-11-17T12:00Z", "X", "Y"),
  ], NOW);
  assert.deepEqual(items.map((i) => i.eventId), ["1", "3"]);
  assert.deepEqual(items[0].favorite, { abbr: "GB", pct: "52.0%" });
  assert.deepEqual(items[1].favorite, { abbr: "BAL", pct: "66.8%" }, "toFixed on the stored value — the game page's figure, not a re-rounding");
  assert.equal(nflTickerItems([f("n", "2026-11-15T18:00Z", "NO", "CAR", undefined, { home: 0.5265, away: 0.4447 })], NOW)[0].favorite.pct, "52.6%", "CAR@NO 11-15: the game page and post print 52.6%");
  assert.equal(items[0].href, "/nfl/game/1/");
  assert.equal(items[0].startedAtBuild, false);
});

test("QB-blind forecast shows no percentage; missing forecast says pending; unreadable clock ⇒ nothing", () => {
  const items = nflTickerItems([f("2", "2026-11-15T21:25Z", "LV", "SEA", "BLIND_TO_STARTING_QB_ABSENCE"), f("4", "2026-11-15T21:05Z", "ARI", "LAR", undefined, null)], NOW);
  assert.deepEqual(items.map((i) => [i.eventId, i.favorite, i.note]), [["4", null, "Forecast pending"], ["2", null, "QB change"]]);
  assert.deepEqual(nflTickerItems([f("1", "2026-11-15T18:00Z", "GB", "MIN")], "not a date"), []);
});

test("component: renders nothing without games; one link per game; QB note instead of a number", async () => {
  const { default: Ticker } = await import("../../components/home/nfl-game-day-ticker.tsx");
  assert.equal(renderToStaticMarkup(React.createElement(Ticker, { items: [] })), "");
  const items = nflTickerItems([f("1", "2026-11-15T18:00Z", "GB", "MIN"), f("2", "2026-11-15T21:25Z", "LV", "SEA", "BLIND_TO_STARTING_QB_ABSENCE")], NOW);
  const html = renderToStaticMarkup(React.createElement(Ticker, { items }));
  assert.equal((html.match(/data-ticker-event=/g) ?? []).length, 2);
  assert.match(html, /Model: GB <b>52\.0%<\/b>/);
  assert.match(html, /QB change · see game/);
  assert.doesNotMatch(html, /SEA <b>|LV <b>/);
  assert.match(html, /href="\/nfl\/game\/2\/?"/, "trailing slash is added by the site config in the real build");
});
