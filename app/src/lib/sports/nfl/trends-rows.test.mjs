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

const NOW = "2026-11-15T12:00:00Z";
/* the per-game line gate (the page passes NFL_LINE_DISPLAY.public AND a readable line artifact): OPEN for the line-state
   tests below, CLOSED (the default) for the gate tests at the end */
const OPEN = () => true, CLOSED = () => false;
const offer = (sportsbook, line, capturedAt = "2026-11-15T11:00:00Z") => ({ sportsbook, line, overOdds: -110, underOdds: -110, capturedAt });
/* one eligible and one ineligible offer on the same board */
const lined = {
  ...board,
  players: [
    { ...board.players[0], markets: { ...board.players[0].markets, player_reception_yds: { median: 40, market: offer("draftkings", 55.5) } } },
    { ...board.players[1], markets: { player_receptions: { median: 2, market: offer("betonlineag", 1.5) } } },
    board.players[2],
  ],
};

test("every board player with evidence, published markets only; descriptive gap only on 5 complete games", () => {
  const rows = buildTrendRows({ boards: [board], evidenceByEvent: evidence, now: NOW, lineGate: OPEN });
  assert.deepEqual(rows.map((r) => [r.playerId, r.family]), [["b", "player_receptions"], ["a", "anytime_td"], ["a", "player_reception_yds"]], "role player included; withheld rush market excluded; no evidence ⇒ no row");
  const a = rows.find((r) => r.family === "player_reception_yds");
  assert.deepEqual([a.median5, a.projection, a.vsProjection, a.opponent, a.lineState, a.badge], [66, 40, 26, "MIN", "NO_LINE", null]);
  const b = rows.find((r) => r.playerId === "b");
  assert.deepEqual([b.games5, b.noStatLine5, b.vsProjection, b.opponent], [3, 1, null, "GB"]);
  const td = rows.find((r) => r.family === "anytime_td");
  assert.deepEqual([td.tdGames5, td.probability, td.vsProjection], [1, 0.4, null]);
});

test("table: default market + complete-sample filter; never prints a hit rate without a line", async () => {
  const { default: Table } = await import("../../../components/nfl/trends-table.tsx");
  const rows = buildTrendRows({ boards: [board], evidenceByEvent: evidence, now: NOW, lineGate: OPEN });
  const html = renderToStaticMarkup(React.createElement(Table, { rows }));
  assert.equal((html.match(/data-trend-row=/g) ?? []).length, 1, "default: receiving yards, 5 complete games");
  assert.match(html, /70 · 60 · 80 · 50 · 66/);
  assert.match(html, /\+26/);
  assert.match(html, /not captured/);
  assert.doesNotMatch(html, /\d\/5 over/);
});

test("A · fixture board with one eligible and one ineligible offer: the eligible line shows value, book and capture time; the ineligible one is withheld, never a record", async () => {
  const rows = buildTrendRows({ boards: [lined], evidenceByEvent: evidence, now: NOW, lineGate: OPEN });
  const a = rows.find((r) => r.playerId === "a" && r.family === "player_reception_yds");
  assert.deepEqual([a.lineState, a.badge, a.tier, a.line], ["COMPLETE", "4/5", "4/5", "55.5 at draftkings, captured Nov 15, 6:00 AM ET"]);
  const b = rows.find((r) => r.playerId === "b");
  assert.deepEqual([b.lineState, b.badge, b.tier, b.line], ["WITHHELD", null, null, null]);
  assert.doesNotMatch(JSON.stringify(rows), /betonline|1\.5/, "nothing of the ineligible offer reaches a row");
  const { default: Table } = await import("../../../components/nfl/trends-table.tsx");
  const html = renderToStaticMarkup(React.createElement(Table, { rows }));
  assert.match(html, /4\/5 over<div class="nt-g">vs 55\.5 at draftkings, captured Nov 15, 6:00 AM ET<\/div>/);
  const { BOOK_AVAILABILITY_NOTE } = await import("../odds/eligible-operators.mjs");
  assert.ok(html.includes(BOOK_AVAILABILITY_NOTE), "a printed book name carries the availability note");
  const bare = renderToStaticMarkup(React.createElement(Table, { rows: buildTrendRows({ boards: [board], evidenceByEvent: evidence, now: NOW, lineGate: OPEN }) }));
  assert.ok(!bare.includes(BOOK_AVAILABILITY_NOTE), "no book printed ⇒ no note needed");
  // a hit rate never renders without its caption
  for (const r of rows) if (r.badge) assert.ok(r.line, `${r.playerId} ${r.family}: badge without a line caption`);
});

test("A · a line captured at/after kickoff, or without an instant, is not a record", () => {
  for (const cap of ["2026-11-15T18:00Z", "2026-11-15T19:00Z", null]) {
    const b = { ...lined, players: [{ ...lined.players[0], markets: { player_reception_yds: { median: 40, market: offer("draftkings", 55.5, cap) } } }] };
    const r = buildTrendRows({ boards: [b], evidenceByEvent: evidence, now: NOW, lineGate: OPEN })[0];
    assert.deepEqual([r.lineState, r.badge, r.line], ["NOT_BEFORE_KICKOFF", null, null]);
  }
});

