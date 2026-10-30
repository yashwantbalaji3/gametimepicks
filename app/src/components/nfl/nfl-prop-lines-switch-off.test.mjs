/**
 * NFL model-vs-line display, SWITCH OFF and NO ARTIFACT (founder P0 2026-10-29; site display authorized 2026-10-29):
 *   1. committed state: NFL_LINE_DISPLAY.public is true (site), social false. With the switch off NflPropLines renders ""
 *      and reads nothing (the board loader is never called, the build-time reader is never reached);
 *   2. the page hook withNflPropLines returns the page's own node UNCHANGED while off AND while on without a readable
 *      artifact (no key — every CI build —, another key, no file for the game): no extra slot — an always-present null
 *      element would shift React useId values of later siblings (measured: the sampled-games tab ids moved R3c→R3d) — so
 *      the real NFL game page renders byte-identically to the switch-off render, with no line / price / OVER / UNDER
 *      markup. (Evidence 2026-10-29: all 14 week-8 game pages + 4 archived ones rendered byte-identical to the base commit.);
 *   3. switched on with offers, the section lists PUBLISHED families only — never passing / rushing yards — and anytime
 *      touchdown only as a yes/no price row (the encrypted-artifact path: components/odds/prop-line-authorized-render.test.mjs);
 *   4. no NFL line module is reachable from a client bundle root.
 * Run: npx tsx --test src/components/nfl/nfl-prop-lines-switch-off.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

import { NFL_LINE_DISPLAY } from "../../lib/sports/nfl/line-display.mjs";
import { FX_BOARD, FX_OFFERS, FX_AS_OF } from "../../lib/sports/nfl/__fixtures__/nfl-prop-line-synthetic.mjs";

const APP = process.cwd();
const SRC = path.join(APP, "src");
const { default: NflPropLines, publishedNflFamilies, withNflPropLines } = await import("./nfl-prop-lines.tsx");
const r = (props) => renderToStaticMarkup(React.createElement(NflPropLines, props)).replace(/<!-- -->/g, "");

test("committed state: the NFL site switch is on, social off (founder 2026-10-29)", () => {
  assert.deepEqual([NFL_LINE_DISPLAY.public, NFL_LINE_DISPLAY.social, NFL_LINE_DISPLAY.socialPrices], [true, false, false]);
});
const OFF = { public: false };

test("off: renders nothing and reads nothing, with or without offers", () => {
  let called = 0;
  const lazy = () => { called++; return FX_BOARD; };
  assert.equal(r({ board: lazy, offers: FX_OFFERS, asOf: FX_AS_OF, display: OFF }), "");
  assert.equal(r({ board: lazy, display: OFF }), "");
  assert.equal(called, 0, "switch off: the board is never loaded");
  // committed switch (on), no readable artifact (no key) → nothing either
  assert.equal(r({ board: lazy, asOf: FX_AS_OF }), "");
  assert.equal(called, 1);
  const src = fs.readFileSync(path.join(SRC, "components/nfl/nfl-prop-lines.tsx"), "utf8");
  assert.match(src, /\}\) \{\n  if \(!display\.public\) return null;\n  const b =/, "the gate is the first statement");
  assert.ok(src.indexOf("if (!display.public) return null;") < src.indexOf("nflPublicLineRecords(b.providerEventId)") && src.includes("nflPublicLineRecords(b.providerEventId)"));
});

test("on with offers: PUBLISHED families only; anytime TD is a yes/no row; passing / rushing yards never listed", () => {
  assert.deepEqual(publishedNflFamilies(FX_BOARD), ["receptions", "reception_yds", "anytime_td"]);
  // with the committed direction gate (no NFL family qualified): model and line, "Comparison not shown", no direction
  const pub = r({ board: FX_BOARD, offers: FX_OFFERS, asOf: FX_AS_OF, display: { public: true } });
  assert.match(pub, /3 of 6 projections have a qualified sportsbook line\./);
  assert.equal((pub.match(/data-prop-line="DIRECTION_WITHHELD"/g) ?? []).length, 3);
  // (the section's stylesheet defines the side colours once; no row, cell or legend line uses one)
  assert.doesNotMatch(pub.replace(/<style>[\s\S]*?<\/style>/, ""), /data-prop-line-side=|vault-(success|danger)/);
  assert.match(pub, /a direction is not shown for this statistic yet because its forecast has not met our calibration standard/);
  // as if every family were qualified (test gate)
  const on = r({ board: FX_BOARD, offers: FX_OFFERS, asOf: FX_AS_OF, display: { public: true }, directions: { scope: "public", shows: () => true } });
  assert.match(on, /3 of 6 projections have a qualified sportsbook line\./);
  assert.doesNotMatch(on, /Passing yards|Rushing yards|Official projection not published/);
  assert.match(on, /data-prop-line="YES_NO"[^]*?Not an over\/under market/);
  assert.match(on, /data-prop-line-yes="">Yes \+150</);
  assert.equal((on.match(/data-prop-line-side="OVER"/g) ?? []).length, 1);
  assert.match(on, /yes\/no market: the sportsbook&#x27;s Yes price is shown for reference/);
  // on without an artifact (the reader is null: no key) → NOTHING, never an "Unavailable" block
  assert.equal(r({ board: FX_BOARD, asOf: FX_AS_OF, display: { public: true } }), "");
  // an artifact that exists but holds no usable line for this game → the no-lines state, never a row
  const none = r({ board: FX_BOARD, offers: [], asOf: FX_AS_OF, display: { public: true } });
  assert.match(none, /data-prop-line-section-state="NO_LINES"/);
  assert.doesNotMatch(none, /role="row"/);
});

test("the NFL game page: the hook returns the slot unchanged while off or without an artifact, and the rendered page carries no line markup", async () => {
  const page = fs.readFileSync(path.join(SRC, "app/nfl/game/[eventId]/page.tsx"), "utf8");
  assert.match(page, /\{withNflPropLines\(view\?\.simulation \? \(\n        <section id="players"/, "wired once, around the players slot");
  assert.match(page, /\) : null, playerBoard\)\}/);
  assert.doesNotMatch(page, /<NflPropLines/, "never an always-present element on the page");
  const node = React.createElement("section", { id: "players" });
  assert.equal(withNflPropLines(node, FX_BOARD, OFF), node, "off: the very same node, so the element tree is unchanged");
  assert.equal(withNflPropLines(null, FX_BOARD, OFF), null);
  assert.equal(withNflPropLines(node, FX_BOARD), node, "committed switch, no artifact (no key): the very same node");
  assert.equal(withNflPropLines(null, FX_BOARD), null);
  const { default: Page } = await import("../../app/nfl/game/[eventId]/page.tsx");
  const forecasts = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/forecasts/latest.json"), "utf8")).forecasts ?? [];
  const ev = forecasts.map((f) => f.providerEventId).find((id) => fs.existsSync(path.join(APP, "public/data/nfl/player-board", `${id}.json`)));
  assert.ok(ev, "a committed game with a player board");
  const html = renderToStaticMarkup(React.createElement(Page, { params: { eventId: ev } }));
  assert.ok(html.length > 20_000, "the page rendered");
  assert.doesNotMatch(html, /data-prop-line|nfl-prop-lines|sportsbook line|Not an over\/under market|Official projection not published/);
  const board = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/player-board", `${ev}.json`), "utf8"));
  assert.equal(renderToStaticMarkup(React.createElement(NflPropLines, { board })), "", "the wired call, as the page makes it (no artifact), renders zero bytes");
  // with offers, the same board DOES produce the section (non-vacuous: the missing artifact, not the board, hides it)
  assert.match(renderToStaticMarkup(React.createElement(NflPropLines, { board, offers: [] })), /data-prop-lines="nfl"/);
});

// ── client bundle graph (the NBA walker's rule, for the NFL modules) ─────────────────────────────────────────────────
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
      const x = resolve(f, m[1]);
      if (x && isCode(x) && !parent.has(x)) { parent.set(x, f); stack.push(x); }
    }
  }
  return parent;
}
const FORBIDDEN = [
  /^src\/lib\/odds\//, /^src\/components\/odds\//, /__fixtures__\/nfl-prop-line-synthetic/,
  /^src\/lib\/sports\/nfl\/(prop-line-adapter|line-display|public-line-records|line-coverage)\.mjs$/, /^src\/components\/nfl\/nfl-prop-lines\.tsx$/,
];

test("no NFL line module and no NFL synthetic fixture is reachable from a client bundle root; no shipped module imports the fixture", () => {
  const roots = [...walkFiles(SRC).filter(isClient), path.join(SRC, "app", "layout.tsx")];
  const hits = [];
  for (const root of roots) {
    const g = graph(root);
    for (const f of g.keys()) if (FORBIDDEN.some((re) => re.test(rel(f)))) { const c = []; for (let x = f; x; x = g.get(x)) c.unshift(rel(x)); hits.push(c.join(" → ")); }
  }
  assert.deepEqual(hits, []);
  assert.ok([...graph(path.join(SRC, "app/nfl/game/[eventId]/page.tsx")).keys()].map(rel).includes("src/lib/sports/nfl/prop-line-adapter.mjs"), "positive control");
  const importers = walkFiles(SRC).filter((f) => !/__fixtures__/.test(f) && /nfl-prop-line-synthetic/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, "")));
  assert.deepEqual(importers.map(rel), []);
});
