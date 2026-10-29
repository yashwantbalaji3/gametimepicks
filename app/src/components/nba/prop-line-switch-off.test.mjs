/**
 * NBA model-vs-line display, SWITCH OFF (Production state; founder P0 2026-10-29):
 *   1. NBA_LINE_DISPLAY.public is false, and with it off /nba/projections renders byte-identically whether or not price
 *      records are handed in — no line, price, book or OVER/UNDER text, no legend, no section;
 *   2. NbaPropLines reads nothing while off (the lane resolver is never called);
 *   3. no line / price / prop-view module and no synthetic fixture is reachable from any client bundle root
 *      ("use client" modules + the site-wide layout) — a client-reachable constant once leaked a private id in a
 *      flag-OFF build — and no shipped module imports the synthetic fixture at all.
 * Run: npx tsx --test src/components/nba/prop-line-switch-off.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React; // TeamLogo compiles with the classic JSX runtime under tsx (as projection-board-dates-status.test.mjs)

import { NBA_LINE_DISPLAY } from "../../lib/sports/nba/line-board.mjs";
import { FIXTURE_LANE, FIXTURE_PRICE_RECORDS, FIXTURE_AS_OF } from "../../lib/odds/__fixtures__/prop-line-synthetic.mjs";

const APP = process.cwd();
const SRC = path.join(APP, "src");
const LANE_TEXT = fs.readFileSync(path.join(APP, "public/data/nba/experimental-public/2026-10-27.json"), "utf8");
const { default: View } = await import("./projections-view.tsx");
const { default: NbaPropLines } = await import("./nba-prop-lines.tsx");
const render = (props) => renderToStaticMarkup(React.createElement(View, { lane: JSON.parse(LANE_TEXT), role: "past", date: "2026-10-27", dated: true, ...props }));
// Records shaped for THIS lane (synthetic values), so a leak would have something real-looking to print.
const lane = JSON.parse(LANE_TEXT);
const g0 = lane.games[0], p0 = g0.players.home[0];
const LANE_RECORDS = [{ schema: "gtp.nba.prop-price@1", eventId: String(g0.providerEventId), providerAthleteId: String(p0.providerAthleteId), family: "pts", providerMarketKey: "player_points", line: 3.5, book: "fixturebook", overAmerican: -137, underAmerican: 117, capturedAt: new Date(Date.parse(g0.tipUtc) - 3600_000).toISOString() }];
const AS_OF = new Date(Date.parse(g0.tipUtc) - 1800_000).toISOString();

test("the switch is off in this commit (Production state)", () => {
  assert.deepEqual([NBA_LINE_DISPLAY.public, NBA_LINE_DISPLAY.social], [false, false]);
});

test("switch off: /nba/projections HTML is identical with or without price records, and carries no line/price/book/OVER/UNDER", () => {
  const base = render({});
  assert.ok(base.length > 10_000 && /<tbody/.test(base), "the board rendered");
  const withRecords = render({ asOf: AS_OF, priceRecords: LANE_RECORDS });
  const explicitOff = render({ asOf: AS_OF, priceRecords: LANE_RECORDS, lineDisplay: { public: false } });
  assert.equal(withRecords, base);
  assert.equal(explicitOff, base);
  assert.doesNotMatch(base, /fixturebook|Fixturebook|sportsbook line|data-prop-line|\bOVER\b|\bUNDER\b|NEUTRAL|−137|\+117|Quoted/);
  // and the authorized render DOES differ, so the comparison above is not vacuous
  const on = render({ asOf: AS_OF, priceRecords: LANE_RECORDS, lineDisplay: { public: true } });
  assert.notEqual(on, base);
  assert.match(on, /Model vs\. sportsbook line/);
  const onText = on.replace(/<!-- -->/g, "");
  assert.match(onText, /class="plc-c plc-book">Fixturebook<\/div>/);
  assert.match(onText, /class="plc-c plc-over plc-n"><span class="plc-li">Over <\/span>\u2212137<\/div>/);
  assert.match(onText, /class="plc-c plc-under plc-n"><span class="plc-li">Under <\/span>\+117<\/div>/);
});

test("NbaPropLines off: renders nothing and never calls the lane resolver; on without a source: 'Unavailable', never a line", () => {
  let called = 0;
  const lazy = () => { called++; return FIXTURE_LANE; };
  assert.equal(renderToStaticMarkup(React.createElement(NbaPropLines, { lane: lazy, asOf: FIXTURE_AS_OF, priceRecords: FIXTURE_PRICE_RECORDS })), "");
  assert.equal(called, 0, "default display (the switch) is off: nothing is read");
  const on = renderToStaticMarkup(React.createElement(NbaPropLines, { lane: lazy, asOf: FIXTURE_AS_OF, display: { public: true } }));
  assert.equal(called, 1);
  assert.match(on, /data-prop-line-section-state="PROVIDER_UNAVAILABLE"[^>]*>Sportsbook lines: Unavailable/);
  assert.doesNotMatch(on, /role="row"|<li/);
  const one = renderToStaticMarkup(React.createElement(NbaPropLines, { lane: FIXTURE_LANE, eventId: "FIXTURE-EVT-1", asOf: FIXTURE_AS_OF, priceRecords: FIXTURE_PRICE_RECORDS, display: { public: true } }));
  assert.match(one.replace(/<!-- -->/g, ""), /3 of 28 projections have a qualified sportsbook line\.<\/span> Not compared: 1 line stale · 1 market not supported\./, "true denominator: every projection on the game");
  assert.equal(renderToStaticMarkup(React.createElement(NbaPropLines, { lane: FIXTURE_LANE, eventId: "NOT-ON-THIS-LANE", asOf: FIXTURE_AS_OF, priceRecords: FIXTURE_PRICE_RECORDS, display: { public: true } })), "", "a game page whose game is not on the lane shows no section");
});

test("every wired surface passes through the gate: projections (+ dated), the game page's Official Forecast panel and the settled game page", () => {
  const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
  assert.match(read("components/nba/projections-view.tsx"), /<NbaPropLines lane=\{live\} asOf=\{asOf\} display=\{lineDisplay\} priceRecords=\{priceRecords\} \/>/);
  for (const p of ["app/nba/projections/page.tsx", "app/nba/projections/[date]/page.tsx"]) assert.match(read(p), /asOf=\{now\.toISOString\(\)\}/, p);
  assert.match(read("components/nba/official-predictions.tsx"), /\{official \? <NbaPropLines eventId=\{official\.eventId\} id="nba-game-prop-lines" \/> : null\}/);
  assert.match(read("components/nba/settled-simulation.tsx"), /<NbaPropLines lane=\{\{ date: view\.date, games: \[g\] \}\} eventId=\{view\.id\} id="nba-settled-prop-lines" \/>/);
  assert.doesNotMatch(read("app/nba/simulation/[eventId]/page.tsx"), /NbaPropLines|prop-line/, "the Theater route's static imports stay the gate only (public-theater-route.test.mjs)");
  assert.match(read("components/nba/nba-prop-lines.tsx"), /if \(!display\.public\) return null;\n  const src =/, "the gate is the first statement — nothing is read before it");
});

test("published-artifact source: the section reads nbaPublicLineRecords (the gated build-time reader), which is null while authorization is off", async () => {
  const src = fs.readFileSync(path.join(SRC, "components/nba/nba-prop-lines.tsx"), "utf8");
  assert.match(src, /const published = priceRecords \?\? \(snap\.date \? nbaPublicLineRecords\(snap\.date\) : null\);/, "omitted/null priceRecords → the published artifact");
  assert.ok(src.indexOf("if (!display.public) return null;") < src.indexOf("nbaPublicLineRecords(snap.date)"), "nothing is read before the gate");
  const { nbaPublicLineRecords } = await import("../../lib/sports/nba/public-line-records.mjs");
  const { committedLaneDates } = await import("./experimental-lane.tsx");
  for (const d of committedLaneDates()) assert.equal(nbaPublicLineRecords(d), null, `${d}: authorization off → no records, whatever exists on disk`);
  // switch forced on for the render while the record is off: the reader still refuses → "Unavailable", never a line
  const on = renderToStaticMarkup(React.createElement(NbaPropLines, { lane: JSON.parse(LANE_TEXT), asOf: AS_OF, display: { public: true } }));
  assert.match(on, /Sportsbook lines: Unavailable/);
  assert.doesNotMatch(on, /data-prop-line-notes|availability varies/);
});

test("switch off: the settled game page and the Official Forecast panel render exactly as without the section", async () => {
  const { default: Settled } = await import("./settled-simulation.tsx");
  const { loadSettledSimulation } = await import("./settled-simulation-data.ts");
  const view = loadSettledSimulation("401909868", "2026-10-28");
  assert.ok(view, "a committed settled game");
  const html = renderToStaticMarkup(React.createElement(Settled, { view }));
  assert.doesNotMatch(html, /prop-lines|sportsbook line|\bOVER\b|\bUNDER\b|NEUTRAL|Quoted/);
  // the same game WITH the switch on reaches the section (so the check above is not vacuous)
  const on = renderToStaticMarkup(React.createElement(NbaPropLines, { lane: { date: view.date, games: [view.game] }, eventId: view.id, display: { public: true } }));
  assert.match(on, /Sportsbook lines: Unavailable/);
});

// ── client bundle graph ─────────────────────────────────────────────────────────────────────────────────────────────
const exts = [".ts", ".tsx", ".mjs", ".js", ".jsx", ".cjs"];
const isCode = (f) => /\.(tsx?|mjs|js|cjs|jsx)$/.test(f);
const read = (f) => fs.readFileSync(f, "utf8");
const resolve = (from, spec) => {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, ...exts.map((e) => base + e), ...exts.map((e) => path.join(base, "index" + e))]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
const walkFiles = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walkFiles(p, out); continue; }
    if (isCode(p) && !/\.test\./.test(p)) out.push(p);
  }
  return out;
};
const isClient = (f) => /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(read(f));
const rel = (f) => path.relative(APP, f).split(path.sep).join("/");
function graph(root) {
  const parent = new Map([[root, null]]), stack = [root];
  while (stack.length) {
    const f = stack.pop();
    for (const m of read(f).replace(/^import type [^;]+;$/gm, "").matchAll(IMPORT_RE)) {
      const r = resolve(f, m[1]);
      if (r && isCode(r) && !parent.has(r)) { parent.set(r, f); stack.push(r); }
    }
  }
  return parent;
}
/** Line, price and prop-view modules plus the synthetic fixtures: server-only, never in a browser bundle. */
const FORBIDDEN = [
  /^src\/lib\/odds\//, /^src\/components\/odds\//, /__fixtures__\/prop-line-synthetic/,
  /^src\/lib\/sports\/nba\/(line-comparison|line-board|prop-line-adapter|line-publication|line-publication-build|public-line-records)\.mjs$/, /^src\/components\/nba\/(nba-prop-lines|nba-prop-line-summaries|line-comparison-cell)\.tsx$/,
  // the NBA price capture / parse / identity modules (contract.mjs is the shared market-key list the slip already uses)
  /^src\/lib\/sports\/odds\/nba-props\/(?!contract\.mjs$)/,
];

test("no line, price or prop-view module and no synthetic fixture is reachable from a client bundle root", () => {
  const roots = [...walkFiles(SRC).filter(isClient), path.join(SRC, "app", "layout.tsx")];
  assert.ok(roots.length > 20, `${roots.length} client roots`);
  const hits = [];
  for (const root of roots) {
    const g = graph(root);
    for (const f of g.keys()) if (FORBIDDEN.some((re) => re.test(rel(f)))) { const c = []; for (let x = f; x; x = g.get(x)) c.unshift(rel(x)); hits.push(c.join(" → ")); }
  }
  assert.deepEqual(hits, []);
  // positive control: the walker does reach the server module graph when started from the server view
  assert.ok([...graph(path.join(SRC, "components/nba/projections-view.tsx")).keys()].map(rel).includes("src/lib/odds/prop-line-view.mjs"));
});

test("no shipped module imports the synthetic fixture (tests only)", () => {
  const importers = walkFiles(SRC).filter((f) => !/__fixtures__/.test(f) && /prop-line-synthetic/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, "")));
  assert.deepEqual(importers.map(rel), []);
});
