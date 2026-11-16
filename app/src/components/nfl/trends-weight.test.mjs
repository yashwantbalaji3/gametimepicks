/**
 * PAGE WEIGHT of /nfl/trends on a FULL slate (review of #1355: the table is a client island, so every row ships in the
 * RSC payload; the 13-game slate at build instant 2026-11-13 carried 561 rows = 272 KB of row JSON, ~312 KB escaped in
 * the HTML, on top of the page shell — no budget covered the route).
 *
 * FIXTURE: the COMMITTED NFL player boards that kick off after 2026-11-13T12:00Z (13 games) with their evidence built
 * from the committed player-events file (games before each kickoff only, so the fixture does not drift as results are
 * added); the 16-game slate (the NFL maximum) adds 3 copies under fake ids (weight only). Line states:
 *   - closed (every CI build: no key) — no line content at all;
 *   - open: a SYNTHETIC line for EVERY over/under pair (median rounded + 0.5, one invented price; never a real price).
 *     "one book / instant": one book and one capture instant per game. "varied" (the worst case): books rotate through
 *     every eligible operator and every row has its own capture minute (minutes, hours and days differ within the 12 h
 *     freshness window), so no caption part repeats by accident.
 *
 * MEASURED 2026-11-16 (render-level; no export build was run):
 *                                         rows  payload: objects → packed   table HTML   est. page
 *   closed 13                              561   322,752 → 32,519 B         16,761 B     120,960 B
 *   open 13, one book / instant per game   561   355,495 → 39,705 B         21,436 B     132,821 B
 *   open 13, varied                        561   353,889 → 39,927 B         21,324 B     132,931 B
 *   closed 16                              707   407,796 → 41,254 B         16,921 B     129,855 B
 *   open 16, varied (worst)                707   447,065 → 50,503 B         21,485 B     143,668 B
 * (before this change, 13 games: table HTML 28,766 / 37,732 B unbounded by INITIAL_ROWS; the reviewer's varied probe
 *  measured 54.7 KB packed and 163.8 KB est. page at 13 games, ~185 KB at 16.)
 *
 * ASSUMPTIONS of "est. page" (= shell + payload + table HTML), stated because no export was measured:
 *   - shell = 70 KiB: the smallest exported page of the site (/games/ 69,875 B on a 2026-11-10 export) — the root
 *     layout's HTML, its RSC flight and the <script src> tags. JavaScript chunks are separate files: they are NOT in
 *     index.html and not in this number (the export guard lib/uiux/page-weight.test.mjs measures index.html only);
 *   - payload = the packed client props (trends-wire.mjs) embedded ONCE in the HTML's flight script, JSON
 *     string-escaped; the export's separate out/nfl/trends/index.txt (RSC for client navigation) is another file;
 *   - table HTML = the table's server render of the default view, bounded by INITIAL_ROWS (trends-table.tsx);
 *   - the page's own heading and notes (~2 KB, twice: HTML + flight) are inside the headroom.
 * BUDGETS: est. page ≤ 95% of the 150 KiB route target for EVERY case (≥ 5% headroom on the worst case); payload and
 * table-HTML ceilings per state below. A real export measurement should add a BUDGET_KB entry
 * (lib/uiux/page-weight-budgets.mjs) from the first measured build.
 * Also: the packed wire round-trips every rendered field for every case, the table renders identical HTML from rows or
 * packed, ids and captions that do not fit the compact forms travel whole, and packing throws on an inconsistent row.
 * Run (from app/): npx tsx --test src/components/nfl/trends-weight.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

import { buildEvidenceFile } from "../../lib/sports/nfl/player-evidence.mjs";
import { buildTrendRows } from "../../lib/sports/nfl/trends-rows.mjs";
import { sanitizePlayerBoard } from "../../lib/sports/odds/public-offer-sanitizer.mjs";
import { nflEvidenceLines } from "../../lib/sports/nfl/evidence-line.mjs";
import { NFL_FAMILIES } from "../../lib/sports/nfl/prop-line-adapter.mjs";
import { ELIGIBLE_OPERATOR_KEYS } from "../../lib/sports/odds/eligible-operators.mjs";
import { packTrendRows, unpackTrendRows } from "../../lib/sports/nfl/trends-wire.mjs";

const { default: Table } = await import("./trends-table.tsx");

const APP = process.cwd();
const NOW = "2026-11-13T12:00:00Z";
const BOARDS = fs.readdirSync(path.join(APP, "public/data/nfl/player-board")).filter((f) => /^\d+\.json$/.test(f))
  .map((f) => sanitizePlayerBoard(JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/player-board", f), "utf8"))))
  .filter((b) => Date.parse(b.kickoffUtc) > Date.parse(NOW));
const EVENTS = JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/nfl/player-events-v1/2026.json"), "utf8"));
const DOC = buildEvidenceFile({ boards: BOARDS, games: EVENTS.games, sourceHash: "fixture" });
const EVIDENCE = Object.fromEntries(Object.entries(DOC.events).map(([k, v]) => [k, v.players]));

/* 16-game slate (the NFL maximum): the 13 committed boards + 3 copies under fake ids (weight only), kicking off later */
const FAKE = BOARDS.slice(0, 3).map((b, i) => ({ ...b, providerEventId: `99900000${i}`, kickoffUtc: new Date(Date.parse(b.kickoffUtc) + (i + 1) * 3 * 3600_000).toISOString() }));
const BOARDS16 = [...BOARDS, ...FAKE];
const EVIDENCE16 = { ...EVIDENCE, ...Object.fromEntries(FAKE.map((b, i) => [b.providerEventId, EVIDENCE[BOARDS[i].providerEventId]])) };

