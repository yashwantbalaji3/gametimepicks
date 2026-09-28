/**
 * SA2 · the Analyst layer beneath a featured forecast — only canonical fields that exist, never a
 * restated value, and absent from every Simple (server) render.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { forecastDetailFacts } = await import("../../components/live/forecast-detail.tsx");
const { NflGameCard } = await import("../../components/live/nfl-live-hub.tsx");
const APP = path.resolve(new URL("../../..", import.meta.url).pathname);

const VOL = { predictionId: "e:1:player_reception_yds", playerId: "nfl-athlete-1", playerName: "A", team: "SEA", family: "player_reception_yds", kind: "VOLUME", label: "Receiving yards",
  modelValue: 107.5, modelLow: 58, modelHigh: 168, modelProbability: null, line: 92.5, sportsbook: "draftkings", frozenAt: "2026-09-27T14:42:05Z",
  marketCapturedAt: "2026-09-26T16:49:46Z", familyState: "PUBLISHED", portraitUrl: null };
const TD = { ...VOL, predictionId: "e:2:anytime_td", family: "anytime_td", kind: "PROBABILITY", label: "Anytime touchdown", modelValue: null, modelLow: null, modelHigh: null, modelProbability: 0.614, line: null };
const MS = { state: "FORWARD_TEST", label: "Forward test running", headline: "Graded on new games" };

test("only canonical fields that exist — missing ones are omitted, never padded", () => {
  const full = forecastDetailFacts(VOL, { modelStatus: MS, liveSource: "ESPN public box score", lastObservedAt: "2026-09-27T18:35:34Z" }).map((x) => x.label);
  assert.deepEqual(full, ["Pregame range (10th–90th pct.)", "Model status", "Board publication", "Forecast frozen", "Line source", "Live measurement"]);
  const bare = forecastDetailFacts({ ...VOL, modelLow: null, familyState: null, frozenAt: null, sportsbook: null, marketCapturedAt: null });
  assert.deepEqual(bare, [], "with nothing canonical to show, nothing is shown");
  const td = forecastDetailFacts(TD, { modelStatus: MS }).map((x) => x.label);
  assert.equal(td.includes("Pregame range (10th–90th pct.)"), false, "a touchdown has no yardage range");
  assert.equal(forecastDetailFacts(VOL).some((x) => x.label === "Live measurement"), false, "no live source is claimed before a record is read");
});

test("🔴 the Analyst detail never restates a prediction, a line or a result", () => {
  const text = forecastDetailFacts(VOL, { modelStatus: MS, liveSource: "ESPN public box score" }).map((x) => `${x.label} ${x.value}`).join(" | ");
  for (const value of ["107.5", "92.5"]) assert.equal(text.includes(value), false, `${value} belongs to the row both modes share, not to the Analyst layer`);
  assert.doesNotMatch(text, /\b(?:HIT|MISS|WIN|LOSS|CASHED)\b/);
  assert.match(text, /58 – 168/, "the range is shown as the model's own frozen percentiles");
});

test("🔴 a Simple (server) render carries no Model detail — and the row's numbers are the same with or without it", () => {
  const game = { providerEventId: "401", matchup: "SEA @ WSH", kickoffUtc: "2026-09-27T17:00:00Z", awayAbbr: "SEA", homeAbbr: "WSH", awayTeam: "Seattle Seahawks", homeTeam: "Washington Commanders",
    awayLogo: "", homeLogo: "", awayRef: null, homeRef: null, trackedPredictionCount: 2, trackedPredictions: [], featured: [VOL, TD], featuredSource: "board", eligibleForecastCount: 2, boardGeneratedAt: null };
  const props = { game, envelope: { state: "PRE", period: { number: 0 }, competitors: { away: { score: null }, home: { score: null } } }, state: "PRE", label: "Scheduled" };
  const withStatus = renderToStaticMarkup(React.createElement("ul", null, React.createElement(NflGameCard, { ...props, modelStatus: { ranges: MS, touchdowns: MS } })));
  const without = renderToStaticMarkup(React.createElement("ul", null, React.createElement(NflGameCard, props)));
  assert.doesNotMatch(withStatus, /Model detail|Forecast frozen|Board publication/, "the Analyst layer is not in the server HTML");
  assert.equal(withStatus, without, "Analyst-only inputs change nothing a Simple reader receives");
  assert.match(withStatus, /107\.5/);
});

test("the model status comes from the Model Lab's own owner — never a second label set", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/live/nfl-hub-data.ts"), "utf8");
  assert.match(src, /import \{ modelStatusFor \} from "@\/lib\/command-center\/model-status"/);
  assert.match(src, /PUBLIC_STATE_LABEL\[it\.state\]/, "labels are the Model Lab's PUBLIC_STATE_LABEL");
  const row = fs.readFileSync(path.join(APP, "src/components/live/featured-forecast-row.tsx"), "utf8");
  assert.match(row, /<AnalystOnly>\s*<ForecastDetail/, "the detail is rendered only through AnalystOnly");
});
