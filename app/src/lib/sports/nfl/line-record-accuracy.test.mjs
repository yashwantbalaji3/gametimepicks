/**
 * OPEN-STATE ACCURACY · a record against today's line, on /nfl/trends and in the Recent form panel, is computed for the
 * right player, the right family, against the exact threshold, over exactly the 5 most recent games before kickoff —
 * and its caption names that exact line, book and ET capture time. Synthetic games through the REAL chain:
 * raw games → buildEvidenceFile (gameLog) → buildTrendRows / panel, with a sanitised board; the LINES come from
 * artifact-shaped rows through nflEvidenceLines (the line section's own selection), never the board's offer slot.
 *
 * Threshold semantics (lineRecord, player-evidence.mjs): value > line ⇒ over (hit); value < line ⇒ miss;
 * value === line ⇒ PUSH (neither); a missing stat line ⇒ INCOMPLETE. badge = `${hits}/${window}` (a push stays in the
 * 5-game denominator), rate = hits / (hits + misses); trendTier is null whenever a push is present.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/line-record-accuracy.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

import { buildEvidenceFile, lineRecord } from "./player-evidence.mjs";
import { buildTrendRows } from "./trends-rows.mjs";
import { sanitizePlayerBoard } from "../odds/public-offer-sanitizer.mjs";
import { nflEvidenceLines } from "./evidence-line.mjs";

const { default: Panel } = await import("../../../components/nfl/player-evidence-panel.tsx");
const { default: Table } = await import("../../../components/nfl/trends-table.tsx");

const EVENT = "700000001", K = "2026-11-22T18:00:00Z", NOW = "2026-11-20T12:00:00Z";
const P = "nfl-athlete-21", Q = "nfl-athlete-22";
const CAP = "2026-11-21T22:30:00Z", CAP_ET = "Nov 21, 5:30 PM ET";
/* P (NEW) receptions newest → oldest: w10 6 (over 5), w9 5 (PUSH), w8 7 (over), w7 3 (under), w6 8 (over) | w5 1, w4 9
   are games 6 and 7 — outside the window. Receiving yards vs 50.5: 60, 52, 55, 20, 70 ⇒ 4/5. Q (OPP) records 0 rec
   every game (vs 2.5 ⇒ 0/5). After kickoff: w12, where P records 0 rec — never counted; the forecast game EVENT itself
   carries a bogus pre-kickoff date — excluded by id. */