test("D · games at or before the build instant are not this week's board: no rows (fail closed without a clock)", () => {
  assert.equal(buildTrendRows({ boards: [board], evidenceByEvent: evidence, now: "2026-11-15T18:00Z" }).length, 0, "kickoff == now ⇒ played");
  assert.equal(buildTrendRows({ boards: [board], evidenceByEvent: evidence, now: "2026-11-16T00:00Z" }).length, 0);
  assert.equal(buildTrendRows({ boards: [board], evidenceByEvent: evidence }).length, 0, "no build instant ⇒ nothing shown");
  assert.equal(buildTrendRows({ boards: [board], evidenceByEvent: evidence, now: NOW, lineGate: OPEN }).length, 3);
});

// ── LINE GATE (the game page's rule, per game) ─────────────────────────────────────────────────────────────────────
const FORBIDDEN = /data-prop-line|nfl-prop-lines|sportsbook line|Not an over\/under market|Official projection not published/;
const LINE_ARTEFACTS = /data-book-availability-note|<th>Line<\/th>|\d\/5 over|partial record|withheld|not captured|no pre-kickoff capture|sportsbook|draftkings|betonline|55\.5/i;

test("gate CLOSED (default, or per game): rows carry no line state, line, badge or tier; the table has no Line column and no line wording", async () => {
  const { default: Table } = await import("../../../components/nfl/trends-table.tsx");
  const { BOOK_AVAILABILITY_NOTE } = await import("../odds/eligible-operators.mjs");
  for (const lineGate of [undefined, CLOSED]) {
    const rows = buildTrendRows({ boards: [lined], evidenceByEvent: evidence, now: NOW, ...(lineGate ? { lineGate } : {}) });
    assert.equal(rows.length, 3, "the same rows, history intact");
    for (const r of rows) assert.deepEqual([r.lineState, r.line, r.badge, r.tier], [null, null, null, null]);
    assert.doesNotMatch(JSON.stringify(rows), /draftkings|betonline|55\.5|1\.5/, "no line or book reaches the client payload");
    const html = renderToStaticMarkup(React.createElement(Table, { rows }));
    assert.doesNotMatch(html, FORBIDDEN);
    assert.doesNotMatch(html, LINE_ARTEFACTS);
    assert.ok(!html.includes(BOOK_AVAILABILITY_NOTE));
    assert.match(html, /70 · 60 · 80 · 50 · 66/, "history stays");
    assert.match(html, /\+26/, "vs projection stays");
  }
  // non-vacuous: the same board with the gate OPEN prints the record, the book and the note
  const open = renderToStaticMarkup(React.createElement(Table, { rows: buildTrendRows({ boards: [lined], evidenceByEvent: evidence, now: NOW, lineGate: OPEN }) }));
  assert.match(open, /<th>Line<\/th>/);
  assert.match(open, /4\/5 over<div class="nt-g">vs 55\.5 at draftkings/);
  assert.ok(open.includes(BOOK_AVAILABILITY_NOTE));
});

test("gate per game: a game without a readable artifact shows no line content beside an open game's record", async () => {
  const { default: Table } = await import("../../../components/nfl/trends-table.tsx");
  const other = { ...lined, providerEventId: "10", matchup: "CHI @ DET", players: [{ ...lined.players[0], playerId: "z", name: "Other Star", team: "DET" }] };
  const ev2 = { ...evidence, 10: { z: evidence[9].a } };
  const seen = [];
  const rows = buildTrendRows({ boards: [lined, other], evidenceByEvent: ev2, now: NOW, lineGate: (id) => { seen.push(id); return id === "9"; } });
  assert.deepEqual([...new Set(seen)].sort(), ["10", "9"], "the gate is asked per game");
  const z = rows.find((r) => r.playerId === "z" && r.family === "player_reception_yds");
  assert.deepEqual([z.lineState, z.line, z.badge, z.tier], [null, null, null, null]);
  const a = rows.find((r) => r.playerId === "a" && r.family === "player_reception_yds");
  assert.equal(a.lineState, "COMPLETE");
  const html = renderToStaticMarkup(React.createElement(Table, { rows }));
  const zRow = html.slice(html.indexOf('data-trend-row="z"'), html.indexOf("</tr>", html.indexOf('data-trend-row="z"')));
  assert.ok(zRow.length > 0);
  assert.doesNotMatch(zRow, LINE_ARTEFACTS);
  assert.match(zRow, /<td>—<\/td>$/, "closed row: an empty Line cell");
  assert.match(html, /4\/5 over<div class="nt-g">vs 55\.5 at draftkings/, "open row unchanged");
});

test("the /nfl/trends page on committed data (no line key ⇒ every game closed): no line column, no line sentence, no book", async () => {
  const { default: Page } = await import("../../../app/nfl/trends/page.tsx");
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /Recent form vs the official projection/, "the page rendered");
  console.log(`# /nfl/trends committed render: ${(html.match(/data-trend-row=/g) ?? []).length} table rows (0 when the evidence file covers no upcoming board)`);
  assert.doesNotMatch(html, FORBIDDEN);
  assert.doesNotMatch(html, /sportsbook|hit rate against a line|record against the line|made-up line|<th>Line<\/th>|data-book-availability-note/i);
  const src = (await import("node:fs")).readFileSync(new URL("../../../app/nfl/trends/page.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(!display\.public\) return false;\n    if \(!seen\.has\(eventId\)\) seen\.set\(eventId, nflPublicLineRecords\(eventId\) != null\);/, "the page's gate is the switch AND a readable artifact");
  assert.match(src, /lineGate: nflLineGate\(\)/);
});
