/**
 * PAGE WEIGHT of /nfl/trends on a FULL slate (review of #1355: the table is a client island, so every row ships in the
 * RSC payload; the 13-game slate at build instant 2026-11-13 carried 561 rows = 272 KB of row JSON, ~312 KB escaped in
 * the HTML, on top of a ~70 KB page shell — no budget covered the route).
 *
 * Fixture: the COMMITTED NFL player boards that kick off after 2026-11-13T12:00Z (13 games) with their evidence built
 * from the committed player-events file (games before each kickoff only, so the fixture does not drift as later
 * results are added). Two line states:
 *   - closed (every CI build: no key) — no line content at all;
 *   - worst case open: a SYNTHETIC line for EVERY over/under pair (a fixture value half a point above the median, one
 *     invented price; not a real price) so every row carries a record and a caption.
 * Budgets (bytes), measured on this fixture 2026-11-16 (render-level: no export build was run):
 *                 rows  payload as objects → packed   table HTML   + shell = est. page
 *   closed         561   312,093 B → 32,519 B           28,766 B    132,965 B
 *   open (worst)   561   330,400 B → 40,520 B           37,732 B    149,932 B
 *   - payload: the packed client props (trends-wire.mjs) as embedded in the HTML (JSON string-escaped);
 *   - table HTML: the table's server render of the default view;
 *   - shell: the smallest exported page of the site (/games/ 69,875 B on a 2026-11-10 export) rounded up to 70 KiB;
 *   - route target 150 KiB for payload + table + shell. A real export measurement should replace the estimate with a
 *     BUDGET_KB entry (lib/uiux/page-weight-budgets.mjs) from the first measured build.
 * Also: the packed wire round-trips every rendered field, and the table renders identical HTML from rows or packed.
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

/* worst case open: a synthetic line beside every PUBLISHED over/under projection, captured 6 h before kickoff */
function syntheticLines(b) {
  const cap = new Date(Date.parse(b.kickoffUtc) - 6 * 3600_000).toISOString();
  const rows = [];
  for (const p of b.players ?? []) for (const d of Object.values(NFL_FAMILIES)) {
    const m = p.markets?.[d.board];
    if (d.kind !== "OU" || typeof m?.median !== "number") continue;
    rows.push({ canonicalEventId: `nfl-${b.providerEventId}`, playerId: p.playerId, market: d.market, book: "draftkings", line: Math.round(m.median) + 0.5, overPrice: -111, underPrice: -111, capturedAt: cap });
  }
  return nflEvidenceLines({ board: b, rows, asOf: new Date(Date.parse(b.kickoffUtc) - 3600_000).toISOString() });
}
const ROWS_CLOSED = buildTrendRows({ boards: BOARDS, evidenceByEvent: EVIDENCE, now: NOW });
const ROWS_OPEN = buildTrendRows({ boards: BOARDS, evidenceByEvent: EVIDENCE, now: NOW, linesByEvent: Object.fromEntries(BOARDS.map((b) => [String(b.providerEventId), syntheticLines(b)])) });
const embedded = (w) => Buffer.byteLength(JSON.stringify(JSON.stringify(w))); // as a string inside the HTML's flight script
const SHELL = 70 * 1024;
const ROUTE_TARGET = 150 * 1024;
const PAYLOAD_MAX = { closed: 36 * 1024, open: 44 * 1024 };
const TABLE_HTML_MAX = { closed: 32 * 1024, open: 40 * 1024 };

test("fixture: the full 13-game slate (non-vacuous)", () => {
  assert.equal(BOARDS.length, 13);
  assert.ok(ROWS_CLOSED.length >= 500, `${ROWS_CLOSED.length} rows`);
  assert.ok(ROWS_OPEN.filter((r) => r.line).length >= 250, "worst case: most over/under rows carry a line caption");
});

for (const [state, rows] of [["closed", ROWS_CLOSED], ["open", ROWS_OPEN]]) {
  test(`${state}: packed payload + table HTML stay inside the route budget`, () => {
    const packed = packTrendRows(rows);
    const payload = embedded(packed), objects = embedded(rows);
    const html = renderToStaticMarkup(React.createElement(Table, { packed }));
    console.log(`# ${state}: ${rows.length} rows · payload ${payload} B packed (${objects} B as objects) · table HTML ${html.length} B · est. page ${SHELL + payload + html.length} B`);
    assert.ok(payload <= PAYLOAD_MAX[state], `packed payload ${payload} B > ${PAYLOAD_MAX[state]} B`);
    assert.ok(html.length <= TABLE_HTML_MAX[state], `table HTML ${html.length} B > ${TABLE_HTML_MAX[state]} B`);
    assert.ok(SHELL + payload + html.length <= ROUTE_TARGET, `estimated page ${SHELL + payload + html.length} B > ${ROUTE_TARGET} B`);
    assert.ok(payload * 5 < objects, "packing is what keeps it there (plain objects are > 5x larger)");
  });

  test(`${state}: the wire round-trips every rendered field; the table renders the same bytes from rows or packed`, () => {
    const back = unpackTrendRows(packTrendRows(rows));
    const KEYS = ["eventId", "matchup", "playerId", "name", "team", "opponent", "eligibility", "family", "label", "last5", "games5", "recorded5", "noStatLine5", "median5", "median10", "tdGames5", "projection", "probability", "vsProjection", "lineState", "line", "badge", "pushes"];
    const pick = (r) => Object.fromEntries(KEYS.map((k) => [k, r[k] ?? null]));
    assert.deepEqual(back.map(pick), rows.map(pick));
    assert.equal(renderToStaticMarkup(React.createElement(Table, { packed: packTrendRows(rows) })), renderToStaticMarkup(React.createElement(Table, { rows })));
  });
}