const P_REC = { 10: 6, 9: 5, 8: 7, 7: 3, 6: 8, 5: 1, 4: 9 };
const P_YDS = { 10: 60, 9: 52, 8: 55, 7: 20, 6: 70, 5: 10, 4: 99 };
const date = (w) => new Date(Date.parse("2026-09-13T17:00:00Z") + (w - 1) * 7 * 864e5).toISOString();
const GAMES = [
  ...[4, 5, 6, 7, 8, 9, 10].map((w) => ({ providerEventId: `g${w}`, season: 2026, week: w, dateUtc: date(w), home: "NEW", away: "OPP", ftHome: 20, ftAway: 17,
    players: [{ playerId: P, teamAbbr: "NEW", targets: P_REC[w] + 2, rec: P_REC[w], recYds: P_YDS[w] }, { playerId: Q, teamAbbr: "OPP", targets: 3, rec: 0, recYds: 0 }] })),
  { providerEventId: "g12", season: 2026, week: 12, dateUtc: "2026-11-29T18:00:00Z", home: "NEW", away: "OPP", players: [{ playerId: P, teamAbbr: "NEW", rec: 0, recYds: 0 }, { playerId: Q, teamAbbr: "OPP", rec: 9, recYds: 150 }] },
  { providerEventId: EVENT, season: 2026, week: 11, dateUtc: "2026-11-15T18:00:00Z", home: "NEW", away: "OPP", players: [{ playerId: P, teamAbbr: "NEW", rec: 0, recYds: 0 }] },
];
const offer = (sportsbook, line) => ({ sportsbook, line, overOdds: -110, underOdds: -110, capturedAt: CAP });
const RAW_BOARD = {
  providerEventId: EVENT, matchup: "OPP @ NEW", kickoffUtc: K,
  families: { player_receptions: { state: "PUBLISHED" }, player_reception_yds: { state: "PUBLISHED" } },
  players: [
    { playerId: P, name: "WR Twentyone", team: "NEW", eligibility: { state: "ELIGIBLE" }, markets: { player_receptions: { median: 5.5, market: offer("draftkings", 5) }, player_reception_yds: { median: 54, market: offer("fanduel", 50.5) } } },
    { playerId: Q, name: "WR Twentytwo", team: "OPP", eligibility: { state: "ELIGIBLE" }, markets: { player_receptions: { median: 2, market: offer("draftkings", 2.5) } } },
  ],
};
const EVIDENCE = buildEvidenceFile({ boards: [{ providerEventId: EVENT, kickoffUtc: K, players: [{ playerId: P, team: "NEW" }, { playerId: Q, team: "OPP" }] }], games: GAMES, sourceHash: "h" }).events[EVENT].players;
/* the section's comparison instant: 7.5 h after the capture, before kickoff (inside the 12 h freshness window) */
const ASOF = "2026-11-22T06:00:00Z";
/* the game's OPEN rows (artifact-shaped), one per offer the board fixture names */
const ROWS = RAW_BOARD.players.flatMap((p) => Object.entries(p.markets).map(([k, m]) => ({ canonicalEventId: `nfl-${EVENT}`, playerId: p.playerId, market: k, book: m.market.sportsbook, line: m.market.line, overPrice: -110, underPrice: -110, capturedAt: m.market.capturedAt })));
const linesFor = (raw, rows = ROWS) => nflEvidenceLines({ board: sanitizePlayerBoard(raw), rows, asOf: ASOF });

test("the evidence window: P's 5 most recent games before kickoff, newest first — never the post-kickoff game, the forecast game or another player's line", () => {
  const log = EVIDENCE[P];
  assert.deepEqual(log.slice(0, 5).map((e) => e.eventId), ["g10", "g9", "g8", "g7", "g6"]);
  assert.ok(!log.some((e) => e.eventId === "g12" || e.eventId === EVENT));
  assert.deepEqual(log.slice(0, 5).map((e) => e.stats.rec), [6, 5, 7, 3, 8], "P's own stat lines, not Q's");
  assert.deepEqual(EVIDENCE[Q].slice(0, 5).map((e) => e.stats.rec), [0, 0, 0, 0, 0]);
});

test("lineRecord threshold: value === line is a PUSH (not over, not under); badge keeps the 5-game denominator; tier is null with a push", () => {
  const r = lineRecord(EVIDENCE[P], "player_receptions", 5, { line: { line: 5 } });
  assert.deepEqual([r.state, r.hits, r.misses, r.pushes, r.missing, r.games, r.badge, r.rate], ["COMPLETE", 3, 1, 1, 0, 5, "3/5", 0.75]);
  // the same games one tick either side of the push value
  assert.deepEqual([lineRecord(EVIDENCE[P], "player_receptions", 5, { line: { line: 4.99 } }).badge, lineRecord(EVIDENCE[P], "player_receptions", 5, { line: { line: 5.01 } }).badge], ["4/5", "3/5"]);
});