/* worst case open: a SYNTHETIC line beside every PUBLISHED over/under projection. `varied`: the books rotate through every
   eligible operator and every row has its own capture minute (different minutes, hours and days within the 12 h
   freshness window), so no caption part repeats by accident; otherwise one book and one capture instant per game. */
let seq = 0; // across games, so capture minutes do not repeat from one game to the next
function syntheticLines(b, varied) {
  const asOf = Date.parse(b.kickoffUtc) - 3600_000;
  const rows = [];
  let n = 0;
  for (const p of b.players ?? []) for (const d of Object.values(NFL_FAMILIES)) {
    const m = p.markets?.[d.board];
    if (d.kind !== "OU" || typeof m?.median !== "number") continue;
    n++; seq++;
    const cap = varied ? new Date(asOf - ((17 + seq * 37) % (11 * 60)) * 60_000 - 60_000).toISOString() : new Date(asOf - 5 * 3600_000).toISOString();
    rows.push({ canonicalEventId: `nfl-${b.providerEventId}`, playerId: p.playerId, market: d.market, book: varied ? ELIGIBLE_OPERATOR_KEYS[n % ELIGIBLE_OPERATOR_KEYS.length] : "draftkings", line: Math.round(m.median) + 0.5, overPrice: -111, underPrice: -111, capturedAt: cap });
  }
  return nflEvidenceLines({ board: b, rows, asOf: new Date(asOf).toISOString() });
}
const rowsOf = (boards, evidence, lines) => buildTrendRows({ boards, evidenceByEvent: evidence, now: NOW, ...(lines ? { linesByEvent: Object.fromEntries(boards.map((b) => [String(b.providerEventId), lines(b)])) } : {}) });
const CASES = {
  "closed 13": rowsOf(BOARDS, EVIDENCE, null),
  "open 13, one book / instant per game": rowsOf(BOARDS, EVIDENCE, (b) => syntheticLines(b, false)),
  "open 13, varied books + capture times": rowsOf(BOARDS, EVIDENCE, (b) => syntheticLines(b, true)),
  "closed 16": rowsOf(BOARDS16, EVIDENCE16, null),
  "open 16, varied books + capture times": rowsOf(BOARDS16, EVIDENCE16, (b) => syntheticLines(b, true)),
};
const ROWS_CLOSED = CASES["closed 13"], ROWS_VARIED = CASES["open 16, varied books + capture times"];
const embedded = (w) => Buffer.byteLength(JSON.stringify(JSON.stringify(w))); // as a string inside the HTML's flight script
const SHELL = 70 * 1024;
const ROUTE_TARGET = 150 * 1024;
const EST_MAX = Math.floor(0.95 * ROUTE_TARGET);
const PAYLOAD_MAX = { closed: 44 * 1024, open: 54 * 1024 };
const TABLE_HTML_MAX = 24 * 1024; // INITIAL_ROWS rows, any slate

