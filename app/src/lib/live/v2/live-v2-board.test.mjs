/**
 * LIVE HUB V2 FOUNDATION — the board, rendered for real against every state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: LiveV2Board } = await import("../../../components/live/v2/live-v2-board.tsx");

const NOW = Date.parse("2026-10-18T20:00:00Z");
const ev = (o) => ({ reportHref: "/live/", away: { abbr: "SEA", name: "Seattle Seahawks", score: null }, home: { abbr: "DEN", name: "Denver Broncos", score: null }, ...o });
const render = (events, flags = { nfl: true, mlb: true }) => renderToStaticMarkup(React.createElement(LiveV2Board, { events, nowMs: NOW, flags })).replace(/<!-- -->/g, "");

test("an untracked sport never reads as live and never shows invented progress", () => {
  const h = render([
    ev({ id: "nba", sport: "nba", status: "LIVE", startUtc: "2026-10-18T19:00:00Z", progress: { quarter: 2, clock: "1:12" }, away: { abbr: "NY", name: "New York Knicks", score: 54 }, home: { abbr: "PHI", name: "Philadelphia 76ers", score: 50 } }),
    ev({ id: "epl", sport: "soccer", status: "LIVE", startUtc: "2026-10-18T14:00:00Z", progress: { minute: 67 }, away: { abbr: "Chelsea", name: "Chelsea", score: 1 }, home: { abbr: "Arsenal", name: "Arsenal", score: 1 } }),
  ]);
  assert.doesNotMatch(h, />Live</, "no LIVE chip for a sport without a validated adapter");
  assert.match(h, /Live data unavailable/);
  assert.doesNotMatch(h, /Q2 · 1:12|67'/, "no progress line for an untracked sport");
  assert.match(h, /Not tracked live/);
  assert.match(h, /Basketball · NBA/);
  assert.doesNotMatch(h, /aria-label="Live now"/, "untracked events are not grouped under Live now");
  assert.match(h, /aria-label="Live data unavailable"/);
});

test("a tracked live game shows its period, and its forecasts against the FROZEN line; unmeasured values say so", () => {
  const h = render([ev({ id: "g", sport: "nfl", status: "LIVE", startUtc: "2026-10-18T17:00:00Z", progress: { quarter: 3, clock: "7:27" },
    away: { abbr: "SEA", name: "Seattle Seahawks", score: 17 }, home: { abbr: "DEN", name: "Denver Broncos", score: 13 },
    forecasts: [
      { id: "a", label: "WR · receiving yards", frozen: "Over 64.5", line: 64.5, side: "over", current: 41, unit: "yds" },
      { id: "c", label: "TE · receptions", frozen: "Over 3.5", line: 3.5, side: "over", current: null, unit: "rec" },
    ] })]);
  assert.match(h, />Live</);
  assert.match(h, /Q3 · 7:27/);
  assert.match(h, /Frozen pregame: Over 64\.5/);
  assert.match(h, /41 yds · needs 24 more/);
  assert.match(h, /Not measured live/);
});

test("a provisional final never declares a winner; a canonical final may", () => {
  const prov = render([ev({ id: "p", sport: "nfl", status: "FINAL_PROVISIONAL", startUtc: "2026-10-18T13:30:00Z",
    forecasts: [{ id: "e", label: "WR", frozen: "Over 70.5", line: 70.5, side: "over", current: 82, unit: "yds" }] })]);
  assert.match(prov, /awaiting official settlement/);
  assert.doesNotMatch(prov, /Settled · landed/);
  const canon = render([ev({ id: "c", sport: "nfl", status: "FINAL_CANONICAL", startUtc: "2026-10-18T13:30:00Z",
    forecasts: [{ id: "e", label: "WR", frozen: "Over 70.5", line: 70.5, side: "over", current: 82, unit: "yds" }] })]);
  assert.match(canon, /Settled · landed/);
});

test("UFC shows an official result with its method; fighters get portraits/initials, never team logos", () => {
  const h = render([ev({ id: "u", sport: "ufc", status: "FINAL_CANONICAL", startUtc: "2026-10-18T02:00:00Z",
    away: { abbr: "", name: "Fighter A", score: null, imageUrl: null }, home: { abbr: "", name: "Fighter B", score: null, imageUrl: null },
    result: { winner: "Fighter A", method: "Decision", round: 3, official: true } })]);
  assert.match(h, /Fighter A won · Decision · R3/);
  assert.doesNotMatch(h, /teamlogos/);
  assert.match(h, /Open bout report/);
});

test("forecasts are never padded, and an empty list says so", () => {
  const none = render([ev({ id: "n", sport: "mlb", status: "PREGAME", startUtc: "2026-10-18T23:00:00Z", forecasts: [] })]);
  assert.match(none, /No published GameTimePicks forecasts for this event/);
  const six = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, label: `F${i}`, frozen: "Over 1.5", line: 1.5, side: "over", current: null, unit: "x" }));
  const h = render([ev({ id: "s", sport: "nfl", status: "PREGAME", startUtc: "2026-10-18T23:00:00Z", forecasts: six })]);
  assert.equal((h.match(/Frozen pregame:/g) || []).length, 5, "at most five");
});

test("groups render in reading order, and no events renders the empty state", () => {
  const h = render([
    ev({ id: "fin", sport: "nfl", status: "FINAL_CANONICAL", startUtc: "2026-10-18T13:30:00Z" }),
    ev({ id: "up", sport: "nfl", status: "PREGAME", startUtc: "2026-10-18T23:00:00Z" }),
    ev({ id: "live", sport: "mlb", status: "LIVE", startUtc: "2026-10-18T18:00:00Z", progress: { inning: 4, half: "top", outs: 0 } }),
  ]);
  const at = (s) => h.indexOf(`aria-label="${s}"`);
  assert.ok(at("Live now") > -1 && at("Live now") < at("Upcoming") && at("Upcoming") < at("Recently finished"));
  assert.match(render([]), /Nothing to follow right now/);
});

test("the foundation is NOT wired into the public /live page yet", () => {
  for (const f of ["src/app/live/page.tsx", "src/components/live/live-sport-tabs.tsx"]) {
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /LiveV2Board|live\/v2\//, `${f} must not mount the unvalidated V2 board`);
  }
  assert.match(fs.readFileSync("src/app/preview/live-v2/page.tsx", "utf8"), /guardInternalRoute\(\)/);
});
