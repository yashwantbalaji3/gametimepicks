/**
 * "Model detail" beneath a featured forecast on /live — a closed disclosure for every reader. Only
 * canonical fields that exist; never a restated value; hydration-safe strings.
 *
 * (Built in SA2 as an Analyst-only layer; kept for everyone when the site-wide Simple/Analyst mode was
 * withdrawn — GameTimePicks is one experience, with local progressive disclosure.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { forecastDetailFacts, etTime } = await import("../../components/live/forecast-detail.tsx");
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

test("🔴 Model detail never restates a prediction, a line or a result", () => {
  const text = forecastDetailFacts(VOL, { modelStatus: MS, liveSource: "ESPN public box score" }).map((x) => `${x.label} ${x.value}`).join(" | ");
  for (const value of ["107.5", "92.5"]) assert.equal(text.includes(value), false, `${value} belongs to the row, not to its model detail`);
  assert.doesNotMatch(text, /\b(?:HIT|MISS|WIN|LOSS|CASHED)\b/);
  assert.match(text, /58 – 168/, "the range is shown as the model's own frozen percentiles");
});

test("🔴 every reader gets it: the server render carries a CLOSED 'Model detail', and the row's numbers are unchanged", () => {
  const game = { providerEventId: "401", matchup: "SEA @ WSH", kickoffUtc: "2026-09-27T17:00:00Z", awayAbbr: "SEA", homeAbbr: "WSH", awayTeam: "Seattle Seahawks", homeTeam: "Washington Commanders",
    awayLogo: "", homeLogo: "", awayRef: null, homeRef: null, trackedPredictionCount: 2, trackedPredictions: [], featured: [VOL, TD], featuredSource: "board", eligibleForecastCount: 2, boardGeneratedAt: null };
  const props = { game, envelope: { state: "PRE", period: { number: 0 }, competitors: { away: { score: null }, home: { score: null } } }, state: "PRE", label: "Scheduled" };
  const html = renderToStaticMarkup(React.createElement("ul", null, React.createElement(NflGameCard, { ...props, modelStatus: { ranges: MS, touchdowns: MS } })));
  assert.equal((html.match(/<summary[^>]*>Model detail<\/summary>/g) ?? []).length, 2, "one disclosure per featured forecast, in the server HTML");
  assert.doesNotMatch(html, /<details[^>]*\sopen/, "closed by default — progressive disclosure, not extra reading");
  assert.match(html, /Forward test running/, "the Model Lab status is inside the disclosure");
  assert.match(html, /107\.5/);
  const without = renderToStaticMarkup(React.createElement("ul", null, React.createElement(NflGameCard, props)));
  const strip = (s) => s.replace(/<details[\s\S]*?<\/details>/g, "");
  assert.equal(strip(html), strip(without), "the detail adds a disclosure and changes nothing else in the row");
});

test("🔴 hydration-safe times: plain ASCII separators, never Intl's locale-dependent spacing", () => {
  const s = etTime("2026-09-28T21:10:00Z");
  assert.equal(s, "Sep 28, 5:10 PM ET");
  assert.ok(!/[  ]/.test(s), "no no-break spaces — they differ between Node's ICU and browsers");
  assert.equal(etTime("2026-09-29T00:15:00Z"), "Sep 28, 8:15 PM ET", "ET, not UTC: a Monday-night kickoff stays on Monday");
  assert.equal(etTime("nope"), null);
  const src = fs.readFileSync(path.join(APP, "src/components/live/forecast-detail.tsx"), "utf8");
  assert.ok(!/\bET\.format\(/.test(src), "format() output is not used for rendered text");
});

test("the model status comes from the Model Lab's own owner — never a second label set", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/live/nfl-hub-data.ts"), "utf8");
  assert.match(src, /import \{ modelStatusFor \} from "@\/lib\/command-center\/model-status"/);
  assert.match(src, /PUBLIC_STATE_LABEL\[it\.state\]/, "labels are the Model Lab's PUBLIC_STATE_LABEL");
});

test("🔴 one experience: no site-wide view mode, toggle or mode preference exists", () => {
  const walk = (dir, acc = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, acc); else if (/\.(tsx?|mjs|css)$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) acc.push(f); } return acc; };
  const hits = walk(path.join(APP, "src")).filter((f) => /AnalystOnly|useViewMode|ViewModeToggle|gtp\.view\.v1|gtp-view-mode/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(hits.map((f) => path.relative(APP, f)), [], "GameTimePicks is one experience; detail is disclosed locally, never by a global mode");
});
