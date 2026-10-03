/**
 * NBA hub guards (Session 6 · NBA factual shell).
 *
 * The hub is public while NBA is HISTORICAL_ONLY and no NBA model has cleared its bars, so what it must
 * never do is pinned here: carry a read, print a score the finals record does not hold, call a started
 * game "final", show a placeholder "TBD @ TBD" as a game, or name a team by ESPN's provider code.
 *
 * Run: npx tsx --test src/lib/sport-hub/nba-hub.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { nbaHubFrom, NBA_NO_FORECAST_NOTE, NBA_PRESEASON_NOTE } = await import("./nba-hub.ts");
const { mergeFinals } = await import("../sports/nba/finals-record.mjs");
const { default: GameSummary } = await import("../../components/sport-hub/game-summary.tsx");

const NOW = "2026-10-04T16:00:00Z";
const TOR = { abbr: "TOR", name: "Toronto Raptors", providerTeamId: "28" };
const MIA = { abbr: "MIA", name: "Miami Heat", providerTeamId: "14" };
const GS = { abbr: "GS", name: "Golden State Warriors", providerTeamId: "9" };
const LAL = { abbr: "LAL", name: "Los Angeles Lakers", providerTeamId: "13" };
const row = (id, dateUtc, over = {}) => ({ providerEventId: id, dateUtc, statusRaw: "STATUS_SCHEDULED", seasonType: 1, home: TOR, away: MIA, ...over });
const SCHEDULE = {
  generatedAt: "2026-10-04T15:00:00Z",
  rows: [
    row("played", "2026-10-03T23:00Z"),                                          // started, final recorded below
    row("started-unrecorded", "2026-10-04T15:30Z", { home: GS, away: LAL }),     // started, no final yet
    row("next-pre", "2026-10-05T23:00Z", { home: GS, away: LAL }),
    row("reg", "2026-10-10T23:00Z", { seasonType: 2 }),                          // inside the 7-day window
    row("too-far", "2026-10-20T23:00Z", { seasonType: 2 }),
    row("too-old", "2026-09-28T23:00Z"),
    row("tbd", "2026-10-06T23:00Z", { home: { abbr: "TBD", name: "TBD", providerTeamId: "-1" }, away: { abbr: "TBD", name: "TBD", providerTeamId: "-2" } }),
  ],
};
const FINALS = mergeFinals(null, [{ ...SCHEDULE.rows[0], statusRaw: "STATUS_FINAL", ftHome: 112, ftAway: 104 }], { season: "2026-27", nowIso: NOW }).record;
const hub = nbaHubFrom({ nowIso: NOW, schedule: SCHEDULE, finals: FINALS });
const byId = Object.fromEntries(hub.rows.map((r) => [r.id, r]));

test("no row carries a read, a report or a link — the NBA hub publishes no forecast", () => {
  assert.ok(hub.rows.length > 0);
  for (const r of hub.rows) {
    assert.equal(r.read, null, `${r.id} carries a read`);
    assert.equal(r.reportState, "NONE");
    assert.equal(r.reportHref, null);
  }
});

test("window: 3 days back to 7 days ahead; placeholder sides are counted, never listed", () => {
  assert.deepEqual(Object.keys(byId).sort(), ["next-pre", "played", "reg", "started-unrecorded"]);
  assert.equal(hub.identityReconciliation.unidentifiedScheduleRows, 1, "the TBD row is counted, not dropped silently");
});

test("a final prints ONLY from the finals record, with canonical tricodes", () => {
  assert.equal(byId.played.status, "final");
  assert.equal(byId.played.reportNote, "Final · MIA 104 – TOR 112");
  const u = byId["started-unrecorded"];
  assert.equal(u.status, "started or final", "a started game the record does not hold is not 'final'");
  assert.equal(u.reportNote, "Final not recorded yet");
  assert.doesNotMatch(u.reportNote, /\d/, "no score without a recorded final");
  assert.deepEqual(byId["next-pre"].participants.map((p) => p.name), ["LAL", "GSW"], "ESPN 'GS' is shown as GSW");
  assert.deepEqual(byId["next-pre"].participants.map((p) => p.logoTeam), ["LAL", "GS"], "the crest resolves by ESPN's own slug");
});

test("preseason is labelled; a regular-season game says no forecast; the period names the next game's phase", () => {
  assert.match(byId["next-pre"].matchup, /preseason$/);
  assert.equal(byId["next-pre"].reportNote, NBA_PRESEASON_NOTE);
  assert.equal(byId.reg.reportNote, NBA_NO_FORECAST_NOTE);
  assert.equal(hub.periodLabel, "2026-27 preseason");
  assert.equal(hub.freshness, SCHEDULE.generatedAt, "freshness is the schedule capture behind the rows");
});

test("no schedule → an honest empty state, not a crash", () => {
  const empty = nbaHubFrom({ nowIso: NOW, schedule: null, finals: null });
  assert.equal(empty.rows.length, 0);
  assert.match(empty.emptyReason, /No NBA games/);
});

test("rendered rows carry no probability, pick or projection words", () => {
  const html = renderToStaticMarkup(React.createElement(GameSummary, { rows: hub.rows, unitLabel: "Games", emptyReason: hub.emptyReason }));
  assert.match(html, /MIA 104 – TOR 112/);
  assert.doesNotMatch(html, /\d+(\.\d+)?%/, "a percentage on the NBA hub would be a forecast");
  assert.doesNotMatch(html, /\b(pick|projected|projection|favou?red|edge|lean)\b/i);
});

/*
 * 2026-10-03 audit · G1 — the REAL capture's window starts at the capture instant, so a played game is gone
 * from schedule/latest.json by the run that folds its final. The fixture above keeps past rows the real
 * capture never produces, which is how "the hub can never print a final" passed. This one is realistic.
 */
test("a final the schedule has already dropped is listed from the finals record (and only from it)", () => {
  const played = SCHEDULE.rows[0];
  const realistic = { ...SCHEDULE, rows: SCHEDULE.rows.filter((r) => r.providerEventId !== played.providerEventId) };
  const h = nbaHubFrom({ nowIso: NOW, schedule: realistic, finals: FINALS });
  const row = h.rows.find((r) => r.id === played.providerEventId);
  assert.ok(row, "the recorded final appears even though the schedule no longer carries it");
  assert.equal(row.status, "final");
  assert.match(row.reportNote, /^Final · .* 104 – .* 112/);
  assert.equal(row.read, null, "a final row carries no forecast");
  // MUTATION PROBE · the old schedule-only hub: with no finals record nothing can print, and no row is invented
  const none = nbaHubFrom({ nowIso: NOW, schedule: realistic, finals: null });
  assert.equal(none.rows.find((r) => r.id === played.providerEventId), undefined, "no record → no final, never inferred");
  // a final outside the 3-day look-back stays off the page; the schedule copy is never duplicated
  assert.equal(nbaHubFrom({ nowIso: "2026-10-20T16:00:00Z", schedule: realistic, finals: FINALS }).rows.find((r) => r.id === played.providerEventId), undefined);
  assert.equal(nbaHubFrom({ nowIso: NOW, schedule: SCHEDULE, finals: FINALS }).rows.filter((r) => r.id === played.providerEventId).length, 1);
});
