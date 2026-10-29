/* Sport-agnostic prop-line section: rendered states on SYNTHETIC fixtures (founder P0 2026-10-29 + UI requirements).
   Run: npx tsx --test src/components/odds/prop-line-comparison.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPropLineViews, DIRECTION_WITHHELD_TEXT } from "../../lib/odds/prop-line-view.mjs";
import { NBA_PROP_LINE_ADAPTER } from "../../lib/sports/nba/prop-line-adapter.mjs";
import { FIXTURE_STATE_INPUTS as S } from "../../lib/odds/__fixtures__/prop-line-synthetic.mjs";

const { default: PropLineComparison, PropLineRow, PropLineLegend, PropLineSummary } = await import("./prop-line-comparison.tsx");
const ON = { public: true }, OFF = { public: false };
/* The section renders whatever the view decided. These tests render rows as a QUALIFIED family would (a test gate that
   shows every direction); the withheld state has its own test below with the fail-closed default. */
const QUALIFIED = { scope: "public", shows: () => true };
const view = (keys, opts) => buildPropLineViews(keys.map((k) => S[k]), NBA_PROP_LINE_ADAPTER, { directions: QUALIFIED, ...opts });
const withheldView = (keys, opts) => buildPropLineViews(keys.map((k) => S[k]), NBA_PROP_LINE_ADAPTER, opts);
const r = (el) => renderToStaticMarkup(el);
const row = (k) => r(React.createElement(PropLineRow, { row: view([k]).rows[0] }));
const dec = (s) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
/** What a sighted reader sees (sr-only text and the <style> block removed). */
const visible = (html) => dec(html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<span class="sr-only">[\s\S]*?<\/span>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
/** Cell text by class (first match). */
const cell = (html, cls) => { const m = html.match(new RegExp(`class="plc-c [^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</div>`)); return m ? visible(m[1]) : null; };
const ALL = Object.keys(S);

test("switch off: the section, the legend and the summary render nothing at all", () => {
  assert.equal(r(React.createElement(PropLineComparison, { view: view(ALL, { projections: 40 }), display: OFF })), "");
  assert.equal(r(React.createElement(PropLineLegend, { legend: view(["over"]).legend, display: OFF })), "");
  assert.equal(r(React.createElement(PropLineSummary, { view: view(ALL, { projections: 40 }), display: OFF, href: "/x/" })), "");
});

test("OVER row: PLAYER | MARKET | MODEL | BOOK LINE | DIRECTION | DIFFERENCE, then SPORTSBOOK | OVER | UNDER | QUOTED (ET)", () => {
  const h = row("over");
  assert.deepEqual(
    ["plc-player", "plc-market", "plc-model", "plc-line", "plc-dir", "plc-diff", "plc-book", "plc-over", "plc-under", "plc-quoted"].map((c) => cell(h, c)),
    ["Fixture Player One · AWY", "Points", "Model 36.0", "Line 29.5", "Direction ▲ OVER", "Difference +6.5", "Fixturebook", "Over −115", "Under −105", "Quoted Jan 15, 4:30 PM ET"],
  );
  assert.match(h, /data-prop-line-side="OVER" style="color:var\(--vault-success\);border:1px solid var\(--vault-success\)"/);
  assert.match(h, /<span aria-hidden="true">▲<\/span> OVER/, "word + shape + colour; the shape is decorative to a screen reader");
  assert.match(h, /role="row" class="plc-r" data-prop-line="COMPARED"/);
});

test("UNDER red ▼ with a missing Under price as '—' (never 0); NEUTRAL grey = with an unsigned 0.0", () => {
  const u = row("under");
  assert.deepEqual([cell(u, "plc-dir"), cell(u, "plc-diff"), cell(u, "plc-under")], ["Direction ▼ UNDER", "Difference −2.3", "Under —"]);
  assert.match(u, /var\(--vault-danger\)/);
  assert.match(u, /<span class="sr-only">Under price not posted<\/span>/);
  const n = row("neutral");
  assert.deepEqual([cell(n, "plc-dir"), cell(n, "plc-diff")], ["Direction = NEUTRAL", "Difference 0.0"]);
  assert.match(n, /data-prop-line-side="NEUTRAL" style="color:var\(--vault-text-mute\)/);
  assert.doesNotMatch(n, /vault-(success|danger)/);
  const z = row("zeroPrice");
  assert.deepEqual([cell(z, "plc-over"), cell(z, "plc-under")], ["Over —", "Under —"]);
});

test("rounding edge: +0.0 stays OVER (green ▲) and −0.0 stays UNDER (red ▼) — never NEUTRAL", () => {
  const o = row("tinyOver"), u = row("tinyUnder");
  assert.deepEqual([cell(o, "plc-dir"), cell(o, "plc-diff")], ["Direction ▲ OVER", "Difference +0.0"]);
  assert.deepEqual([cell(u, "plc-dir"), cell(u, "plc-diff")], ["Direction ▼ UNDER", "Difference −0.0"]);
  assert.match(o, /data-prop-line-diff="">\+0\.0/);
  assert.doesNotMatch(o + u, /NEUTRAL/);
});

test("states: plain label + one sentence, NO direction badge, no difference, no colour; reason code only as a data attribute", () => {
  const cases = {
    stale: ["Line stale", "STALE", /This sportsbook line is more than 6 hours old, so it is not compared\./],
    afterTip: ["Captured after cutoff", "CAPTURED_AFTER_TIP", /captured after the game started, so it is not compared\./],
    unmatched: ["Line not matched", "UNMATCHED", /^Line could not be matched to this player and game\.$/],
    wrongDay: ["Line not matched", "WRONG_DAY", /^Line could not be matched to this player and game\.$/],
    noLine: ["Line unavailable", "NO_LINE", /No sportsbook line was found for this player and market\./],
    unsupported: ["Market not supported", "UNSUPPORTED_MARKET", /measures something our model does not project/],
    mismatch: ["Market not supported", "MARKET_MISMATCH", /measures something our model does not project/],
    suspended: ["Market suspended", "SUSPENDED", /suspended this market/],
  };
  for (const [k, [label, code, why]] of Object.entries(cases)) {
    const h = row(k);
    assert.equal(cell(h, "plc-dir"), `Status ${label}`, k);
    assert.match(cell(h, "plc-why"), why, k);
    assert.match(h, new RegExp(`data-prop-line-reason="${code}"`), k);
    assert.doesNotMatch(visible(h), new RegExp(code.replace("_", "[ _]")), `${k}: the code is not reader copy`);
    assert.doesNotMatch(visible(h), /\bOVER\b|\bUNDER\b|NEUTRAL|[▲▼]/, k);
    assert.doesNotMatch(h, /data-prop-line-diff|plc-b"|vault-(success|danger)/, k);
    assert.doesNotMatch(cell(h, "plc-model"), /^Model 0\.0$/, `${k}: never a false zero`);
  }
  // a stale / after-cutoff quote is still printed, muted, marked "not compared"; a mismatched line is never attributed
  assert.equal(cell(row("stale"), "plc-quoted"), "Quoted Jan 15, 10:30 AM ET · not compared");
  assert.equal(cell(row("stale"), "plc-line"), "Line 1.5");
  for (const k of ["unmatched", "wrongDay", "suspended", "unsupported", "noLine"]) {
    assert.doesNotMatch(row(k), /Fixturebook/, `${k}: no book attributed`);
    assert.equal(cell(row(k), "plc-line"), "Line —", `${k}: the line cell is a dash, never 0`);
    assert.match(row(k), /<span aria-hidden="true">—<\/span><span class="sr-only">no line<\/span>/);
  }
});

test("section: heading, 'N of M projections have a qualified sportsbook line' (true denominator), table semantics, legend, no ABOVE/BELOW", () => {
  const h = r(React.createElement(PropLineComparison, { view: view(ALL, { projections: 40 }), display: ON }));
  assert.match(h, /<h2[^>]*>Model vs\. sportsbook line<\/h2>/);
  assert.match(visible(h), /7 of 40 projections have a qualified sportsbook line\. Not compared: 1 line stale · 1 captured after cutoff · 2 line not matched · 1 line unavailable · 2 market not supported · 1 market suspended\./);
  assert.match(h, /role="table" aria-label="Model vs. sportsbook line"/);
  assert.match(visible(h), /Player Market Model Book line Direction Difference Sportsbook Over price Under price Quoted at \(ET\)/);
  assert.equal((h.match(/role="row" class="plc-r"/g) ?? []).length, ALL.length, "rows in input order, one each");
  assert.match(h, /data-prop-line-legend/);
  assert.match(visible(h), /It is a comparison, not a bet recommendation or a probability/);
  assert.doesNotMatch(h.replace(/data-[a-z-]+="[^"]*"/g, ""), /ABOVE|BELOW|\bEQUAL\b/);
  assert.doesNotMatch(visible(h), /\bedge\b|\block\b|best bet|\bvalue\b/i);
});

test("tooltips add context only — never a number", () => {
  const h = r(React.createElement(PropLineComparison, { view: view(ALL, { projections: 40 }), display: ON }));
  const titles = [...h.matchAll(/title="([^"]*)"/g)].map((m) => dec(m[1]));
  assert.ok(titles.length >= 4);
  assert.ok(titles.some((t) => /projection minus the sportsbook's line/.test(t)), "Difference is explained");
  for (const t of titles) assert.doesNotMatch(t, /\d/, t);
});

test("switch on, no verified line source (provider unavailable): one plain sentence, no table, no legend, no invented row", () => {
  const h = r(React.createElement(PropLineComparison, { view: null, display: ON }));
  assert.match(h, /data-prop-line-section-state="PROVIDER_UNAVAILABLE"[^>]*>Sportsbook lines: Unavailable\./);
  assert.doesNotMatch(h, /role="row"|data-prop-line-legend/);
  const none = r(React.createElement(PropLineComparison, { view: view([], { projections: 12 }), display: ON }));
  assert.match(none, /data-prop-line-section-state="NO_LINES"[^>]*>0 of 12 projections have a qualified sportsbook line\./);
});

test("compact summary: counts per direction (word + shape + colour) + coverage + link; nothing without a compared row", () => {
  const h = r(React.createElement(PropLineSummary, { view: view(["over", "under", "tinyOver", "stale"], { projections: 20 }), display: ON, href: "/nba/projections/#nba-prop-lines" }));
  assert.equal(visible(h), "Model vs. sportsbook line: ▲ 2 OVER ▼ 1 UNDER 3 of 20 projections have a qualified sportsbook line See the lines →");
  assert.match(h, /href="\/nba\/projections\/?#nba-prop-lines"/, "next/link drops the slash outside the trailingSlash build");
  assert.doesNotMatch(h, /NEUTRAL/, "a zero count is not printed");
  assert.equal(r(React.createElement(PropLineSummary, { view: view(["stale", "noLine"], { projections: 20 }), display: ON })), "", "no compared line → nothing");
  assert.equal(r(React.createElement(PropLineSummary, { view: null, display: ON })), "");
});

test("long player names wrap inside their cell (overflow-wrap) — layout never breaks", () => {
  const h = row("longName");
  assert.match(h, /class="plc-c plc-player">Fixturename Extraordinarily-Longhyphenated Player-Surname The Third/);
  const src = fs.readFileSync(path.join(process.cwd(), "src/components/odds/prop-line-comparison.tsx"), "utf8");
  assert.match(src, /\.plc-player\{grid-area:player;[^}]*overflow-wrap:anywhere/);
  assert.match(src, /\.plc-n\{font-variant-numeric:tabular-nums;text-align:right/, "numeric columns tabular + right-aligned");
});

test("design: tokens only (no literal colour, no fallback inside var()), text ≥ 12 px, cards below 560 px via container queries, server component", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/components/odds/prop-line-comparison.tsx"), "utf8");
  assert.doesNotMatch(src, /var\(--[a-z-]+\s*,/, "no fallback inside var()");
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-fA-F]{3,8}\b|rgba?\(/, "no literal colour");
  for (const m of src.matchAll(/fontSize:\s*(\d+)/g)) assert.ok(Number(m[1]) >= 12, `font ${m[1]}px`);
  for (const m of src.matchAll(/font-size:(\d+)px/g)) assert.ok(Number(m[1]) >= 12, `css font ${m[1]}px`);
  assert.match(src, /@container \(min-width:560px\)/);
  assert.match(src, /@container \(min-width:880px\)/);
  assert.doesNotMatch(src, /^"use client"/m, "server component");
});

test("direction withheld (family not qualified — the default): 'Comparison not shown', model and line visible, no badge, no colour, no difference", () => {
  for (const k of ["over", "under", "neutral", "tinyOver"]) {
    const h = r(React.createElement(PropLineRow, { row: withheldView([k]).rows[0] }));
    const compared = row(k);
    assert.equal(cell(h, "plc-model"), cell(compared, "plc-model"), `${k}: projection shown`);
    assert.equal(cell(h, "plc-line"), cell(compared, "plc-line"), `${k}: line shown`);
    assert.equal(cell(h, "plc-dir"), "Status Comparison not shown", k);
    assert.equal(cell(h, "plc-why"), DIRECTION_WITHHELD_TEXT, k);
    assert.equal(cell(h, "plc-book"), "Fixturebook");
    assert.doesNotMatch(cell(h, "plc-quoted"), /not compared/);
    assert.match(h, /data-prop-line="DIRECTION_WITHHELD"/);
    assert.doesNotMatch(visible(h), /\bOVER\b|\bUNDER\b|NEUTRAL|[▲▼=]|Difference/, `${k}: no direction word, shape or difference`);
    assert.doesNotMatch(h, /data-prop-line-diff|plc-b"|vault-(success|danger)|data-prop-line-side="(OVER|UNDER|NEUTRAL)"/, `${k}: no badge, no colour, no side attribute`);
  }
  const sec = r(React.createElement(PropLineComparison, { view: withheldView(["over", "under", "stale"], { projections: 10 }), display: ON }));
  assert.match(visible(sec), /2 of 10 projections have a qualified sportsbook line\. Not compared: 1 line stale\. Direction not shown: 2\./);
  assert.match(visible(sec), /Comparison not shown means the model and the sportsbook line are both shown without a direction/);
  assert.doesNotMatch(visible(sec), /OVER means|UNDER means|NEUTRAL means/, "no direction legend when no direction is shown");
  assert.doesNotMatch(sec, /vault-(success|danger)/);
  assert.equal(r(React.createElement(PropLineSummary, { view: withheldView(["over", "under"], { projections: 10 }), display: ON, href: "/x/" })), "", "the compact summary counts directions: nothing to show");
  assert.equal(r(React.createElement(PropLineComparison, { view: withheldView(["over"], { projections: 10 }), display: OFF })), "", "switch off: still nothing");
});