test("fixture: 13 and 16 games, and the varied worst case really varies (non-vacuous)", () => {
  assert.equal(BOARDS.length, 13);
  assert.equal(BOARDS16.length, 16);
  assert.ok(ROWS_CLOSED.length >= 500 && ROWS_VARIED.length >= 650, `${ROWS_CLOSED.length} / ${ROWS_VARIED.length} rows`);
  const lined = ROWS_VARIED.filter((r) => r.line);
  assert.ok(lined.length >= 350, `${lined.length} captioned rows`);
  assert.ok(new Set(lined.map((r) => r.lineParts[1])).size >= 8, "every eligible book label appears");
  assert.ok(new Set(lined.map((r) => r.lineParts[2])).size >= 300, "capture times differ row to row");
  assert.ok(new Set(lined.map((r) => r.lineParts[2].split(", ")[0])).size >= 2, "…across days too");
});

for (const [state, rows] of Object.entries(CASES)) {
  const open = state.startsWith("open");
  test(`${state}: packed payload + table HTML stay inside the route budget`, () => {
    const packed = packTrendRows(rows);
    const payload = embedded(packed), objects = embedded(rows);
    const html = renderToStaticMarkup(React.createElement(Table, { packed }));
    const est = SHELL + payload + html.length;
    console.log(`# ${state}: ${rows.length} rows · payload ${payload} B packed (${objects} B as objects) · table HTML ${html.length} B · est. page ${est} B`);
    assert.ok(payload <= PAYLOAD_MAX[open ? "open" : "closed"], `packed payload ${payload} B > ${PAYLOAD_MAX[open ? "open" : "closed"]} B`);
    assert.ok(html.length <= TABLE_HTML_MAX, `table HTML ${html.length} B > ${TABLE_HTML_MAX} B`);
    assert.ok(est <= EST_MAX, `estimated page ${est} B > ${EST_MAX} B (95% of the ${ROUTE_TARGET} B route target)`);
    assert.ok(payload * 5 < objects, "packing is what keeps it there (plain objects are > 5x larger)");
    assert.match(html, new RegExp(`Show all \\d+ rows`), "the rest of the rows are one click away");
  });

  test(`${state}: the wire round-trips every rendered field; the table renders the same bytes from rows or packed`, () => {
    const back = unpackTrendRows(packTrendRows(rows));
    const pick = (r) => Object.fromEntries(RENDERED.map((k) => [k, r[k] ?? null]));
    assert.deepEqual(back.map(pick), rows.map(pick));
    assert.equal(renderToStaticMarkup(React.createElement(Table, { packed: packTrendRows(rows) })), renderToStaticMarkup(React.createElement(Table, { rows })));
  });
}
const RENDERED = ["eventId", "matchup", "playerId", "name", "team", "opponent", "eligibility", "family", "label", "last5", "games5", "recorded5", "noStatLine5", "median5", "median10", "tdGames5", "projection", "probability", "vsProjection", "lineState", "line", "badge", "pushes"];

test("lossless edges: odd ids, captions outside the compact forms; inconsistent rows throw", () => {
  const base = ROWS_VARIED.find((r) => r.line && r.lineState === "COMPLETE");
  const odd = [
    { ...base, playerId: "nfl-athlete-=5" },
    { ...base, playerId: "=7" },
    { ...base, playerId: "espn-123" },
    { ...base, playerId: "nfl-athlete-" },
    (() => { const parts = ["30.0", "Caesars", "Nov 15, 7:05 AM ET"]; return { ...base, playerId: "nfl-athlete-1", lineParts: parts, line: `30.0 at Caesars, captured Nov 15, 7:05 AM ET` }; })(),
    (() => { const parts = ["1.25", "BetMGM", "Nov 15, 07:05 AM ET"]; return { ...base, playerId: "nfl-athlete-2", lineParts: parts, line: `1.25 at BetMGM, captured Nov 15, 07:05 AM ET` }; })(),
    { ...base, playerId: "nfl-athlete-3", badge: "05/5" },
  ];
  const pick = (r) => Object.fromEntries(RENDERED.map((k) => [k, r[k] ?? null]));
  assert.deepEqual(unpackTrendRows(packTrendRows(odd)).map(pick), odd.map(pick));
  assert.throws(() => packTrendRows([{ ...base, line: base.line + " " }]), /does not re-assemble/);
  assert.throws(() => packTrendRows([{ ...base, games5: 4 }]), /not what last5 implies/);
  assert.throws(() => packTrendRows([{ ...base, opponent: "XXX" }]), /not the other side/);
});
