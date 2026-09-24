/**
 * BUSIEST-STATE HOMEPAGE FIXTURE (P329). The first-viewport ceiling (1,820 rendered words, first-viewport-budget.test)
 * is measured on whatever the calendar happens to produce; the first three-lane day landed at 1,822. This test owns a
 * deterministic MAXIMUM: four first-class lanes each featuring a card, rendered through the SAME component the homepage
 * uses (components/command-center/command-center.tsx via react-dom/server), plus the measured started-state allowance.
 *
 *   pure     the four-lane fixture's rendered words never exceed LANE_BUDGET (a lane copy change fails here first)
 *   built    fixture lanes + the built page's NON-lane words + the evening started-chip allowance ≤ the ceiling —
 *            the same strip/word rules as the budget test, on the real export (assert-when-built)
 *
 * Run: npx tsx --test src/lib/uiux/busiest-state.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React; // the component tree compiles against the classic runtime under tsx
const CC = await import("../../components/command-center/command-center.tsx");
const CommandCenter = CC.default?.default ?? CC.default;

export const CEILING = 1820;
/** Measured 2026-08-27: started-state chips add +69 words between a pregame and an in-progress evening. */
export const STARTED_CHIP_ALLOWANCE = 69;
/** The four-lane fixture measured 387 words on 2026-09-15; growth past this is lane copy creeping. */
export const LANE_BUDGET = 400;

