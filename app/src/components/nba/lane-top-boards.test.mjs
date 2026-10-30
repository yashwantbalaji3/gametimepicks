/**
 * NBA DAILY TOP BOARDS on /nba/projections (§13 amendment B, founder 2026-10-29/30) — RENDERED. On the committed
 * 2026-10-29 lane, through the real view:
 *   - every board cell string (player, team, median digits) == the /nba/projections table's own string for that player
 *     and statistic (the SSR table rows and the island's packed wire rows), every row of every board;
 *   - a failed gate renders ONE status sentence and no table, no digit;
 *   - a started game's players are not on the pregame boards;
 *   - no gate (switch off, keyless build, dated page) → the view's bytes are exactly the bytes without the prop;
 *   - no line / odds / probability / edge vocabulary; a11y structure; page-weight bound for the section.
 *
 * Run (from app/): npx tsx --test src/components/nba/lane-top-boards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

process.env.__NEXT_TRAILING_SLASH = "true";
globalThis.React = React;

import { gateLaneTopBoards, NBA_TOP_BOARDS_UNAVAILABLE_TEXT } from "../../lib/sports/nba/lane-top-boards.mjs";
import { PROJECTION_BOARD_STATS } from "../../lib/sports/nba/experimental-public-lane.mjs";
import { boardRows, packBoard, unpackBoard } from "../../lib/sports/nba/projection-board-ops.mjs";

const { default: View } = await import("./projections-view.tsx");
const { default: Section } = await import("./lane-top-boards.tsx");

const APP = process.cwd();
const LANE_TEXT = fs.readFileSync(path.join(APP, "public/data/nba/experimental-public/2026-10-29.json"), "utf8");
const lane = () => JSON.parse(LANE_TEXT);
const PRE_TIP = "2026-10-29T23:00:00Z";
const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/<!-- -->/g, "");
const render = (props) => renderToStaticMarkup(React.createElement(View, { lane: lane(), role: "current", date: "2026-10-29", ...props }));
const sectionOf = (html) => {
  const at = html.indexOf('<section aria-labelledby="nba-top-boards-h"');
  if (at < 0) return null;
  let depth = 0;
  for (const m of html.slice(at).matchAll(/<(\/?)section\b/g)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(at, at + m.index + "</section>".length);
  }
  throw new Error("unbalanced section");
};
/** Board key → [rank, player, team, game, median] per rendered row. */
const boardCells = (section) => Object.fromEntries([...section.matchAll(/<section data-nba-top-board="([^"]+)"[\s\S]*?<\/section>/g)].map(([b, key]) => [
  key,
  [...b.matchAll(/<tr><td>(\d+)<\/td><th scope="row">([^<]*)<\/th><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)].map((m) => m.slice(1).map(decode)),
]));

