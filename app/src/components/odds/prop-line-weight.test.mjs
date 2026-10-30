/**
 * PAGE WEIGHT of the model-vs-sportsbook-line sections (2026-10-29 regression: on a Production-parity key build
 * /nba/projections was 977 KB against its 200 KB budget — the whole slate's per-player rows at ~1.3 KB of HTML each,
 * duplicated again in the RSC payload — and an NBA game page carried ~80–97 such rows).
 *
 * Rendered for the COMMITTED 2026-10-29 lane with a SYNTHETIC price record for EVERY lane player × EVERY family (the worst
 * case: more rows than any real artifact). Synthetic only: a fake book ("fixturebook"), one fake price (−111 both sides)
 * and lines placed half a point off each median — no real price is in the repo (the repo is public).
 *   1. a game page's section (NbaPropLines, the per-player table) stays within PER_ROW_MAX bytes of HTML per row and
 *      SECTION_FIXED + rows × PER_ROW_MAX in total;
 *   2. the slate section on /nba/projections (NbaSlatePropLines, through the real view) has NO per-player row — one
 *      compact summary per game — and stays within SLATE_SECTION_MAX bytes;
 *   3. its summaries link each game's full table by the hub's rule (Theater page → settled page → no link).
 * Run: npx tsx --test src/components/odds/prop-line-weight.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React; // TeamLogo compiles with the classic JSX runtime under tsx

import { MARKET_KEYS } from "../../lib/sports/nba/line-comparison.mjs";
import { nbaPropLinesHref } from "../nba/game-page-link.mjs";

const APP = process.cwd();
const DATE = "2026-10-29";
const LANE = JSON.parse(fs.readFileSync(path.join(APP, `public/data/nba/experimental-public/${DATE}.json`), "utf8"));
const { default: NbaPropLines, NbaSlatePropLines } = await import("../nba/nba-prop-lines.tsx");
const { default: View } = await import("../nba/projections-view.tsx");

/** Targets (bytes of server HTML; the RSC payload roughly doubles them). Measured 2026-10-29 on this fixture: ~1,265 B
    per row before the compact markup, 410–420 B after (of which ~320 B is the ten role="cell" cells + the row's data
    attributes — the floor while each cell keeps its explicit ARIA role — and ~110 B the row's own text). */
const PER_ROW_MAX = 430; // average per row, worst-case fixture (every combo family: "Points + rebounds + assists")
const MARKUP_MAX = 340; // per row, tags and attributes only (content-independent)
const ROW_MAX = 520; // any single row (long names, missing-price dashes)
const SECTION_FIXED = 16_000; // heading, coverage line, CSS (once), header row, state notes, legend, notes
const SLATE_SECTION_MAX = 6_000; // the whole /nba/projections section for a 3-game slate

