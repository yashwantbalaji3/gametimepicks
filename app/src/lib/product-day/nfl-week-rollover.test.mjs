/**
 * #794 PR 1 · TONIGHT'S GAME NEVER DISAPPEARS FROM HOME.
 *
 * 2026-09-28: at 00:50Z, 35 minutes into PHI @ CHI (Week 3), the NFL forecast run published Week 4 and
 * nfl/index.json rolled forward without the game being played. Home's Simulation Hub said "No NFL games
 * today · Week 4…" and the hero "0 events on today's board". The NFL product day now counts today the
 * way the cross-sport owner does (schedule capture ∪ index). Fixture-dated, temp data roots only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildProductDays } from "./product-day.ts";

globalThis.React = React;
const { default: LandingHero } = await import("../../components/home/landing-hero.tsx");

const D = "2031-09-29"; // a Monday, fixture-only
const root = (files) => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nflroll-"));
  for (const [rel, obj] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(r, rel)), { recursive: true }); fs.writeFileSync(path.join(r, rel), JSON.stringify(obj)); }
  return r;
};
const WEEK4 = Array.from({ length: 3 }, (_, i) => ({ providerEventId: `90${i}`, matchup: `W4 game ${i}`, kickoffUtc: `2031-10-0${2 + i}T17:00Z` }));
const MNF = { providerEventId: "801", matchup: "PHI @ CHI", kickoffUtc: "2031-09-30T00:15Z" }; // Mon 8:15 PM ET
const schedule = { generatedAt: `${D}T17:36:00Z`, windowDays: 14, rows: [
  { providerEventId: "801", shortName: "PHI @ CHI", dateUtc: "2031-09-30T00:15Z", statusRaw: "STATUS_SCHEDULED" },
  ...WEEK4.map((e) => ({ providerEventId: e.providerEventId, shortName: e.matchup, dateUtc: e.kickoffUtc, statusRaw: "STATUS_SCHEDULED" })),
] };
const nflOf = (files) => buildProductDays(root(files), { today: D }).find((d) => d.sport === "nfl");

test("🔴 the index rolled to next week mid-game: tonight's game is still TODAY, named, and never 'No NFL games today'", () => {
  const nfl = nflOf({
    "nfl/index.json": { generatedAt: "2031-09-30T00:50:05Z", counts: { forecastsUpcoming: 3, forecastsTotal: 3 }, nextForecastUtc: WEEK4[0].kickoffUtc, events: WEEK4 },
    "nfl/schedule/latest.json": schedule,
    "nfl/weekly-boards/latest.json": { period: { week: 4 } },
  });
  assert.equal(nfl.state, "LIVE");
  assert.equal(nfl.productDate, D);
  assert.equal(nfl.events, 1, "the game being played counts");
  assert.equal(nfl.eligible, 0, "the rolled index no longer carries its forecast — counted separately, never invented");
  assert.match(nfl.note, /^1 game today \(PHI @ CHI\) · Week 4: 3 forecasts published$/);
  assert.doesNotMatch(nfl.note, /No NFL games today|game forecast/, "neither denies the game nor claims an indexed forecast");
});

test("a normal game day (the index carries tonight's game) keeps the forecast sentence", () => {
  const nfl = nflOf({
    "nfl/index.json": { generatedAt: `${D}T17:38:00Z`, counts: { forecastsUpcoming: 4, forecastsTotal: 4 }, nextForecastUtc: MNF.kickoffUtc, events: [MNF, ...WEEK4] },
    "nfl/schedule/latest.json": schedule,
    "nfl/weekly-boards/latest.json": { period: { week: 3 } },
  });
  assert.equal(nfl.state, "LIVE");
  assert.deepEqual([nfl.events, nfl.eligible], [1, 1]);
  assert.match(nfl.note, /^1 game forecast today · Week 3: 4 published$/);
});

test("a quiet day stays quiet: nothing scheduled or indexed today is still 'No NFL games today'", () => {
  const nfl = nflOf({
    "nfl/index.json": { generatedAt: `${D}T17:38:00Z`, counts: { forecastsUpcoming: 3, forecastsTotal: 3 }, nextForecastUtc: WEEK4[0].kickoffUtc, events: WEEK4 },
    "nfl/schedule/latest.json": { ...schedule, rows: schedule.rows.filter((r) => r.providerEventId !== "801") },
    "nfl/weekly-boards/latest.json": { period: { week: 4 } },
  });
  assert.notEqual(nfl.state, "LIVE");
  assert.match(nfl.note, /No NFL games today/);
});

test("🔴 the hero says 'event today' in the singular, and claims the day only when every schedule is known", () => {
  const render = (props) => renderToStaticMarkup(React.createElement(LandingHero, { readyCount: 0, activeSports: 4, qualifiedPicks: null, activeProducts: 0, lastSettledDate: null, ...props }));
  const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text(render({ eventsToday: 1, eventsKnown: true })), /\b1 event today\b/);
  assert.doesNotMatch(text(render({ eventsToday: 1, eventsKnown: true })), /1 events/);
  assert.match(text(render({ eventsToday: 3, eventsKnown: true })), /\b3 events today\b/);
  assert.match(text(render({ eventsToday: 0, eventsKnown: true })), /\b0 events today\b/);
  assert.match(text(render({ eventsToday: 2, eventsKnown: false })), /2 events on today’s board/, "a partial count keeps the board wording");
});

test("Home reads the owners: hero = cross-sport day count, NFL status = the product day's own note", () => {
  const home = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");
  assert.match(home, /const eventsTodayTotal = todayAcross\.eventsToday;/);
  assert.match(home, /eventsKnown=\{todayAcross\.state !== "UNKNOWN"\}/);
  assert.match(home, /status: nflDay\?\.note \?\? stateLabel\(nflState\)/);
  assert.ok(!/game forecast\$\{nflDay/.test(home), "no second wording of the NFL count on the page");
});
