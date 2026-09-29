/**
 * P1-A · surfaces agree with their lanes, and no static label presents an older evaluation as today's.
 * Pure rules over fixtures + source guards on the one wiring each. Fixture dates only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { forecastRows } from "../sports/epl/forecast-view.ts";
import { sportStateFromProductDay, SPORT_STATES } from "../home/simulation-hub.mjs";

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("🔴 a model-only forecast still waiting for a price is a published forecast (the lane's rule)", () => {
  const row = (state, extra = {}) => ({ state, kickoffUtc: "2031-10-10T14:00:00Z", probs: { home: 0.5, draw: 0.25, away: 0.25 }, ...extra });
  const set = { rows: [row("READY_EXCEPT_ODDS", { modelOnly: true }), row("CURRENT_PRE_EVENT"), row("READY_EXCEPT_ODDS"), row("ABSTAIN", { probs: null })] };
  assert.equal(forecastRows(set).length, 2, "current + model-only; a priced-only refusal and an abstention are not forecasts");
});

test("🔴 Home's product day counts EPL through the lane's forecastRows, never its own state filter", () => {
  const src = code("src/lib/product-day/product-day.ts");
  const epl = src.slice(src.indexOf("function eplDay"), src.indexOf("function ufcDay"));
  assert.match(epl, /const current = forecastRows\(set\);/);
  assert.doesNotMatch(epl, /r\.state === "CURRENT_PRE_EVENT"/, "no competing definition of a published forecast");
});

test("a modelled event beyond the look-ahead is an in-season gap, not history; nothing modelled stays history", () => {
  const far = { state: "EVENT_UPCOMING", eligible: 10, productDate: "2031-10-10", nextEventUtc: null };
  assert.equal(sportStateFromProductDay(far, { slateDate: "2031-09-29" }), SPORT_STATES.IN_SEASON_NO_SLATE);
  assert.equal(sportStateFromProductDay({ ...far, productDate: "2031-10-03" }, { slateDate: "2031-09-29" }), SPORT_STATES.EVENT_THIS_WEEK, "inside the week: unchanged");
  assert.equal(sportStateFromProductDay({ ...far, eligible: 0 }, { slateDate: "2031-09-29" }), SPORT_STATES.HISTORICAL_ONLY, "an unmodelled upcoming slate: unchanged");
});

test("🔴 the builders' eligible-universe heading names its evaluated day and never says 'today'", async () => {
  const React = (await import("react")).default; globalThis.React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: EligibleUniverse, universeDayLabel } = await import("../../components/products/eligible-universe.tsx");
  assert.equal(universeDayLabel("2031-07-13"), "Sun, Jul 13");
  assert.equal(universeDayLabel(null), null);
  const html = renderToStaticMarkup(React.createElement(EligibleUniverse, { availability: { date: "2031-07-13", totalEligible: 3, sports: [{ sport: "mlb", label: "MLB", eligibleLegs: 3, events: 2, marketPricedOnly: true, reason: null }] } }));
  assert.match(html, /Eligible universe · evaluated Sun, Jul 13/);
  assert.doesNotMatch(html, /today/i, "a static page cannot know the reader's day, so it never claims it");
});
