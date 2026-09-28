/**
 * The REAL NflGameCard, rendered to markup in-process, must be markup the browser will not restructure
 * (#782) and must say no outcome word — in every lifecycle state, with a real-shaped live record.
 *
 * A rendered guard over the built export also exists (lib/ci/html-nesting-built.test.mjs); this one
 * runs without a build, so a mutation to the card is caught in seconds.
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { invalidNesting } from "../ci/html-nesting.mjs";

/* The components compile to the classic JSX runtime under tsx. */
globalThis.React = React;
const { NflGameCard } = await import("../../components/live/nfl-live-hub.tsx");

const F = (id, family, kind, extra) => ({
  predictionId: `401:${id}:${family}`, playerId: id, playerName: `Player ${id}`, team: "SEA", family, kind,
  label: family, modelValue: null, modelLow: null, modelHigh: null, modelProbability: null, line: null,
  sportsbook: "draftkings", frozenAt: "2026-09-27T14:42:05Z", portraitUrl: null, ...extra,
});
const GAME = {
  providerEventId: "401", matchup: "SEA @ WSH", kickoffUtc: "2026-09-27T17:00:00Z", awayAbbr: "SEA", homeAbbr: "WSH",
  awayTeam: "Seattle Seahawks", homeTeam: "Washington Commanders", awayLogo: "", homeLogo: "", awayRef: null, homeRef: null,
  trackedPredictionCount: 51, trackedPredictions: [], featuredSource: "live-props", eligibleForecastCount: 51, boardGeneratedAt: null,
  featured: [
    F("nfl-athlete-1", "player_reception_yds", "VOLUME", { modelValue: 107.5, modelLow: 58, modelHigh: 168, line: 92.5, portraitUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/1.png&w=96&h=96" }),
    F("nfl-athlete-2", "player_rush_yds", "VOLUME", { modelValue: 61.2, modelLow: 22, modelHigh: 110, line: 55.5 }),
    F("nfl-athlete-3", "anytime_td", "PROBABILITY", { modelProbability: 0.614 }),
  ],
};
const record = (vals, finals = false) => ({
  feed: "OK",
  artifact: { observedAt: "2026-09-27T18:39:30Z", rows: GAME.featured.map((f, i) => ({ predictionId: f.predictionId, live: { statValue: vals[i], observedAt: "2026-09-27T18:39:30Z" }, settlement: { state: "PENDING", finalStat: finals ? vals[i] : null } })) },
});
const env = (state, q) => ({ state, period: { number: q, label: q ? `Q${q}` : null, clock: q ? "08:41" : null }, competitors: { away: { score: q ? 10 : null }, home: { score: q ? 7 : null } } });

const CASES = [
  ["PRE", { state: "PRE", label: "Scheduled", envelope: env("PRE", 0) }],
  ["LIVE", { state: "LIVE", label: "Live", envelope: env("LIVE", 2), liveProps: record([63, 0, 1]), nowMs: Date.parse("2026-09-27T18:40:00Z") }],
  ["STALE", { state: "DELAYED", label: "Delayed", envelope: env("LIVE", 3), liveProps: record([88, 49, 0]), nowMs: Date.parse("2026-09-27T18:50:00Z") }],
  ["FINAL", { state: "FINAL_PENDING_SETTLEMENT", label: "Final — grading pending", envelope: env("FINAL", 4), liveProps: record([96, 58, 1], true) }],
];

for (const [name, props] of CASES) {
  test(`${name}: the real card renders repair-free markup and no outcome word`, () => {
    const html = renderToStaticMarkup(React.createElement("ul", null, React.createElement(NflGameCard, { game: GAME, ...props })));
    assert.ok(html.includes("Featured GameTimePicks forecasts"), "anti-vacuity: the featured block rendered");
    assert.deepEqual(invalidNesting(html), [], `${name}: the browser would restructure this card and hydration would fail`);
    const text = html.replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(text, /\b(?:HIT|MISS|WIN|LOSS|CASHED)\b/, `${name}: no outcome word before canonical settlement`);
  });
}

test("a featured row keeps its portrait (canonical id URL) or its initials fallback in every state", () => {
  for (const [, props] of CASES) {
    const html = renderToStaticMarkup(React.createElement("ul", null, React.createElement(NflGameCard, { game: GAME, ...props })));
    assert.ok(html.includes("headshots/nfl/players/full/1.png"), "the resolved combiner URL renders");
  }
});

test("V2C · full club names, a real touch target for View all, and a deterministic kickoff label", () => {
  const pre = renderToStaticMarkup(React.createElement("ul", null, React.createElement(NflGameCard, { game: GAME, ...CASES[0][1] })));
  const text = pre.replace(/<[^>]+>/g, " ");
  assert.match(text, /Washington Commanders/, "the full club name is rendered, never truncated in the markup");
  assert.match(pre, /<a[^>]*min-height:44px[^>]*href="\/nfl\/game\/401\/?"/, "View all is a 44px touch target to the game's forecasts");
  assert.match(text, /View all 51 forecasts/, "the honest eligible count");
  /* Kickoff from the schedule fact in a FIXED zone — no 'tonight', which would need the reader's clock. */
  assert.match(text, /Sun · 1:00 PM ET/);
  assert.doesNotMatch(text, /\btonight\b/i);
});