test("Trends (lines open): the right player × family × line, exact caption; a push shows in the record, never as a tier", () => {
  const rows = buildTrendRows({ boards: [RAW_BOARD], evidenceByEvent: { [EVENT]: EVIDENCE }, now: NOW, linesByEvent: { [EVENT]: linesFor(RAW_BOARD) } });
  const row = (id, fam) => rows.find((r) => r.playerId === id && r.family === fam);
  const pr = row(P, "player_receptions"), py = row(P, "player_reception_yds"), qr = row(Q, "player_receptions");
  assert.deepEqual([pr.lineState, pr.badge, pr.pushes, pr.tier, pr.line, pr.last5], ["COMPLETE", "3/5", 1, null, `5.0 at DraftKings, captured ${CAP_ET}`, [6, 5, 7, 3, 8]]);
  assert.deepEqual([py.lineState, py.badge, py.pushes, py.tier, py.line, py.last5], ["COMPLETE", "4/5", 0, "4/5", `50.5 at FanDuel, captured ${CAP_ET}`, [60, 52, 55, 20, 70]]);
  assert.deepEqual([qr.lineState, qr.badge, qr.pushes, qr.tier, qr.line, qr.last5], ["COMPLETE", "0/5", 0, null, `2.5 at DraftKings, captured ${CAP_ET}`, [0, 0, 0, 0, 0]]);
  const html = renderToStaticMarkup(React.createElement(Table, { rows }));
  const cell = (id) => { const i = html.indexOf(`data-trend-row="${id}"`); return html.slice(i, html.indexOf("</tr>", i)); };
  // the table's default market is receiving yards: P's row there carries P's yards record, line, book and time
  assert.match(cell(P), /60 · 52 · 55 · 20 · 70/);
  assert.match(cell(P), /4\/5 over<div class="nt-g">vs 50\.5 at FanDuel, captured Nov 21, 5:30 PM ET<\/div>/);
  assert.doesNotMatch(cell(P), /draftkings|2\.5 at|vs 5\.0 at/i);
  // a push in the shown market is printed, never folded into the over count: yards vs 55 ⇒ 60 over, 52 under, 55 PUSH,
  // 20 under, 70 over ⇒ "2/5 over, 1 push" (the panel's wording)
  const pushRows = ROWS.map((r) => (r.playerId === P && r.market === "player_reception_yds" ? { ...r, line: 55 } : r));
  const rows55 = buildTrendRows({ boards: [RAW_BOARD], evidenceByEvent: { [EVENT]: EVIDENCE }, now: NOW, linesByEvent: { [EVENT]: linesFor(RAW_BOARD, pushRows) } });
  const h55 = renderToStaticMarkup(React.createElement(Table, { rows: rows55 }));
  const i = h55.indexOf(`data-trend-row="${P}"`), c55 = h55.slice(i, h55.indexOf("</tr>", i));
  assert.match(c55, /2\/5 over, 1 push<div class="nt-g">vs 55\.0 at FanDuel, captured Nov 21, 5:30 PM ET<\/div>/);
});

test("Recent form panel (lines open): the same records, the exact line, book and ET capture time, push counted", () => {
  const board = sanitizePlayerBoard(RAW_BOARD);
  const proj = (value) => ({ value, p10: null, p90: null, kind: "count", text: String(value), range: null, estimate: null, market: null });
  const html = renderToStaticMarkup(React.createElement(Panel, {
    players: board.players, evidence: EVIDENCE, kickoffUtc: K, sourceNote: "src", lines: linesFor(RAW_BOARD),
    projections: { [P]: { player_receptions: proj(5.5), player_reception_yds: proj(54) }, [Q]: { player_receptions: proj(2) } },
  }));
  const block = (id, fam) => { const i = html.indexOf(`data-evidence-player="${id}"`); const j = html.indexOf(`data-evidence-family="${fam}"`, i); return html.slice(j, html.indexOf("</div></div>", j) + 12); };
  assert.ok(block(P, "player_receptions").includes(`Last 5 vs today&#x27;s line 5.0 at DraftKings, captured ${CAP_ET}: over in 3/5, 1 push.`), block(P, "player_receptions"));
  assert.ok(block(P, "player_reception_yds").includes(`Last 5 vs today&#x27;s line 50.5 at FanDuel, captured ${CAP_ET}: over in 4/5.`));
  assert.ok(block(Q, "player_receptions").includes(`Last 5 vs today&#x27;s line 2.5 at DraftKings, captured ${CAP_ET}: over in 0/5.`));
  assert.doesNotMatch(block(P, "player_receptions"), /2\.5 at|50\.5 at/, "no other player's or family's line");
});