const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, "'").replace(/\s+/g, " ");
const words = (t) => (t.match(/[A-Za-z0-9'’%$+–—-]+/g) ?? []).length;

const status = (id, family, state) => ({ id, family, state, headline: `${family}: ${state.toLowerCase().replace(/_/g, " ")} on a live record of six hundred games`, detail: "One plain sentence with the evidence behind the state, as the scorecard writes it for this family.", n: 605, source: "scorecard" });
const fresh = { state: "DELAYED", updatedAt: "2026-09-19T12:00:00Z", label: "Updated Sep 19, 8:00 AM ET · update due", ageHours: 20 };
const card = (sport, id, away, home, code, context) => ({
  id, sport, href: `/x/${id}/`, lifecycle: "PREGAME", startUtc: "2026-09-19T23:10:00Z", startLabel: "Sat 7:10 PM ET", context,
  away: { name: away, code: code[0], favoured: false }, home: { name: home, code: code[1], favoured: true },
  forecast: { label: "Winner", value: `${code[1] ?? home} 71%`, sub: `Projected ${code[0] ?? away} 24–27 ${code[1] ?? home} · by 3` },
  signal: { kind: "PROBABILITY", probability: 0.71, of: `${code[1] ?? home} to win` }, why: null,
  risks: ["Experimental: tested on past seasons, not validated to out-predict the sportsbook market.", "Game totals miss by a lot: about 8 in 10 land inside the 34–58 range."],
  status: status(`${sport}_lead`, "Winner calls", "WATCH"), freshness: fresh, result: null, settlement: { kind: "mlb-game", gamePk: 1, family: "Winner" },
});
export const BUSIEST_LANES = [
  { sport: "nfl", label: "NFL", hubHref: "/nfl/", simulateHref: "/simulate/?sport=nfl", state: "LIVE", stateLabel: "Event this week", contextLine: "No NFL games today · Week 3: 16 game forecasts published · next kickoff 2026-09-24 (Los Angeles Rams @ San Francisco 49ers)", freshness: fresh, statuses: [status("nfl_team", "Game forecasts", "EXPERIMENTAL"), status("nfl_players", "Player ranges", "FORWARD_TEST")], featured: card("nfl", "nfl-1", "Los Angeles Rams", "San Francisco 49ers", ["LAR", "SF"], "Week 3 · regular season"), emptyLine: null, secondary: null },
  { sport: "mlb", label: "MLB", hubHref: "/mlb/", simulateHref: "/simulate/?sport=mlb", state: "LIVE", stateLabel: "Live today", contextLine: "15 games · 682 model leans · 15 simulations ready · updated 10:32 AM ET", freshness: fresh, statuses: [status("mlb_moneyline", "Winner calls", "WATCH"), status("mlb_total", "Game totals", "PAUSED")], featured: card("mlb", "mlb-1", "Los Angeles Dodgers", "Philadelphia Phillies", ["LAD", "PHI"], "Over 8.5 · 54% · PHI -1.5 · 51% · Simulation strength: very strong simulation"), emptyLine: null, secondary: null },
  { sport: "epl", label: "Premier League", hubHref: "/epl/", simulateHref: "/simulate/?sport=epl", state: "LIVE", stateLabel: "Matchweek this weekend", contextLine: "Matchweek 5 · 10 fixtures forecast · first kickoff Sat 7:30 AM ET", freshness: fresh, statuses: [status("epl_match_model", "Match model", "VALIDATED"), status("epl_forward", "Forward test", "FORWARD_TEST")], featured: card("epl", "epl-1", "Manchester United", "Tottenham Hotspur", ["Manchester United", "Tottenham Hotspur"], "Matchweek 5 · Draw 25% · 2.7 goals expected"), emptyLine: null, secondary: null },
  { sport: "ufc", label: "UFC", hubHref: "/ufc/", simulateHref: "/simulate/?sport=ufc", state: "LIVE", stateLabel: "Event this week", contextLine: "11 of 13 bouts predicted · card 2026-09-19 · UFC 331: Van vs. Pantoja 2", freshness: fresh, statuses: [status("ufc_model", "Fight model", "VALIDATED"), status("ufc_live", "Live record", "TOO_EARLY")], featured: card("ufc", "ufc-1", "Alexandre Pantoja", "Joshua Van", [null, null], "UFC 331: Van vs. Pantoja 2 · title fight · Most likely by decision · round 3+"), emptyLine: null, secondary: null },
];

export function renderBusiestLanes() {
  return renderToStaticMarkup(React.createElement(CommandCenter, { lanes: BUSIEST_LANES, heading: "Simulation Hub", subtitle: "4 sports with activity on today's slate" }));
}

test("the four-lane fixture renders through the real Command Center and stays inside the lane budget", () => {
  const html = renderBusiestLanes();
  assert.equal((html.match(/<article class="gtp-pcard/g) ?? []).length, 4, "every lane features a card");
  const w = words(strip(html));
  assert.ok(w <= LANE_BUDGET, `busiest lanes render ${w} words > LANE_BUDGET ${LANE_BUDGET} — lane copy grew; trim it, do not raise the budget`);
});

test("BUILT · fixture lanes + the page's non-lane words + the evening allowance fit under the ceiling", () => {
  /*
   * ⚠ WRITTEN AS "out/index.html" ON PURPOSE. run-suite.mjs decides a test's PHASE by scanning its
   * source for the export, and its pattern cannot span the `)` inside `path.join(process.cwd(), …)`.
   * Spelled the old way this file was classified as a UNIT test, ran before the build, found no
   * out/ and took the assert-when-built early return — so it passed blind in CI on every run since
   * it was written. The literal `out/` is what puts it in the post-build phase, where it is real.
   */
  const p = path.join(process.cwd(), "out/index.html");
  if (!fs.existsSync(p)) return; // buildless lane: assert-when-built
  const page = fs.readFileSync(p, "utf8");
  const lanesOnPage = (page.match(/<section aria-labelledby="command-center-h"[\s\S]*?<\/section>/g) ?? []).reduce((s, x) => s + words(strip(x)), 0);
  const total = words(strip(page));
  const nonLane = total - lanesOnPage;
  const fixture = words(strip(renderBusiestLanes()));
  const busiest = nonLane + fixture + STARTED_CHIP_ALLOWANCE;
  assert.ok(busiest <= CEILING, `busiest state ${busiest} = non-lane ${nonLane} + fixture lanes ${fixture} + started chips ${STARTED_CHIP_ALLOWANCE} > ceiling ${CEILING}; trim ${busiest - CEILING} non-prediction words`);
});
