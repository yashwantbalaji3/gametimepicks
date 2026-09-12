import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildPublicWeather, publicWeatherRow, MAX_FORECAST_AGE_HOURS } from "./public-view.mjs";

const KICK = "2026-09-13T17:00:00.000Z";
const NOW = "2026-09-12T18:00:00Z";
const game = (o = {}) => ({
  espnEventId: "401872661", kickoffUtc: KICK, stadium: "Bank of America Stadium",
  state: "FORECAST", capturedAt: "2026-09-12T16:15:32Z",
  weather: { tempF: 87, windMph: 2, windFrom: "NW", precipPct: 0, shortForecast: "Sunny" },
  ...o,
});

test("a roofed stadium reports no weather rather than an invented calm", () => {
  const r = publicWeatherRow(game({ state: "DOME", weather: null }), NOW);
  assert.equal(r.indoors, true);
  assert.equal(r.tempF, null);
  assert.match(r.summary, /Indoors/);
});

test("an unknown roof carries its caveat inside the summary, where no surface can drop it", () => {
  const r = publicWeatherRow(game({ state: "FORECAST_ROOF_UNKNOWN" }), NOW);
  assert.match(r.summary, /no roof for this stadium/, "the caveat travels with the numbers");
  assert.match(r.summary, /87°F/, "and the numbers are still there");
});

test("a forecast captured after kickoff is not a pregame forecast", () => {
  assert.equal(publicWeatherRow(game({ capturedAt: "2026-09-13T18:00:00Z" }), "2026-09-13T18:30:00Z"), null);
  assert.equal(publicWeatherRow(game({ capturedAt: KICK }), NOW), null, "captured AT kickoff is not before it");
});

test("a forecast far older than the game is not these conditions", () => {
  const old = new Date(Date.parse(NOW) - (MAX_FORECAST_AGE_HOURS + 1) * 3.6e6).toISOString();
  assert.equal(publicWeatherRow(game({ capturedAt: old }), NOW), null);
  const justInside = new Date(Date.parse(NOW) - (MAX_FORECAST_AGE_HOURS - 1) * 3.6e6).toISOString();
  assert.ok(publicWeatherRow(game({ capturedAt: justInside }), NOW), "inside the window it still renders");
});

test("a notable wind is flagged, a light one is not", () => {
  assert.equal(publicWeatherRow(game(), NOW).notableWind, false);
  assert.equal(publicWeatherRow(game({ weather: { ...game().weather, windMph: 18 } }), NOW).notableWind, true);
});

test("an empty forecast yields no row — a blank is never rendered as a condition", () => {
  assert.equal(publicWeatherRow(game({ weather: {} }), NOW), null);
  assert.equal(publicWeatherRow(game({ weather: null }), NOW), null, "an open-air game with no forecast shows nothing");
  assert.equal(publicWeatherRow(null, NOW), null);
});

test("the artifact carries its attribution and the sentence that keeps it out of the model", () => {
  const doc = buildPublicWeather(
    { capturedAt: "2026-09-12T16:15:32Z", attribution: "US National Weather Service, public domain", week: "2026-wk01", games: [game(), game({ state: "DOME", weather: null })] },
    { nowIso: NOW },
  );
  assert.equal(doc.dataClass, "PUBLIC_DERIVED");
  assert.equal(doc.eventCount, 2);
  assert.match(doc.attribution, /National Weather Service/);
  assert.match(doc.modelUse, /^NOT_INGESTED/);
  assert.match(doc.modelUse, /never inside it/);
});

test("LIVE · the published artifact matches the capture it derives from, and claims no model use", () => {
  const p = path.join(process.cwd(), "public", "data", "nfl", "weather", "latest.json");
  if (!fs.existsSync(p)) return;
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.match(doc.modelUse, /NOT_INGESTED/, "the artifact must always say the model does not use it");
  assert.ok(doc.attribution, "public weather without its source attribution may not ship");
  for (const r of doc.rows ?? []) {
    assert.ok(Date.parse(r.capturedAt) < Date.parse(r.kickoffUtc), `${r.stadium}: captured after kickoff`);
    if (r.indoors) assert.equal(r.tempF, null, "a roofed stadium reports no temperature");
    else assert.ok(r.summary.length > 0, `${r.stadium}: an outdoor row must say something`);
  }
});

test("the registry still declares weather un-ingested — this release publishes context, not an input", () => {
  /* If a later change folds weather into the model, THIS is the line that must change with it, and
     a preregistration must have been scored first. The guard exists so the two cannot drift: a
     model that quietly used weather while the registry said otherwise is the worst of both. */
  const reg = fs.readFileSync(path.join(process.cwd(), "src", "lib", "sports", "nfl", "regular-season-inputs.mjs"), "utf8");
  assert.match(reg, /id: "weather", source: "NONE — not ingested"/, "the input registry is the model's own word on this");
  assert.match(reg, /totals carry no weather adjustment and say so/);
});

test("the registration that could change that is frozen, forward-scored, and single-look", () => {
  const p = path.join(process.cwd(), "..", "data", "internal", "research", "nfl", "preregistration-weather-totals-v1.json");
  if (!fs.existsSync(p)) return;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(d.public, false, "a registration is private research and changes nothing public");
  assert.ok(d.scoreGamesKickingOffFrom >= "2026-09-13", "it scores games that had not kicked off when it was written");
  assert.match(d.decisionLook.howMany, /^ONE/, "one look, or the bar is whatever the data turns out to be");
  assert.match(d.ifRejected, /not retried with a softer bar/);
  assert.match(d.whyNotTheHistoricalCorpus, /power check/i, "the past may size the sample and may not be the answer");
  // The feature must exclude the two states where there is no wind to test, or the population lies.
  assert.match(d.feature.definition, /DOME/);
  assert.match(d.feature.definition, /FORECAST_ROOF_UNKNOWN/);
  // And it must say what happens to the registry if it wins — the model and its own word cannot drift.
  assert.match(d.ifAccepted, /regular-season-inputs\.mjs/);
});
