/**
 * NBA model-vs-line on the NEWLY wired surfaces (founder P0 2026-10-29 UI pass), SWITCH OFF = Production state:
 *   /nba hub game cards and /today NBA rows render byte-identically to the markup without the feature (the pages pass
 *   `undefined`, the components add no child slot), and the per-game summary builder reads nothing while off. With the
 *   switch forced on and SYNTHETIC records shaped for a committed lane, the same surfaces DO change (so the parity checks
 *   are not vacuous). Results / Tracking carries only a TODO hook (no element), and the Theater route's static imports
 *   stay the gate only.
 * Run: npx tsx --test src/components/nba/prop-line-surfaces-switch-off.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React; // TeamLogo compiles with the classic JSX runtime under tsx

import { NBA_LINE_DISPLAY } from "../../lib/sports/nba/line-board.mjs";

const APP = process.cwd();
const SRC = path.join(APP, "src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
const { NbaTodayGames } = await import("./hub-overview.tsx");
const { nbaTodaySlateFrom } = await import("../../lib/sport-hub/nba-hub.ts");
const { nbaPropLineSummaries, NbaPropLineSummary } = await import("./nba-prop-line-summaries.tsx");
const { default: TodayGames } = await import("../today/today-games.tsx");

const DATE = "2026-10-27";
const LANE = JSON.parse(fs.readFileSync(path.join(APP, `public/data/nba/experimental-public/${DATE}.json`), "utf8"));
const g0 = LANE.games[0], p0 = g0.players.home[0], p1 = g0.players.away[0];
const tipMs = Date.parse(g0.tipUtc);
const AS_OF = new Date(tipMs - 1800_000).toISOString();
// SYNTHETIC records (fake book, fake prices) shaped for this committed lane, so a leak would print something real-looking.
const rec = (p, family, marketKey, line, over, under) => ({ schema: "gtp.nba.prop-price@1", eventId: String(g0.providerEventId), providerAthleteId: String(p.providerAthleteId), family, providerMarketKey: marketKey, line, book: "fixturebook", overAmerican: over, underAmerican: under, capturedAt: new Date(tipMs - 3600_000).toISOString() });
const RECORDS = [rec(p0, "pts", "player_points", 3.5, -137, 117), rec(p1, "reb", "player_rebounds", 40.5, -110, -110)];
const GAMES = (slate) => slate.games.map((g) => [g.id, g.id, `/nba/simulation/${g.id}/#nba-game-prop-lines`]);
const LEAK = /fixturebook|Fixturebook|sportsbook line|data-prop-line|\bOVER\b|\bUNDER\b|NEUTRAL|−137|\+117|qualified sportsbook/;

test("the switch is off in this commit", () => assert.equal(NBA_LINE_DISPLAY.public, false));
// "switch on" below also qualifies every family (a test gate); with the committed gate no family shows a direction.
const QUALIFIED = { scope: "public", shows: () => true };

test("/nba hub cards, switch off: no summary map, nothing read, cards byte-identical; switch on: the summary appears", () => {
  const slate = nbaTodaySlateFrom({ nowIso: `${DATE}T15:00:00Z`, schedule: null, finals: null, lane: LANE });
  assert.ok(slate.games.length > 0, "the committed lane has games");
  let reads = 0;
  const lazy = () => { reads++; return LANE; };
  const off = nbaPropLineSummaries({ lane: lazy, games: GAMES(slate), asOf: AS_OF, priceRecords: RECORDS });
  assert.equal(off, undefined, "default display (the switch) is off → undefined");
  assert.equal(reads, 0, "nothing is read while off");
  const base = renderToStaticMarkup(React.createElement(NbaTodayGames, { slate }));
  assert.equal(renderToStaticMarkup(React.createElement(NbaTodayGames, { slate, lineSummaries: off })), base);
  assert.doesNotMatch(base, LEAK);
  assert.equal(nbaPropLineSummaries({ lane: () => LANE, games: GAMES(slate), asOf: AS_OF, priceRecords: RECORDS, display: { public: true } }), undefined, "switch on, committed direction gate: no direction anywhere → no summary");
  const on = nbaPropLineSummaries({ lane: lazy, games: GAMES(slate), asOf: AS_OF, priceRecords: RECORDS, display: { public: true }, directions: QUALIFIED });
  assert.equal(reads, 1);
  assert.deepEqual([...on.keys()], [String(g0.providerEventId)], "only the game with a compared line gets a summary");
  const withSummary = renderToStaticMarkup(React.createElement(NbaTodayGames, { slate, lineSummaries: on }));
  assert.notEqual(withSummary, base);
  assert.match(withSummary, /data-nba-line-summary=""><p data-prop-line-summary="nba"/);
  assert.match(withSummary, /of \d+ projections have a qualified sportsbook line/);
  assert.match(withSummary, new RegExp(`href="/nba/simulation/${g0.providerEventId}/?#nba-game-prop-lines"`));
  // every OTHER card is unchanged: removing the one summary block gives back the base markup
  assert.equal(withSummary.replace(/<div class="nbx-read" data-nba-line-summary="">[\s\S]*?<\/p><\/div>/, ""), base);
});

test("/today NBA rows, switch off: rows byte-identical; switch on: the row carries the compact summary", () => {
  const row = { date: DATE, startUtc: g0.tipUtc, time: "7:30 PM", sport: "nba", sportLabel: "NBA", matchup: `${g0.away.abbr} @ ${g0.home.abbr}`, status: "Scheduled", forecast: "Frozen", read: null, note: null, eventHref: `/nba/#nba-exp-${g0.providerEventId}`, resultHref: null };
  const props = { rows: [row], dayLabel: "Tuesday, October 27", asOf: "Oct 27, 9:00 AM ET" };
  const base = renderToStaticMarkup(React.createElement(TodayGames, props));
  const games = [[String(g0.providerEventId), row.eventHref, "/nba/projections/#nba-prop-lines"]];
  const off = nbaPropLineSummaries({ lane: LANE, games, asOf: AS_OF, priceRecords: RECORDS });
  assert.equal(off, undefined);
  assert.equal(renderToStaticMarkup(React.createElement(TodayGames, { ...props, lineSummaries: off })), base);
  assert.doesNotMatch(base, LEAK);
  const on = nbaPropLineSummaries({ lane: LANE, games, asOf: AS_OF, priceRecords: RECORDS, display: { public: true }, directions: QUALIFIED });
  const h = renderToStaticMarkup(React.createElement(TodayGames, { ...props, lineSummaries: on }));
  assert.notEqual(h, base);
  assert.match(h, /data-prop-line-summary="nba"/);
  assert.equal(h.replace(/<p data-prop-line-summary="nba"[\s\S]*?<\/p>/, ""), base, "only the summary is added");
});

test("NbaPropLineSummary: off → nothing; on without a published source or a compared line → nothing (never '0 OVER')", () => {
  assert.equal(renderToStaticMarkup(React.createElement(NbaPropLineSummary, { lane: LANE, eventId: String(g0.providerEventId), asOf: AS_OF, priceRecords: RECORDS })), "");
  const ON = { public: true };
  assert.equal(renderToStaticMarkup(React.createElement(NbaPropLineSummary, { lane: LANE, eventId: String(g0.providerEventId), asOf: AS_OF, display: ON })), "", "authorization off → the reader returns no records → nothing");
  assert.equal(renderToStaticMarkup(React.createElement(NbaPropLineSummary, { lane: LANE, eventId: String(LANE.games[1]?.providerEventId ?? "x"), asOf: AS_OF, priceRecords: RECORDS, display: ON })), "", "a game without a compared line");
  assert.equal(renderToStaticMarkup(React.createElement(NbaPropLineSummary, { lane: LANE, eventId: String(g0.providerEventId), asOf: AS_OF, priceRecords: RECORDS, display: ON })), "", "committed direction gate → nothing");
  const h = renderToStaticMarkup(React.createElement(NbaPropLineSummary, { lane: LANE, eventId: String(g0.providerEventId), asOf: AS_OF, priceRecords: RECORDS, display: ON, directions: QUALIFIED }));
  assert.match(h, /▲<\/span> 1 OVER/);
});

test("source pins: the pages hand the summaries through the gate; the gate is the first statement; no new surface on Results or the Theater route", () => {
  const hub = read("app/nba/page.tsx"), today = read("app/today/page.tsx"), gate = read("components/nba/nba-prop-line-summaries.tsx");
  assert.match(hub, /const lineSummaries = lane \? nbaPropLineSummaries\(\{/);
  assert.match(hub, /<NbaTodayGames slate=\{slate\} slip=\{slip\} gamePages=\{gamePages\} lineSummaries=\{lineSummaries\} \/>/);
  assert.match(today, /const nbaLineSummaries = nbaToday\?\.date === serverToday \? nbaPropLineSummaries\(\{/);
  assert.match(today, /lineSummaries=\{nbaLineSummaries\}/);
  assert.match(gate, /\}\): ReadonlyMap<string, React\.ReactNode> \| undefined \{\n  if \(!display\.public\) return undefined;/, "summaries: the gate is the first statement");
  assert.match(gate, /export function NbaPropLineSummary[\s\S]*?\}\) \{\n  if \(!display\.public\) return null;/);
  // Results / Tracking: a TODO hook only — no import, no element (an element would change the page while off)
  const results = read("app/results/nba/page.tsx");
  assert.match(results, /TODO\(nba-line-history/);
  assert.doesNotMatch(results, /import[^;]*(prop-line|nba-prop-lines|line-board)/);
  assert.doesNotMatch(read("app/nba/simulation/[eventId]/page.tsx"), /NbaPropLines|prop-line/, "the Theater route's static imports stay the gate only");
  // the components that list games take a ReactNode map — they never import a line / price module themselves
  for (const f of ["components/nba/hub-overview.tsx", "components/today/today-games.tsx"]) assert.doesNotMatch(read(f), /from "[^"]*(odds|line-board|line-comparison|prop-line|nba-prop-lines)[^"]*"/, f);
});