const ON = { public: true };
const firstTip = Math.min(...LANE.games.map((g) => Date.parse(g.tipUtc)));
const AS_OF = new Date(firstTip - 3600_000).toISOString();
const CAPTURED = new Date(firstTip - 2 * 3600_000).toISOString();
const median = (p, f) => p.medians?.[f] ?? p.comboMedians?.[f];
let flip = 0;
/** SYNTHETIC: every lane player × every family with a median → one fake record. */
const RECORDS = LANE.games.flatMap((g) => [...g.players.away, ...g.players.home].flatMap((p) => Object.entries(MARKET_KEYS).flatMap(([family, marketKey]) => {
  const m = median(p, family);
  if (typeof m !== "number" || !Number.isFinite(m)) return [];
  const line = Math.max(0.5, Math.round(m) + (flip++ % 2 ? 0.5 : -0.5));
  return [{ schema: "gtp.nba.prop-price@1", eventId: String(g.providerEventId), providerAthleteId: String(p.providerAthleteId), family, providerMarketKey: marketKey, line, book: "fixturebook", overAmerican: -111, underAmerican: -111, capturedAt: CAPTURED }];
})));
const bytes = (s) => Buffer.byteLength(s, "utf8");
const rowsOf = (html) => html.split(/(?=<div role="row" data-prop-line=")/).slice(1).map((r) => r.slice(0, r.indexOf("</div></div>") + 12));

test("fixture: a synthetic record for every lane player × family (the worst case)", () => {
  assert.equal(LANE.date, DATE);
  const players = LANE.games.reduce((n, g) => n + g.players.away.length + g.players.home.length, 0);
  assert.ok(RECORDS.length >= players * 6, `${RECORDS.length} records for ${players} players`);
  assert.deepEqual(new Set(RECORDS.map((r) => r.family)), new Set(Object.keys(MARKET_KEYS)), "every family");
  for (const r of RECORDS) assert.equal(r.book, "fixturebook");
});

test("game page section (the per-player table): per-row and total HTML bytes within the targets", () => {
  const report = [];
  for (const g of LANE.games) {
    const id = String(g.providerEventId);
    const html = renderToStaticMarkup(React.createElement(NbaPropLines, { lane: LANE, eventId: id, asOf: AS_OF, priceRecords: RECORDS, display: ON, id: "nba-game-prop-lines" }));
    const rows = rowsOf(html);
    const expected = RECORDS.filter((r) => r.eventId === id).length;
    assert.equal(rows.length, expected, `${id}: one row per line`);
    assert.ok(rows.some((r) => /data-prop-line="COMPARED"/.test(r)) && rows.some((r) => /data-prop-line="DIRECTION_WITHHELD"/.test(r)), "compared and withheld rows both measured");
    const rowBytes = rows.map(bytes);
    const avg = rowBytes.reduce((a, b) => a + b, 0) / rows.length;
    report.push(`${id}: ${rows.length} rows · avg ${avg.toFixed(0)} B/row · max ${Math.max(...rowBytes)} B · section ${bytes(html)} B`);
    assert.ok(avg <= PER_ROW_MAX, `${id}: ${avg.toFixed(0)} B per row > ${PER_ROW_MAX}`);
    const markup = Math.max(...rows.map((r) => bytes(r) - bytes(r.replace(/<[^>]+>/g, ""))));
    assert.ok(markup <= MARKUP_MAX, `${id}: ${markup} B of markup in a row > ${MARKUP_MAX}`);
    assert.ok(Math.max(...rowBytes) <= ROW_MAX, `${id}: a row of ${Math.max(...rowBytes)} B > ${ROW_MAX}`);
    assert.ok(bytes(html) <= SECTION_FIXED + rows.length * PER_ROW_MAX, `${id}: section ${bytes(html)} B`);
    // no per-row prose, label or inline style: the labels live once in the header / CSS, the state sentences once below
    for (const r of rows) {
      assert.doesNotMatch(r, /style=|class=|Model|Difference|Direction|calibration standard|Quoted/, "a row carries data only");
    }
    assert.equal((html.match(/calibration standard/g) ?? []).length, 2, "the withheld sentence once in the state notes, once in the legend");
  }
  console.log(report.join("\n"));
});

test("/nba/projections slate section: one compact summary per game, NO per-player row, within the slate budget", () => {
  const page = renderToStaticMarkup(React.createElement(View, { lane: LANE, role: "past", date: DATE, dated: true, asOf: AS_OF, priceRecords: RECORDS, lineDisplay: ON }));
  const at = page.indexOf('<section id="nba-prop-lines"');
  assert.ok(at > 0, "the section keeps the id the hub and /today link as a fallback");
  const section = page.slice(at, page.indexOf("</section>", at) + 10);
  assert.doesNotMatch(section, /role="row"|role="table"|data-prop-line="|<style/, "no per-player rows, no table CSS");
  assert.equal((section.match(/data-prop-line-summary="nba"/g) ?? []).length, LANE.games.length, "one summary per game");
  const projections = RECORDS.length; // every median on the lane has a record here
  assert.match(section.replace(/<!-- -->/g, ""), new RegExp(`of ${projections} projections have a qualified sportsbook line\\.`), "true-denominator coverage for the slate");
  for (const g of LANE.games) assert.match(section, new RegExp(`${g.away.abbr} @ ${g.home.abbr}:`), "each summary names its game");
  assert.doesNotMatch(section, /href=/, "default: no game page known → no link (never a dead one)");
  console.log(`slate section: ${bytes(section)} B for ${LANE.games.length} games / ${RECORDS.length} lines (page ${bytes(page)} B)`);
  assert.ok(bytes(section) <= SLATE_SECTION_MAX, `slate section ${bytes(section)} B > ${SLATE_SECTION_MAX}`);
});

test("slate summaries link the game's full table by the hub's rule: Theater page, else settled page, else nothing", () => {
  const [a, b, c] = LANE.games.map((g) => String(g.providerEventId));
  const links = { current: [a], pages: [a, b] };
  assert.equal(nbaPropLinesHref(a, links.current, links.pages), `/nba/simulation/${a}/#nba-game-prop-lines`);
  assert.equal(nbaPropLinesHref(b, links.current, links.pages), `/nba/simulation/${b}/#nba-settled-prop-lines`);
  assert.equal(nbaPropLinesHref(c, links.current, links.pages), null);
  assert.equal(nbaPropLinesHref(a, [], []), null, "flag-OFF build: no page, no link");
  const page = renderToStaticMarkup(React.createElement(View, { lane: LANE, role: "past", date: DATE, dated: true, asOf: AS_OF, priceRecords: RECORDS, lineDisplay: ON, gameLinks: links }));
  const section = page.slice(page.indexOf('<section id="nba-prop-lines"'));
  assert.match(section, new RegExp(`href="/nba/simulation/${a}/?#nba-game-prop-lines"`));
  assert.match(section, new RegExp(`href="/nba/simulation/${b}/?#nba-settled-prop-lines"`));
  assert.doesNotMatch(section, new RegExp(`/nba/simulation/${c}`));
  // the slate section, rendered on its own, is the same component the view mounts
  const alone = renderToStaticMarkup(React.createElement(NbaSlatePropLines, { lane: LANE, asOf: AS_OF, priceRecords: RECORDS, display: ON, hrefOf: (id) => nbaPropLinesHref(id, links.current, links.pages) }));
  assert.ok(section.startsWith(alone), "the view mounts NbaSlatePropLines as is");
});

test("switch off / no artifact: the slate section renders nothing (the page is byte-identical: prop-line-switch-off.test.mjs)", () => {
  assert.equal(renderToStaticMarkup(React.createElement(NbaSlatePropLines, { lane: LANE, asOf: AS_OF, priceRecords: RECORDS, display: { public: false } })), "");
  assert.equal(renderToStaticMarkup(React.createElement(NbaSlatePropLines, { lane: LANE, asOf: AS_OF, display: ON })), "", "no artifact readable here (no key)");
  let read = 0;
  assert.equal(renderToStaticMarkup(React.createElement(NbaSlatePropLines, { lane: () => { read++; return LANE; }, asOf: AS_OF, priceRecords: RECORDS, display: { public: false } })), "");
  assert.equal(read, 0, "nothing is read while off");
});
