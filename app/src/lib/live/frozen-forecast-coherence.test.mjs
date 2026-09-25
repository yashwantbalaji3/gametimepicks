/**
 * THE LIVE PANEL AND THE REPORT MUST AGREE THAT A FORECAST EXISTS (2026-09-25).
 *
 * ⚠ MEASURED ON A REAL SLATE. `projectMlbForecast` gated on `status === "ready"`. On 2026-09-25 that
 * is 2 of the 12 simulated games, so TEN MLB pages published
 *
 *     Overview     "Expected runs CHC 4.4 – 3.8 BOS · 54% · from 10,000 simulated games"
 *     Live module  "No GameTime pregame forecast for this game."
 *
 * on the same page, about the same game. `degraded` never meant absent — it means the inputs carry a
 * labelled weaker state (a prop-derived lineup rather than a confirmed batting order), and the report
 * renders those games in full.
 *
 * Run: npx tsx --test src/lib/live/frozen-forecast-coherence.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { projectMlbForecast } from "./forecast-join.mjs";

const APP = process.cwd();
const simDir = path.join(APP, "public/data/mlb/full-game-simulations");
const slates = () => (fs.existsSync(simDir) ? fs.readdirSync(simDir) : [])
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()
  .map((f) => JSON.parse(fs.readFileSync(path.join(simDir, f), "utf8"))).filter((a) => Array.isArray(a?.games));

/** The report's own test for whether it will render a game (mlb-full-game-report Overview). */
const reportWouldRender = (g) => Boolean(g?.winProbability && g?.runs && g?.totalRuns);

test("every game the REPORT renders also has a frozen forecast for the live panel", () => {
  const withGames = slates().filter((a) => a.games.some(reportWouldRender));
  assert.ok(withGames.length, "no committed slate renders a report — this guard would be vacuous");
  let checked = 0;
  for (const a of withGames.slice(0, 3)) {
    for (const g of a.games) {
      if (!reportWouldRender(g)) continue;
      checked += 1;
      assert.ok(projectMlbForecast(g),
        `${g.awayTeam}@${g.homeTeam} (status=${g.status}) is published by the report but refused by the live join — one page, two answers about whether a forecast exists`);
    }
  }
  assert.ok(checked >= 5, `only ${checked} games checked — too few to call this guard live`);
});

test("⚠ ANTI-VACUITY: the slate really does contain degraded games", () => {
  /* If every game were `ready` the guard above would pass for the wrong reason and stop protecting
     anything. On 2026-09-25 it was 10 of 12. */
  const degraded = slates().slice(0, 3).flatMap((a) => a.games).filter((g) => reportWouldRender(g) && g.status !== "ready").length;
  assert.ok(degraded > 0,
    "no non-ready simulated game in the sample — the defect class is unrepresented, so re-point this rather than trusting the silence");
});

test("a game with NO simulation is still refused — the fix widened the gate, it did not remove it", () => {
  assert.equal(projectMlbForecast(null), null);
  assert.equal(projectMlbForecast({ status: "unavailable", runs: null }), null);
  assert.equal(projectMlbForecast({ status: "unavailable", runs: { home: { median: 3, p10: 1, p90: 6 }, away: { median: 2, p10: 0, p90: 5 } } }), null,
    "unavailable genuinely has no simulation and must never project one");
  assert.equal(projectMlbForecast({ status: "degraded", runs: { home: null, away: null } }), null,
    "a game without per-team run bands has nothing to project");
});

test("the input state travels with the forecast, so a degraded one can be labelled as one", () => {
  const f = projectMlbForecast({ status: "degraded", completeness: { level: "degraded" }, gamePk: 1, runs: { home: { median: 3, p10: 1, p90: 7 }, away: { median: 3, p10: 0, p90: 7 } } });
  assert.equal(f.inputState, "degraded",
    "without this a caller must choose between showing a degraded forecast unqualified and not showing it at all");
});

test("⚠ TOTAL RUNS IS STILL NOT PROJECTED — MLB totals are PAUSED", () => {
  const f = projectMlbForecast({ status: "ready", gamePk: 1, totalRuns: { median: 8.5 }, runs: { home: { median: 4, p10: 1, p90: 8 }, away: { median: 4, p10: 1, p90: 8 } } });
  assert.ok(f, "a ready game projects");
  assert.ok(!("totalRuns" in f), "the paused market must not reach the live module through the widened gate");
});
