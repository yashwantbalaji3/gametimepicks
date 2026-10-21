/**
 * NBA Top Board TABLE — server render on SYNTHETIC fixtures (no real NBA data, no price).
 * Pins: every price column says "No authorized NBA price" with NO_AUTHORIZED_PRICE; the table scrolls inside its own
 * container (the page never scrolls sideways at 320 px); explicit states for no document, a market not on this
 * freeze, a not-modelled market; edge/sportsbook controls disabled with the reason.
 *
 * Run (from app/): npx tsx --test src/components/nba/top-board-table.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { freezeBoards } from "../../lib/sports/nba/top-boards.mjs";
import { boardTableModel } from "../../lib/sports/nba/top-board-rows.mjs";
import { artifact, game, player, SHA } from "../../lib/sports/nba/__fixtures__/top-board-fixtures.mjs";

globalThis.React = React;
const { default: TopBoardTable } = await import("./top-board-table.tsx");

const doc = freezeBoards({
  existing: null, sourceSha256: SHA, frozenAt: "2026-11-01T16:00:00Z", family: "v0.1", date: "2026-11-01",
  artifact: artifact([game("fx-1", { home: [player(1), player(2, { pts: 14 })], away: [player(3)] })]),
}).doc;
const html = (model) => renderToStaticMarkup(React.createElement(TopBoardTable, { model }));

test("every row renders, and all six price columns say 'No authorized NBA price' with the reason code", () => {
  const model = boardTableModel(doc);
  const out = html(model);
  const bodyRows = out.split("<tbody>")[1].split("</tbody>")[0].match(/<tr>/g).length;
  assert.equal(bodyRows, model.rows.length);
  assert.equal((out.match(/No authorized NBA price<\/span><code>NO_AUTHORIZED_PRICE<\/code>/g) ?? []).length, model.rows.length * 6);
  for (const h of ["Sportsbook", "Line", "Over / Under", "Model probability", "Odds", "Edge / EV", "Model projection", "Updated"]) assert.ok(out.includes(`>${h}</th>`), h);
  assert.match(out, /Odds captured — none/);
  assert.match(out, /joint sum of pts \+ reb \+ ast \(same draws\)/);
  assert.match(out, /id 1/);
  // never a side, a probability or an EV number
  assert.doesNotMatch(out, /\b(Over|Under) \d|\d+(\.\d+)?% ·|[+-]\d{3}\b/);
});

test("mobile: the table is inside its own horizontal scroll region; controls stack in one column under 640px", () => {
  const out = html(boardTableModel(doc));
  assert.match(out, /class="tbt-scroll" role="region" aria-label="Board rows \(scrolls sideways\)" tabindex="0"/);
  assert.match(out, /\.tbt-scroll\{overflow-x:auto;max-width:100%/);
  assert.match(out, /\.tbt-controls\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(out, /@media \(min-width:640px\)\{\.tbt-controls\{grid-template-columns:repeat\(3/);
  assert.match(out, /\.tbt\{color:var\(--vault-text\);min-width:0;max-width:100%\}/);
});

test("edge and sportsbook controls are disabled with the explanation; the edge/sportsbook sorts too", () => {
  const out = html(boardTableModel(doc));
  assert.match(out, /<select id="[^"]+-book" disabled=""/);
  assert.match(out, /<input id="[^"]+-mine" type="number"[^>]* disabled=""/);
  assert.equal((out.match(/Disabled — No authorized NBA price \(NO_AUTHORIZED_PRICE\)\./g) ?? []).length, 2);
  assert.match(out, /<option value="edge" disabled="">Edge \/ EV \(no price\)<\/option>/);
  assert.match(out, /<option value="sportsbook" disabled="">Sportsbook \(no price\)<\/option>/);
});

test("explicit states: no document; R+A not modelled; an @1 file's joint boards not on this freeze", () => {
  assert.match(html(null), /No board document\./);
  const out = html(boardTableModel(doc));
  assert.match(out, /R\+A · not modelled/);
  const v1 = JSON.parse(JSON.stringify(doc));
  v1.schema = "nba-top-board@1";
  for (const e of v1.editions) for (const k of ["pra", "ptsReb", "ptsAst", "rebAst"]) delete e.boards[k];
  const o1 = html(boardTableModel(v1));
  assert.match(o1, /PRA · not on this freeze/);
  assert.match(o1, /P\+R · not on this freeze/);
  const empty = JSON.parse(JSON.stringify(doc));
  for (const e of empty.editions) for (const b of Object.values(e.boards)) b.rows = [];
  assert.match(html(boardTableModel(empty)), /No ranked rows on this freeze\./);
});
