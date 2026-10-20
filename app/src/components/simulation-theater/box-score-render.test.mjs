/**
 * Simulation Theater V2 · the projected box score renders exactly what box-score.mjs computed — server table and dialog —
 * with NOT_MODELED rows as words (never 0), the watermark, the provenance line and no raw ISO stamp in visible text.
 *
 * Run: npx tsx --test src/components/simulation-theater/box-score-render.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { BoxScoreStatic, BoxScoreForRun } = await import("./BoxScoreTable.tsx");
const { default: BoxScoreDialog } = await import("./BoxScorePanel.tsx");
const { loadTheater } = await import("../../lib/simulation-theater/loader.mjs");
const { defaultSample } = await import("../../lib/simulation-theater/public-theater.mjs");
const { theaterPalette } = await import("../../lib/simulation-theater/nfl-team-colors.mjs");
const { BOX_SCORE_WATERMARK, NOT_MODELED_TEXT, PLAYER_NOT_MODELED_REASON, nflBoxScore } = await import("../../lib/simulation-theater/box-score.mjs");

const REPO = path.resolve(process.cwd(), "..");
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z/;
const unescape = (s) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, "\"");
const visible = (html) => unescape(html.replace(/<[^>]+>/g, " "));
/** The text of the cell `<td data-stbx-side=side>` in the row `data-stbx-cat=id` of `html`. */
function cell(html, id, side) {
  const row = new RegExp(`<tr data-stbx-cat="${id}"[^>]*>([\\s\\S]*?)</tr>`).exec(html);
  assert.ok(row, `row ${id}`);
  const td = new RegExp(`<td[^>]*data-stbx-side="${side}"[^>]*>([\\s\\S]*?)</td>`).exec(row[1]);
  assert.ok(td, `cell ${id} ${side}`);
  return unescape(td[1].replace(/<[^>]+>/g, ""));
}

const t = loadTheater(REPO, "401873008");
const m = t.manifest;

test("server table: every number equals nflBoxScore for the default run; NOT_MODELED is words; watermark, provenance, ET stamp", () => {
  const s = defaultSample(m);
  const box = nflBoxScore(s, m);
  const html = renderToStaticMarkup(React.createElement(BoxScoreForRun, { manifest: m, sample: s }));
  assert.match(html, /data-stbx-static=""/);
  assert.match(html, /data-stbx-version="nfl-box-score@1"/);
  assert.ok(html.includes(BOX_SCORE_WATERMARK));
  assert.ok(visible(html).includes(box.header.scoreLine));
  assert.ok(visible(html).includes("SIMULATED FINAL"));
  for (const c of box.categories) {
    if (c.status === "NOT_MODELED") {
      assert.equal(cell(html, c.id, "both"), NOT_MODELED_TEXT, `${c.id}`);
      continue;
    }
    for (const side of ["away", "home"]) assert.equal(cell(html, c.id, side), c[side].display, `${c.id} ${side}`);
  }
  for (const p of box.players) {
    const li = new RegExp(`<li data-stbx-player="${p.id}"[^>]*>([\\s\\S]*?)</li>`).exec(html);
    assert.ok(li, p.id);
    const txt = visible(li[1]);
    assert.ok(txt.includes(NOT_MODELED_TEXT) && txt.includes(PLAYER_NOT_MODELED_REASON), `${p.id}: not modeled, with the reason`);
    assert.ok(!/\d/.test(txt), `${p.id}: no number at all`);
  }
  // period line
  for (const side of ["away", "home"]) {
    const row = new RegExp(`<tr data-stbx-period-side="${side}">([\\s\\S]*?)</tr>`).exec(html)[1];
    const nums = [...row.matchAll(/<td>(?:<b>)?(\d+)(?:<\/b>)?<\/td>/g)].map((x) => Number(x[1]));
    assert.deepEqual(nums, [...box.periods[side], box.periods.total[side]]);
  }
  assert.ok(visible(html).includes(box.provenance));
  assert.ok(!ISO.test(visible(html)), "no raw ISO-UTC stamp in visible text");
  assert.match(html, new RegExp(`<time dateTime="${m.generatedAt}" title="${m.generatedAt}">[A-Z][a-z]{2} \\d{1,2}, \\d{1,2}:\\d{2} [AP]M ET</time>`));
  assert.ok(!/\b[A-Z]{3,}(?:_[A-Z0-9]{2,})+\b/.test(visible(html)), "no internal state code in visible text");
});

test("the Overtime run renders its OT column", () => {
  const ot = m.samples.find((s) => s.kind === "OVERTIME");
  const html = renderToStaticMarkup(React.createElement(BoxScoreForRun, { manifest: m, sample: ot }));
  assert.match(html, /<th scope="col">OT<\/th>/);
  assert.ok(visible(html).includes("WSH 38–35 SF (OT)"));
});

test("fail closed: a run that does not reconcile renders the unavailable line and no table", () => {
  const s = structuredClone(defaultSample(m));
  s.finalScore.home += 1;
  const html = renderToStaticMarkup(React.createElement(BoxScoreForRun, { manifest: m, sample: s }));
  assert.match(html, /data-stbx-state="unavailable"/);
  assert.match(html, /data-stbx-error="FINAL_MISMATCH"/);
  assert.ok(!/<table/.test(html), "no partial table");
  assert.ok(!/\b[A-Z]{3,}(?:_[A-Z0-9]{2,})+\b/.test(visible(html)), "the code stays in an attribute");
  assert.match(renderToStaticMarkup(React.createElement(BoxScoreStatic, { box: null, error: null })), /unavailable/);
});

test("dialog: modal dialog, team tabs, the selected team's numbers equal nflBoxScore, NOT_MODELED rows as text", () => {
  const s = defaultSample(m);
  const box = nflBoxScore(s, m);
  const palette = theaterPalette(m.teams.home.abbr, m.teams.away.abbr);
  const orig = console.error;
  console.error = () => {}; // useLayoutEffect has no effect on the server; React says so
  let html;
  try {
    html = renderToStaticMarkup(React.createElement(BoxScoreDialog, { open: true, onClose: () => {}, manifest: m, sample: s, palette }));
  } finally {
    console.error = orig;
  }
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /class="st-sheet is-modal"/);
  assert.match(html, /data-stbx-dialog=""/);
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
  assert.match(html, /data-stbx-tab="away"[^>]*|aria-selected="true"[^>]*data-stbx-tab="away"/);
  assert.ok(html.includes(BOX_SCORE_WATERMARK));
  for (const c of box.categories) assert.equal(cell(html, c.id, "away"), c.away.display, `${c.id}`);
  assert.ok(box.categories.filter((c) => c.status === "NOT_MODELED").every((c) => cell(html, c.id, "away") === NOT_MODELED_TEXT));
  assert.equal(renderToStaticMarkup(React.createElement(BoxScoreDialog, { open: false, onClose: () => {}, manifest: m, sample: s, palette })), "");
});
