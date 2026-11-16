/**
 * Recent form game dates are the America/New_York calendar date of the kickoff, never the UTC date (production defect
 * 2026-11-16: the Thursday BAL@JAX week-9 game, 2026-11-06T01:15Z = Thu Nov 5, 8:15 PM ET, showed "11/6"; the Sunday
 * night 10/11 game showed "10/12"). Ordering stays by the kickoff INSTANT, never by the date string.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/player-evidence-et-date.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

import { etDateOf } from "../../et-stamp.mjs";
import { gameLog } from "./player-evidence.mjs";

const P = "nfl-athlete-1";
const game = (id, dateUtc, rec = 4) => ({ providerEventId: id, season: 2026, week: 1, dateUtc, home: "NEW", away: "OPP", ftHome: 20, ftAway: 17, players: [{ playerId: P, teamAbbr: "NEW", rec, recYds: rec * 10 }] });

test("night kickoffs after 00:00Z belong to the previous ET day; day games keep their date", () => {
  const cases = [
    ["thu", "2026-11-06T01:15:00Z", "2026-11-05"], // Thursday 8:15 PM ET (BAL@JAX, week 9)
    ["snf", "2026-10-12T00:20:00Z", "2026-10-11"], // Sunday 8:20 PM EDT
    ["mnf", "2026-11-10T01:15:00Z", "2026-11-09"], // Monday 8:15 PM EST
    ["day", "2026-11-15T18:00:00Z", "2026-11-15"], // Sunday 1:00 PM
    ["late", "2026-11-15T21:25:00Z", "2026-11-15"],
  ];
  const log = gameLog(cases.map(([id, d]) => game(id, d)), P, "NEW", "2026-12-01T00:00:00Z");
  for (const [id, , want] of cases) assert.equal(log.find((e) => e.eventId === id).date, want, id);
});

test("DST boundary (Sun 2026-11-01, 2:00 AM EDT → 1:00 AM EST = 06:00Z)", () => {
  assert.equal(etDateOf("2026-11-01T03:30:00Z"), "2026-10-31", "11:30 PM EDT Saturday");
  assert.equal(etDateOf("2026-11-01T04:30:00Z"), "2026-11-01", "00:30 EDT Sunday");
  assert.equal(etDateOf("2026-11-02T04:30:00Z"), "2026-11-01", "11:30 PM EST Sunday (UTC-5 after the change)");
  assert.equal(etDateOf("2026-11-02T05:30:00Z"), "2026-11-02", "00:30 EST Monday");
  assert.equal(etDateOf("2026-03-08T04:59:00Z"), "2026-03-07", "spring: 11:59 PM EST");
  assert.equal(etDateOf("2026-03-09T03:59:00Z"), "2026-03-08", "spring: 11:59 PM EDT");
  for (const bad of [null, undefined, "", "not a date"]) assert.equal(etDateOf(bad), null);
});

test("order is by kickoff instant, not by the date string: a Sunday night game follows that day's 1 PM game", () => {
  const log = gameLog([game("early", "2026-10-11T17:00:00Z", 1), game("snf", "2026-10-12T00:20:00Z", 2), game("prev", "2026-10-05T17:00:00Z", 3)], P, "NEW", "2026-10-20T00:00:00Z");
  assert.deepEqual(log.map((e) => [e.eventId, e.date]), [["snf", "2026-10-11"], ["early", "2026-10-11"], ["prev", "2026-10-05"]]);
});

test("the committed evidence file: every entry's date is the ET date of its game's kickoff", () => {
  const ROOT = path.join(process.cwd(), "..");
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/player-evidence/latest.json"), "utf8"));
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/player-events-v1/2026.json"), "utf8")).games;
  const kick = new Map(games.map((g) => [String(g.providerEventId), g.dateUtc]));
  let n = 0, night = 0;
  const bad = [];
  for (const ev of Object.values(doc.events)) for (const log of Object.values(ev.players)) for (const e of log) {
    n++;
    const k = kick.get(e.eventId);
    if (!k) { bad.push(`${e.eventId}: no kickoff in player-events`); continue; }
    if (e.date !== etDateOf(k)) bad.push(`${e.eventId}: ${e.date} ≠ ET ${etDateOf(k)} (${k})`);
    if (k.slice(0, 10) !== e.date) night++;
  }
  assert.ok(n > 1000, `${n} entries`);
  assert.ok(night > 0, "non-vacuous: the file holds night games whose UTC date differs");
  assert.deepEqual([...new Set(bad)], []);
});

test("the Recent form panel prints the ET date (11/5 for the Thursday game)", async () => {
  const { default: Panel } = await import("../../../components/nfl/player-evidence-panel.tsx");
  const [e] = gameLog([game("401873037", "2026-11-06T01:15:00Z")], P, "NEW", "2026-11-10T00:00:00Z");
  const log = [e, ...[1, 2, 3, 4].map((i) => gameLog([game(`g${i}`, `2026-10-0${i}T17:00:00Z`)], P, "NEW", "2026-11-10T00:00:00Z")[0])];
  const html = renderToStaticMarkup(React.createElement(Panel, { players: [{ playerId: P, name: "X", team: "NEW" }], evidence: { [P]: log }, sourceNote: "src",
    projections: { [P]: { player_receptions: { value: 4, p10: null, p90: null, kind: "count", text: "4", range: null, estimate: null, market: null } } } }));
  assert.match(html, /<td>1 11\/5<\/td>/);
  assert.doesNotMatch(html, /11\/6/);
});
