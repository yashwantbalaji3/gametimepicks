/**
 * NBA Theater ENTRY POINTS (release owner 2026-10-21): every /nba lane card links to its game's research simulation
 * page — and ONLY when that page is built. The ids come from public-route.mjs publicTheaterRouteIds, the same list
 * the route's generateStaticParams publishes, so a link exists iff its page does (flag OFF, or a game without valid
 * stored runs → no link; the built-link resolver stays green). The link text carries the role C framing.
 * Also: the Theater page has exactly one h1 (the game title).
 * Run (from app/): npx tsx --test src/components/nba/theater-entry-points.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React; // the island compiles with the classic JSX runtime (as possession-render.test.mjs)
process.env.__NEXT_TRAILING_SLASH = "true"; // next.config.mjs trailingSlash: true — next/link renders hrefs as the build does
const { NbaTodayGames } = await import("./hub-overview.tsx");
const { nbaTodaySlateFrom } = await import("../../lib/sport-hub/nba-hub.ts");
const { NBA_PUBLIC_THEATER_PLACEHOLDER, THEATER_LINK_TEXT, publicTheaterHref, publicTheaterRouteIds } = await import("../../lib/simulation-theater/nba/possession/public-route.mjs");
const { publicPossessionEvents } = await import("../../lib/simulation-theater/nba/possession/public-loader.mjs");
const { default: Island } = await import("../simulation-theater/nba/possession/NbaPossessionTheater.tsx");
const { loadNbaPossessionTheater } = await import("../../lib/simulation-theater/nba/possession/possession-loader.mjs");
const { packPlaybackPayload } = await import("../../lib/simulation-theater/nba/possession/wire.mjs");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const DATE = "2026-10-20";
const SNAP = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nba/experimental-public", `${DATE}.json`), "utf8"));
const ON = { constantEnabled: true, env: { GTP_NBA_THEATER_PUBLIC: "1" } };
// founder mandate 2026-10-24: the Game Simulation link lives on today's game card (hub-overview NbaTodayGames), built from
// the same slate view as the homepage; the lane snapshot alone yields every game (no schedule needed)
const cards = (theaterIds = []) => renderToStaticMarkup(React.createElement(NbaTodayGames, { slate: nbaTodaySlateFrom({ nowIso: `${DATE}T15:00:00Z`, schedule: null, finals: null, lane: SNAP, theaterIds }) }));
const OFF = { constantEnabled: true, env: {} };
// Attribute order is the renderer's (next/link puts class before href since the CTA became a Link, 2026-10-22): read
// each Theater-link <a>'s href and id from its attributes, whatever their order.
const links = (h) => [...h.matchAll(/<a\b([^>]*\bdata-nba-theater-link="([^"]+)"[^>]*)>([^<]+)<\/a>/g)]
  .map((m) => ({ href: /\bhref="([^"]+)"/.exec(m[1])?.[1], id: m[2], text: m[3].replace(/&#x27;/g, "'") }));

test("the link text names the Game Simulation (registry term) and points at the route", () => {
  // founder directive 2026-10-23 public readiness: the role C framing ("research simulation (unvalidated)") is now the registry's Game Simulation; the engine panel
  // carries the one Model Performance disclosure
  assert.match(THEATER_LINK_TEXT, /Game Simulation/);
  assert.doesNotMatch(THEATER_LINK_TEXT, /\blive\b|watch the game|forecast|pick/i);
  assert.equal(publicTheaterHref("401909088"), "/nba/simulation/401909088/");
});

test("link present iff the page is built: ids = exactly what generateStaticParams publishes (placeholder excluded)", () => {
  const built = publicPossessionEvents(REPO, { date: DATE, now: `${DATE}T15:00:00Z` });
  assert.ok(built.length === 3);
  assert.deepEqual(publicTheaterRouteIds(() => built, ON), built, "gate ON → every built game");
  assert.deepEqual(publicTheaterRouteIds(() => built, OFF), [], "gate OFF → no link (the route builds only the placeholder)");
  assert.deepEqual(publicTheaterRouteIds(() => [], ON), [], "no valid runs → no link (never the placeholder)");
  assert.ok(!publicTheaterRouteIds(() => built, ON).includes(NBA_PUBLIC_THEATER_PLACEHOLDER));
  // a game whose runs are not built gets no card link
  const h = cards([built[0]]);
  const got = links(h);
  assert.deepEqual(got.map((l) => l.id), [built[0]], "only the game with a built page links");
  assert.equal(got[0].href, `/nba/simulation/${built[0]}/`);
  assert.match(got[0].text, /^Game Simulation →$/); // founder mandate 2026-10-24: the registry term, as the card's second action
  // its Official Forecast link opens the same built page's server-rendered forecast section
  assert.match(h, new RegExp(`href="/nba/simulation/${built[0]}/#official-predictions"`));
});

test("flag-OFF render: no Theater link on any lane card", () => {
  const h = cards();
  assert.deepEqual(links(h), []);
  assert.doesNotMatch(h, /\/nba\/simulation\//);
});

test("/nba gates the links with the route's own literal flag test and id list (no helper around the flag)", () => {
  const src = fs.readFileSync(path.join(APP, "src/app/nba/page.tsx"), "utf8");
  assert.match(src, /if \(process\.env\.GTP_NBA_THEATER_PUBLIC === "1"\) \{\s*const \{ publicPossessionEvents \} = await import\("@\/lib\/simulation-theater\/nba\/possession\/public-loader\.mjs"\);\s*theaterIds = publicTheaterRouteIds\(\(\) => publicPossessionEvents\(REPO_ROOT\)\);/);
  assert.match(src, /<NbaExperimentalLane snapshot=\{lane\} statuses=\{statuses\} theaterIds=\{theaterIds\} \/>/);
  const route = fs.readFileSync(path.join(APP, "src/app/nba/simulation/[eventId]/page.tsx"), "utf8");
  assert.match(route, /nbaPublicTheaterParams\(\(\) => publicPossessionEvents\(REPO_ROOT\)\)/, "the route publishes the same function's ids");
});

test("a11y: the Theater page has exactly one h1 (the game title); sections stay h2", () => {
  const load = loadNbaPossessionTheater(REPO, "401909088");
  const h = renderToStaticMarkup(React.createElement(Island, { wire: packPlaybackPayload(load.payload), palette: load.palettes.team }));
  const h1 = [...h.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1.length, 1);
  assert.equal(h1[0][1], `${load.payload.teams.away.name} at ${load.payload.teams.home.name}`);
  assert.ok((h.match(/<h2[\s>]/g) ?? []).length >= 4, "panel and section headings are h2");
  assert.ok(h.indexOf("<h1") < h.indexOf("<h2"), "the h1 precedes every h2");
});
