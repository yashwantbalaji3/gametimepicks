/**
 * NBA model-vs-line display — SWITCH OFF and NO ARTIFACT (founder P0 2026-10-29; site display authorized 2026-10-29):
 *   1. committed state: NBA_LINE_DISPLAY.public is true (site), social false. With the switch off /nba/projections renders
 *      byte-identically whether or not price records are handed in — no line, price, book or OVER/UNDER text, no legend,
 *      no section — and with the switch ON but no readable artifact (no key, as in every CI build; another key; a
 *      historical date) it renders byte-identically to that switch-off page;
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

test("committed state: the site surface is on, the social surface is off (founder 2026-10-29)", () => {
  assert.deepEqual([NBA_LINE_DISPLAY.public, NBA_LINE_DISPLAY.social, NBA_LINE_DISPLAY.socialPrices], [true, false, false]);
});

test("switch off: /nba/projections HTML is identical with or without price records, and carries no line/price/book/OVER/UNDER; switch on with no artifact: the same bytes", () => {
  const base = render({ lineDisplay: { public: false } });
  assert.ok(base.length > 10_000 && /<tbody/.test(base), "the board rendered");
  const explicitOff = render({ asOf: AS_OF, priceRecords: LANE_RECORDS, lineDisplay: { public: false } });
  assert.equal(explicitOff, base);
  // authorized (the committed switch), no artifact for this date / no key → byte-identical to the switch-off page
  assert.equal(render({}), base, "committed switch, no artifact");
  assert.equal(render({ asOf: AS_OF, lineDisplay: { public: true } }), base, "switch forced on, no artifact");
  assert.doesNotMatch(base, /fixturebook|Fixturebook|sportsbook line|data-prop-line|\bOVER\b|\bUNDER\b|NEUTRAL|−137|\+117|Quoted/);
  // and the authorized render DOES differ, so the comparison above is not vacuous
  const on = render({ asOf: AS_OF, priceRecords: LANE_RECORDS, lineDisplay: { public: true } });
  assert.notEqual(on, base);
  assert.match(on, /Model vs\. sportsbook line/);
  const onText = on.replace(/<!-- -->/g, "");
  // the slate page shows the compact per-game summary (page weight 2026-10-29); the per-player rows live on game pages
  const at = onText.indexOf('<section id="nba-prop-lines"');
  assert.ok(at > 0);
  const section = onText.slice(at, onText.indexOf("</section>", at));
  assert.match(section, /<p data-prop-line-summary="nba"[^>]*><span[^>]*>[A-Z]+ @ [A-Z]+:<\/span>/, "one summary, named by its game");
  assert.match(section, /1 of \d+ projections has a qualified sportsbook line\./, "true-denominator slate coverage");
  assert.doesNotMatch(section, /role="row"|data-prop-line="/, "no per-player row on the slate page");
});

test("NbaPropLines off: renders nothing and never calls the lane resolver; on without an artifact: nothing; on with an artifact holding no line: a no-lines state, never a line", () => {
  let called = 0;
  const lazy = () => { called++; return FIXTURE_LANE; };
  assert.equal(renderToStaticMarkup(React.createElement(NbaPropLines, { lane: lazy, asOf: FIXTURE_AS_OF, priceRecords: FIXTURE_PRICE_RECORDS, display: { public: false } })), "");
  assert.equal(called, 0, "switch off: nothing is read");
  const on = renderToStaticMarkup(React.createElement(NbaPropLines, { lane: lazy, asOf: FIXTURE_AS_OF, display: { public: true } }));
  assert.equal(called, 1);
  assert.equal(on, "", "no published artifact for the date → no section at all (not an 'Unavailable' block)");
  const empty = renderToStaticMarkup(React.createElement(NbaPropLines, { lane: FIXTURE_LANE, asOf: FIXTURE_AS_OF, priceRecords: [], display: { public: true } }));
  assert.match(empty, /data-prop-line-section-state="NO_LINES"[^>]*>0 of 28 projections have a qualified sportsbook line\./, "an artifact with no usable line for these projections says so");
  assert.doesNotMatch(empty, /role="row"|<li/);
  const one = renderToStaticMarkup(React.createElement(NbaPropLines, { lane: FIXTURE_LANE, eventId: "FIXTURE-EVT-1", asOf: FIXTURE_AS_OF, priceRecords: FIXTURE_PRICE_RECORDS, display: { public: true } }));
  assert.match(one.replace(/<!-- -->/g, ""), /3 of 28 projections have a qualified sportsbook line\.<\/span> Not compared: 1 line stale · 1 market not supported\./, "true denominator: every projection on the game");
  assert.equal(renderToStaticMarkup(React.createElement(NbaPropLines, { lane: FIXTURE_LANE, eventId: "NOT-ON-THIS-LANE", asOf: FIXTURE_AS_OF, priceRecords: FIXTURE_PRICE_RECORDS, display: { public: true } })), "", "a game page whose game is not on the lane shows no section");
});

test("every wired surface passes through the gate: projections (+ dated), the game page's Official Forecast panel and the settled game page", () => {
  const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
  // projections (+ dated): the slate section — the same gate and source, a per-game summary linking each game page
  assert.match(read("components/nba/projections-view.tsx"), /<NbaSlatePropLines lane=\{live\} asOf=\{asOf\} display=\{lineDisplay\} priceRecords=\{priceRecords\} hrefOf=\{\(id\) => nbaPropLinesHref\(id, gameLinks\.current, gameLinks\.pages\)\} \/>/);
  assert.doesNotMatch(read("components/nba/projections-view.tsx"), /<NbaPropLines\b/, "never the whole slate's per-player table");
  for (const p of ["app/nba/projections/page.tsx", "app/nba/projections/[date]/page.tsx"]) {
    assert.match(read(p), /asOf=\{now\.toISOString\(\)\} gameLinks=\{await nbaLineSummaryGameLinks\(currentEtDate\(now\)\)\}/, p);
  }
  // the link ids: the hub's inline-literal Theater gate (dynamic loader import inside it) + the exported game pages
  assert.match(read("components/nba/prop-line-game-links.ts"), /if \(process\.env\.GTP_NBA_THEATER_PUBLIC === "1"\) \{\s*const \{ publicPossessionEvents \} = await import\("@\/lib\/simulation-theater\/nba\/possession\/public-loader\.mjs"\);\s*theaterIds = publicTheaterRouteIds\(\(\) => publicPossessionEvents\(REPO_ROOT\)\);\s*\}\s*return \{ current: theaterIds, pages: nbaExportedGamePageIds\(today, theaterIds\) \};/);
  assert.match(read("components/nba/official-predictions.tsx"), /\{official \? <NbaPropLines eventId=\{official\.eventId\} id="nba-game-prop-lines" \/> : null\}/);
  assert.match(read("components/nba/settled-simulation.tsx"), /<NbaPropLines lane=\{\{ date: view\.date, games: \[g\] \}\} eventId=\{view\.id\} id="nba-settled-prop-lines" \/>/);
  assert.doesNotMatch(read("app/nba/simulation/[eventId]/page.tsx"), /NbaPropLines|prop-line/, "the Theater route's static imports stay the gate only (public-theater-route.test.mjs)");
  assert.match(read("components/nba/nba-prop-lines.tsx"), /if \(!display\.public\) return null;\n  const src =/, "the gate is the first statement — nothing is read before it");
  assert.match(read("components/nba/nba-prop-lines.tsx"), /export function NbaSlatePropLines\([\s\S]*?\}\) \{\n  if \(!display\.public\) return null;\n  const snap =/, "slate section: the gate is the first statement");
});

test("every committed lane: the authorized (committed) switch with no artifact renders /nba/projections byte-identically to the switch-off render", async () => {
  const { committedLaneDates, loadLaneForDate } = await import("./experimental-lane.tsx");
  const dates = committedLaneDates();
  assert.ok(dates.length > 0);
  for (const d of dates) {
    const l = loadLaneForDate(d);
    if (!l) continue;
    const props = { lane: l, role: "past", date: d, dated: true };
    const off = renderToStaticMarkup(React.createElement(View, { ...props, lineDisplay: { public: false } }));
    assert.equal(renderToStaticMarkup(React.createElement(View, props)), off, d);
  }
});

test("published-artifact source: the section reads nbaPublicLineRecords (the gated build-time reader), which is null for every committed lane without the display key", async () => {
  const src = fs.readFileSync(path.join(SRC, "components/nba/nba-prop-lines.tsx"), "utf8");
  assert.match(src, /const published = priceRecords \?\? \(snap\.date \? nbaPublicLineRecords\(snap\.date\) : null\);/, "omitted/null priceRecords → the published artifact");
  assert.ok(src.indexOf("if (!display.public) return null;") < src.indexOf("nbaPublicLineRecords(snap.date)"), "nothing is read before the gate");
  const { nbaPublicLineRecords } = await import("../../lib/sports/nba/public-line-records.mjs");
  const { committedLaneDates } = await import("./experimental-lane.tsx");
  const NO_KEY = { ...process.env, GTP_ODDS_DISPLAY_KEY: "" };
  for (const d of committedLaneDates()) assert.equal(nbaPublicLineRecords(d, { env: NO_KEY }), null, `${d}: no display key → no records, whatever exists on disk`);
  for (const d of committedLaneDates()) assert.equal(nbaPublicLineRecords(d), null, `${d}: this environment has no readable artifact`);
  // the section with the switch on and no artifact renders nothing — never "Unavailable", never a line
  const on = renderToStaticMarkup(React.createElement(NbaPropLines, { lane: JSON.parse(LANE_TEXT), asOf: AS_OF, display: { public: true } }));
  assert.equal(on, "");
});

test("committed switch, no artifact: the settled game page and the Official Forecast panel render exactly as without the section", async () => {
  const { default: Settled } = await import("./settled-simulation.tsx");
  const { loadSettledSimulation } = await import("./settled-simulation-data.ts");
  const view = loadSettledSimulation("401909868", "2026-10-28");
  assert.ok(view, "a committed settled game");
  const html = renderToStaticMarkup(React.createElement(Settled, { view }));
  assert.doesNotMatch(html, /prop-lines|sportsbook line|\bOVER\b|\bUNDER\b|NEUTRAL|Quoted/);
  // the same game WITH records reaches the section (so the check above is not vacuous: the gate, not a missing game, hides it)
  const on = renderToStaticMarkup(React.createElement(NbaPropLines, { lane: { date: view.date, games: [view.game] }, eventId: view.id, priceRecords: [], display: { public: true } }));
  assert.match(on, /data-prop-line-section-state="NO_LINES"/);
  assert.equal(renderToStaticMarkup(React.createElement(NbaPropLines, { lane: { date: view.date, games: [view.game] }, eventId: view.id, display: { public: true } })), "", "no artifact → nothing");
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
  /^src\/lib\/sports\/nba\/(line-comparison|line-board|prop-line-adapter|line-publication|line-publication-build|public-line-records)\.mjs$/, /^src\/components\/nba\/(nba-prop-lines|nba-prop-line-summaries|line-comparison-cell)\.tsx$/, /^src\/components\/nba\/prop-line-game-links\.ts$/,
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
