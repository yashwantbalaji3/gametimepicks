/**
 * NBA GAME PAGE LINKS (Batch 1 fix #2, 2026-10-29): the /nba game cards, the "Forecast vs. Actual" rows and /today's NBA
 * rows link to /nba/simulation/<id>/ ONLY when that page is exported — the ids the route's generateStaticParams publishes
 * (live Game Simulation ids + settled ids, gate on). A game whose page is not exported (today's unpublished games, a
 * flag-OFF build) gets no link, so the post-build dead-link guard stays green.
 * Run (from app/): npx tsx --test src/components/nba/game-page-links.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
process.env.__NEXT_TRAILING_SLASH = "true";
const { NBA_GAME_PAGE_TEXT, nbaGamePageHref, nbaGamePageHrefIfExported, nbaGamePageLabel } = await import("./game-page-link.mjs");
const { nbaExportedGamePageIds, settledSimulationParams } = await import("./settled-simulation-data.ts");
const { NbaGameList, NbaTodayGames } = await import("./hub-overview.tsx");
const { nbaTodaySlateFrom } = await import("../../lib/sport-hub/nba-hub.ts");

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const laneOf = (d) => JSON.parse(read(`public/data/nba/experimental-public/${d}.json`));
// every <a> whose accessible name is a game page's (cards also carry data-nba-game-page; the rows drop it for weight)
const pageLinks = (h) => [...h.matchAll(/<a\b([^>]*\baria-label="Game page: [^"]*"[^>]*)>([^<]*)<\/a>/g)]
  .map((m) => ({ href: /\bhref="([^"]+)"/.exec(m[1])?.[1], label: /\baria-label="([^"]+)"/.exec(m[1])?.[1], cls: /\bclass="([^"]+)"/.exec(m[1])?.[1] ?? "", text: m[2] }))
  .map((l) => ({ ...l, id: /^\/nba\/simulation\/([^/]+)\/$/.exec(l.href ?? "")?.[1] }));

test("helpers: the route's URL, an accessible name that starts with the visible text, a link only for an exported id", () => {
  assert.equal(nbaGamePageHref("401909881"), "/nba/simulation/401909881/");
  assert.equal(nbaGamePageLabel("ATL", "MIA"), "Game page: ATL vs MIA");
  assert.ok(nbaGamePageLabel("ATL", "MIA").startsWith(NBA_GAME_PAGE_TEXT.replace(/ →$/, "")));
  assert.equal(nbaGamePageHrefIfExported("401909881", new Set(["401909881"])), "/nba/simulation/401909881/");
  assert.equal(nbaGamePageHrefIfExported(401909881, ["401909881"]), "/nba/simulation/401909881/");
  assert.equal(nbaGamePageHrefIfExported("401909882", new Set(["401909881"])), null, "not exported → no link");
  assert.equal(nbaGamePageHrefIfExported("401909881", undefined), null, "no list → no link");
  assert.equal(nbaGamePageHrefIfExported("", new Set([""])), null);
});

test("exported ids = the route's generateStaticParams pieces: live ids + settled(today, live); nothing with the gate off", () => {
  const today = "2026-10-29";
  assert.deepEqual(nbaExportedGamePageIds(today, ["x1"], false), [], "gate off → the route builds only the placeholder");
  const settled = settledSimulationParams(today);
  assert.ok(settled.length > 0, "committed past slates have settled pages");
  assert.deepEqual(nbaExportedGamePageIds(today, [], true), settled);
  const live = [settled[0]];
  assert.deepEqual(nbaExportedGamePageIds(today, live, true), [...live, ...settledSimulationParams(today, live)], "live ids first, never twice");
  // a slate's own games are not settled on their own date: today's unpublished games never enter the list
  const todays = laneOf("2026-10-28").games.map((g) => String(g.providerEventId));
  const onTheDay = new Set(nbaExportedGamePageIds("2026-10-28", [], true));
  for (const id of todays) assert.ok(!onTheDay.has(id), `${id} is today's game on 2026-10-28 — no page, no link`);
  const nextDay = new Set(nbaExportedGamePageIds("2026-10-29", [], true));
  for (const id of todays) assert.ok(nextDay.has(id), `${id} is settled on 2026-10-29`);
  // the route still composes exactly these pieces (SOURCE PIN shared with settled-simulation.test.mjs)
  const route = read("src/app/nba/simulation/[eventId]/page.tsx");
  assert.match(route, /settledSimulationParams\(currentEtDate\(\), live\.map\(\(p\) => p\.eventId\)\)/);
  assert.match(route, /return \[\.\.\.live, \.\.\.settled\]/);
});

const DATE = "2026-10-20";
const SNAP = laneOf(DATE);
const slate = nbaTodaySlateFrom({ nowIso: `${DATE}T15:00:00Z`, schedule: null, finals: null, lane: SNAP });

test("/nba game cards: a 44px 'Game page' link only on a game whose page is exported; the others stay unlinked", () => {
  const ids = slate.games.map((g) => g.id);
  assert.ok(ids.length >= 2);
  const h = renderToStaticMarkup(React.createElement(NbaTodayGames, { slate, gamePages: new Set([ids[0]]) }));
  const got = pageLinks(h);
  assert.deepEqual(got.map((l) => l.id), [ids[0]], "only the exported game links");
  const g = slate.games[0];
  assert.equal(got[0].href, `/nba/simulation/${ids[0]}/`);
  assert.equal(got[0].label, `Game page: ${g.away.abbr} vs ${g.home.abbr}`);
  assert.equal(got[0].text.replace(/&#x27;/g, "'"), NBA_GAME_PAGE_TEXT);
  // the card's action row (.nbx-acts a: min-height 44px in globals.css) holds it
  assert.match(h, new RegExp(`<p class="nbx-acts"><a [^>]*data-nba-game-page="${ids[0]}"`));
  assert.match(read("src/app/globals.css"), /\.nbx-acts a \{[^}]*min-height: 44px/);
  for (const id of ids.slice(1)) assert.doesNotMatch(h, new RegExp(`/nba/simulation/${id}/`), `${id} has no exported page → no link`);
  // no list (a flag-OFF build) → no game page link at all
  assert.deepEqual(pageLinks(renderToStaticMarkup(React.createElement(NbaTodayGames, { slate }))), []);
});

test("/nba Forecast vs. Actual rows: a 44px 'Game page' link only for exported ids", () => {
  const rows = [
    { id: "401909881", startUtc: "2026-10-28T23:00:00Z", startLabel: "Oct 28", matchup: "ATL @ MIA", status: "final", started: true, read: null, reportState: "NONE", reportHref: null, reportNote: "ATL 100 – MIA 101", participants: [{ name: "ATL", logoTeam: null, logoSport: null }, { name: "MIA", logoTeam: null, logoSport: null }], separator: "@" },
    { id: "401909999", startUtc: "2026-10-28T23:30:00Z", startLabel: "Oct 28", matchup: "BOS @ NY", status: "final", started: true, read: null, reportState: "NONE", reportHref: null, reportNote: "BOS 99 – NY 98", participants: [{ name: "BOS", logoTeam: null, logoSport: null }, { name: "NY", logoTeam: null, logoSport: null }], separator: "@" },
  ];
  const h = renderToStaticMarkup(React.createElement(NbaGameList, { rows, heading: "Forecast vs. Actual · recent games", forecasts: new Map(), gamePages: new Set(["401909881"]) }));
  const got = pageLinks(h);
  assert.deepEqual(got.map((l) => [l.id, l.href, l.label]), [["401909881", "/nba/simulation/401909881/", "Game page: ATL vs MIA"]]);
  assert.match(got[0].cls, /\bgtp-hit-44\b/, "44px touch target");
  assert.match(read("src/app/globals.css"), /\.gtp-hit-44 \{[^}]*min-height: 44px/);
  assert.doesNotMatch(h, /401909999\//, "a row without an exported page is not linked");
  assert.deepEqual(pageLinks(renderToStaticMarkup(React.createElement(NbaGameList, { rows, heading: "x", forecasts: new Map() }))), []);
});

test("SOURCE PIN · /nba draws both from the route's own exported list (live Theater ids + settled), today's ET date", () => {
  const src = read("src/app/nba/page.tsx");
  assert.match(src, /const gamePages = new Set\(nbaExportedGamePageIds\(today, theaterIds\)\);/);
  assert.match(src, /<NbaTodayGames slate=\{slate\} slip=\{slip\} gamePages=\{gamePages\} lineSummaries=\{lineSummaries\} \/>/);
  assert.match(src, /<NbaGameList rows=\{played\} heading="Forecast vs\. Actual · recent games" forecasts=\{pastSide\} gamePages=\{gamePages\} \/>/);
  assert.match(src, /const today = currentEtDate\(\);/, "the route's own date source");
});

test("/today NBA rows: a past game opens its exported game page; today's games keep their hub card; gate off → no page link", async () => {
  const { buildGamesTableRows } = await import("../games-experience-table-rows.ts");
  const today = "2026-10-29", yesterday = "2026-10-28";
  const prev = process.env.GTP_NBA_THEATER_PUBLIC;
  try {
    process.env.GTP_NBA_THEATER_PUBLIC = "1";
    const exported = new Set(nbaExportedGamePageIds(today));
    const nba = buildGamesTableRows(today).filter((r) => r.sport === "nba");
    const past = nba.filter((r) => r.date === yesterday);
    assert.ok(past.length > 0, "yesterday's NBA games are in the table");
    for (const r of past) {
      const id = /(\d+)$/.exec(r.id)[1];
      if (exported.has(id)) assert.equal(r.eventHref, `/nba/simulation/${id}/`, r.matchup);
      else assert.doesNotMatch(r.eventHref, /\/nba\/simulation\//, `${r.matchup}: no exported page → no link to one`);
    }
    assert.ok(past.some((r) => r.eventHref.startsWith("/nba/simulation/")), "a settled game links its page");
    for (const r of nba.filter((x) => x.date >= today)) assert.doesNotMatch(r.eventHref, /\/nba\/simulation\//, `${r.date} ${r.matchup}: not exported`);
    delete process.env.GTP_NBA_THEATER_PUBLIC;
    for (const r of buildGamesTableRows(today).filter((x) => x.sport === "nba")) assert.doesNotMatch(r.eventHref, /\/nba\/simulation\//, "gate off → the route exports no game page");
  } finally {
    if (prev === undefined) delete process.env.GTP_NBA_THEATER_PUBLIC; else process.env.GTP_NBA_THEATER_PUBLIC = prev;
  }
});
