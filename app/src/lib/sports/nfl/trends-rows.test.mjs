/**
 * NFL trends rows + table — synthetic boards only.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/trends-rows.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildTrendRows } from "./trends-rows.mjs";

globalThis.React = React;

const e = (id, rec, recYds, extra = {}) => ({ eventId: id, week: 1, date: "2026-10-01", team: "GB", opponent: "X", homeAway: "H", state: "STAT_LINE", stats: { rec, recYds, ...extra } });
const gap = (id) => ({ eventId: id, week: 1, date: "2026-10-01", team: "GB", opponent: "X", homeAway: "H", state: "NO_STAT_LINE" });
const board = {
  providerEventId: "9", matchup: "MIN @ GB", kickoffUtc: "2026-11-15T18:00Z",
  families: { player_reception_yds: { state: "PUBLISHED" }, player_receptions: { state: "PUBLISHED" }, anytime_td: { state: "PUBLISHED" }, player_rush_yds: { state: "WITHHELD" } },
  players: [
    { playerId: "a", name: "Star", team: "GB", eligibility: { state: "ELIGIBLE" }, markets: { player_reception_yds: { median: 40 }, anytime_td: { probability: 0.4 }, player_rush_yds: { median: 9 } } },
    { playerId: "b", name: "Role Player", team: "MIN", eligibility: { state: "UNKNOWN" }, markets: { player_receptions: { median: 2 } } },
    { playerId: "c", name: "No Evidence", team: "GB", markets: { player_receptions: { median: 2 } } },
  ],
};
const evidence = { 9: { a: [e("1", 5, 70, { recTd: 1 }), e("2", 4, 60), e("3", 6, 80), e("4", 3, 50), e("5", 5, 66)], b: [e("1", 3, 20), gap("2"), e("3", 2, 15)] } };

test("every board player with evidence, published markets only; descriptive gap only on 5 complete games", () => {
  const rows = buildTrendRows({ boards: [board], evidenceByEvent: evidence });
  assert.deepEqual(rows.map((r) => [r.playerId, r.family]), [["b", "player_receptions"], ["a", "anytime_td"], ["a", "player_reception_yds"]], "role player included; withheld rush market excluded; no evidence ⇒ no row");
  const a = rows.find((r) => r.family === "player_reception_yds");
  assert.deepEqual([a.median5, a.projection, a.vsProjection, a.opponent, a.lineState, a.badge], [66, 40, 26, "MIN", "NO_OBSERVED_LINE", null]);
  const b = rows.find((r) => r.playerId === "b");
  assert.deepEqual([b.games5, b.noStatLine5, b.vsProjection, b.opponent], [3, 1, null, "GB"]);
  const td = rows.find((r) => r.family === "anytime_td");
  assert.deepEqual([td.tdGames5, td.probability, td.vsProjection], [1, 0.4, null]);
});

test("table: default market + complete-sample filter; never prints a hit rate without a line", async () => {
  const { default: Table } = await import("../../../components/nfl/trends-table.tsx");
  const rows = buildTrendRows({ boards: [board], evidenceByEvent: evidence });
  const html = renderToStaticMarkup(React.createElement(Table, { rows }));
  assert.equal((html.match(/data-trend-row=/g) ?? []).length, 1, "default: receiving yards, 5 complete games");
  assert.match(html, /70 · 60 · 80 · 50 · 66/);
  assert.match(html, /\+26/);
  assert.match(html, /not captured/);
  assert.doesNotMatch(html, /\d\/5 over/);
});