test("rendered board strings == /nba/projections strings, every row of every board (committed 2026-10-29 lane)", () => {
  const gate = gateLaneTopBoards(lane(), { dated: lane(), nowIso: PRE_TIP });
  assert.equal(gate.state, "PUBLISHED");
  const html = render({ topBoards: gate });
  const section = sectionOf(html);
  assert.ok(section, "the section rendered");
  const cells = boardCells(section);
  assert.deepEqual(Object.keys(cells), PROJECTION_BOARD_STATS.map(([k]) => k));

  // The projections table as SERVER-RENDERED (all rows of a 3-game slate fit the SSR window), keyed by player + team.
  const table = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  const ssr = new Map([...table.matchAll(/<tr><th scope="row">([^<]*)(?:<[^>]*>[^<]*<\/[^>]*>)?<\/th><td[^>]*>([^<]*)<\/td><td>([^<]*)<\/td>((?:<td>[^<]*<\/td>)+)<\/tr>/g)]
    .map((m) => [`${decode(m[1]).replace(/ · .*$/, "")}|${m[2]}`, [...m[4].matchAll(/<td>([^<]*)<\/td>/g)].map((x) => x[1])]));
  // The island's packed wire rows (what the browser renders with String(v)).
  const wire = new Map(unpackBoard(packBoard(boardRows(lane(), PROJECTION_BOARD_STATS))).map((r) => [`${r.name}|${r.team}`, r.v.map((v) => (v == null ? "—" : String(v)))]));
  const gamesById = new Map(lane().games.map((g) => [String(g.providerEventId), g]));

  let checked = 0;
  for (const [i, [key]] of PROJECTION_BOARD_STATS.entries()) {
    const board = gate.doc.boards.find((b) => b.key === key);
    assert.equal(cells[key].length, board.rows.length, `${key}: every ranked row renders`);
    for (const [j, [rank, name, team, game, median]] of cells[key].entries()) {
      const r = board.rows[j];
      const at = `${key} #${rank} ${name}`;
      assert.equal(rank, String(j + 1), at);
      assert.equal(name, r.name, at);
      const g = gamesById.get(r.providerEventId);
      assert.equal(game, `${g.away.abbr} @ ${g.home.abbr}`, `${at}: the matchup`);
      assert.ok([g.away.abbr, g.home.abbr].includes(team), `${at}: team is one side of the game`);
      assert.ok(ssr.has(`${name}|${team}`), `${at}: on the /nba/projections table`);
      assert.equal(median, ssr.get(`${name}|${team}`)[i], `${at}: == the /nba/projections table cell`);
      assert.equal(median, wire.get(`${name}|${team}`)[i], `${at}: == the island's row`);
      checked += 1;
    }
  }
  assert.equal(checked, 35, "7 boards × 5 rows");
  // ranking method text and snapshot time on every board
  for (const [key, b] of Object.entries(Object.fromEntries([...section.matchAll(/<section data-nba-top-board="([^"]+)"[\s\S]*?<\/section>/g)].map(([s, k]) => [k, s])))) {
    assert.match(decode(b), /Ranked by projected median [^.]+\.[^<]*Not a chance to go over any line\. Snapshot Oct 29, 12:49 PM ET\./, key);
  }
});

test("structure + vocabulary: captioned tables with column and row headers; no line / odds / probability / edge / pick words", () => {
  const section = sectionOf(render({ topBoards: gateLaneTopBoards(lane(), { dated: lane(), nowIso: PRE_TIP }) }));
  assert.equal((section.match(/<table>/g) ?? []).length, 7);
  assert.equal((section.match(/<caption>Highest projected [^<]+ \(model median\)<\/caption>/g) ?? []).length, 7);
  assert.equal((section.match(/<th scope="row">/g) ?? []).length, 35);
  assert.equal((section.match(/<th scope="col" aria-label="Rank">#<\/th>/g) ?? []).length, 7);
  assert.match(section, /<h2 id="nba-top-boards-h"[^>]*>Top Boards<\/h2>/);
  assert.doesNotMatch(section, /style="[^"]*(?:width|min-width):\s*\d{3,}px/, "no fixed width that would force sideways scrolling at 390 px");
  const text = decode(section.replace(/<[^>]+>/g, " ")).replace(/&mdash;/g, "—").replace(/\s+/g, " ")
    .replace(/not a\s+chance to go over any line/gi, "").replace(/Not a chance to go over any line\./g, "").replace(/not a betting recommendation/gi, "");
  assert.doesNotMatch(text, /%|probabilit|\bodds\b|\blines?\b|\bedges?\b|\bEV\b|\bpicks?\b|\bover\b|\bunder\b|sportsbook|\block\b|best bet/i);
});

test("a failed gate renders one status sentence: no table, no rank, no digit of any player", () => {
  const drifted = lane();
  drifted.games[0].players.home[0].medians.pts += 1;
  const gate = gateLaneTopBoards(lane(), { dated: drifted, nowIso: PRE_TIP });
  assert.equal(gate.reason, "PROVENANCE");
  const section = decode(sectionOf(render({ topBoards: gate })));
  assert.match(section, /data-nba-top-boards="UNAVAILABLE"/);
  assert.match(section, new RegExp(`<p[^>]*role="status" data-reason="PROVENANCE">${NBA_TOP_BOARDS_UNAVAILABLE_TEXT.PROVENANCE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</p>`));
  assert.doesNotMatch(section, /<table|<tr/);
  assert.doesNotMatch(section.replace(/<[^>]+>/g, " "), /\d/, "no digit in the visible text");
  // the Section on its own: null renders nothing
  assert.equal(renderToStaticMarkup(React.createElement(Section, { gate: null })), "");
  // every game tipped at build → the same single-sentence state
  const done = sectionOf(render({ topBoards: gateLaneTopBoards(lane(), { dated: lane(), nowIso: "2026-10-30T06:00:00Z" }) }));
  assert.match(done, /data-reason="NO_PREGAME_GAMES"/);
  assert.doesNotMatch(done, /<table/);
});

test("started games are excluded from the rendered pregame boards (build after the two 00:00Z tips)", () => {
  const gate = gateLaneTopBoards(lane(), { dated: lane(), nowIso: "2026-10-30T00:05:00Z" });
  const cells = boardCells(sectionOf(render({ topBoards: gate })));
  const late = lane().games.find((g) => g.tipUtc === "2026-10-30T02:00Z");
  const lateGame = `${late.away.abbr} @ ${late.home.abbr}`;
  for (const [key, rows] of Object.entries(cells)) for (const r of rows) assert.equal(r[3], lateGame, `${key}: ${r[1]} is from a game already under way`);
  assert.match(sectionOf(render({ topBoards: gate })), /2 games already under way are left out/);
});

test("no gate (switch off, keyless build, dated page, past slate) → the view is byte-identical to the view without the prop", () => {
  const base = render({});
  assert.equal(render({ topBoards: null }), base);
  assert.equal(render({ topBoards: gateLaneTopBoards(lane(), { dated: lane(), nowIso: PRE_TIP, enabled: false }) }), base);
  assert.equal(sectionOf(base), null);
  const past = renderToStaticMarkup(React.createElement(View, { lane: lane(), role: "past", date: "2026-10-29", dated: true }));
  assert.equal(sectionOf(past), null);
});

test("page weight: the published section adds a bounded number of bytes, independent of slate size (35 rows)", () => {
  const base = render({});
  const withBoards = render({ topBoards: gateLaneTopBoards(lane(), { dated: lane(), nowIso: PRE_TIP }) });
  const added = withBoards.length - base.length;
  // HTML only; the static export embeds the server component's output once more in the RSC payload (~same size).
  assert.ok(added > 3_000 && added < 10_000, `section adds ${added} B of HTML`);
  console.log(`# Top Boards section: +${added} B HTML (×~2 with the RSC payload)`);
});
