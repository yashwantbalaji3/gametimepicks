/**
 * The UFC prediction board shows the card artifact and nothing else (UFC-001 · UX Phase A).
 *
 * Run: npx tsx --test src/lib/sports/ufc/prediction-board.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildPredictionBoard, METHOD_LEAN_LABEL } from "./prediction-board.mjs";

const APP = process.cwd();
const card = JSON.parse(fs.readFileSync(path.join(APP, "public/data/ufc/card-latest.json"), "utf8"));
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("the committed card exists and has bouts — otherwise every check below is vacuous", () => {
  assert.ok(Array.isArray(card.bouts) && card.bouts.length > 0);
});

test("every bout appears exactly once, in the card's own order (main event first)", () => {
  const board = buildPredictionBoard(card);
  assert.equal(board.total, card.bouts.length);
  assert.deepEqual(board.rows.map((r) => r.boutId), card.bouts.map((b) => String(b.boutId)));
  assert.equal(new Set(board.rows.map((r) => r.boutId)).size, board.rows.length, "no bout twice");
  assert.equal(board.rows[0].position, "Main event");
  if (board.rows.length > 1) assert.equal(board.rows[1].position, "Co-main event");
});

test("every published winner forecast is shown exactly as the artifact states it — and only those", () => {
  const board = buildPredictionBoard(card);
  for (const [i, b] of card.bouts.entries()) {
    const row = board.rows[i];
    const w = b.prediction?.winner;
    if (w && typeof w.probability === "number") {
      assert.ok(row.pick, `${b.boutId}: a published forecast must not be dropped`);
      assert.equal(row.pick.name, w.name);
      assert.equal(row.pick.probability, w.probability, "the probability is the artifact's, untouched");
      assert.equal(row[row.pick.side].name, w.name, "the pick points at one of the two fighters in this bout");
      assert.equal(row.unmodelledReason, null);
    } else {
      assert.equal(row.pick, null, `${b.boutId}: no forecast is invented for an unmodelled bout`);
      assert.equal(row.methodLean, null);
      assert.ok(row.unmodelledReason, "an unmodelled bout says why");
    }
  }
  assert.equal(board.modelled, card.bouts.filter((b) => typeof b.prediction?.winner?.probability === "number").length);
});

test("the method lean is the artifact's own argmax label, never a number", () => {
  const board = buildPredictionBoard(card);
  for (const [i, b] of card.bouts.entries()) {
    const row = board.rows[i];
    if (!row.methodLean) continue;
    assert.equal(row.methodLean.code, b.prediction.method.most);
    assert.equal(row.methodLean.label, METHOD_LEAN_LABEL[b.prediction.method.most]);
    assert.deepEqual(Object.keys(row.methodLean).sort(), ["code", "label"], "no probability rides on the lean");
  }
});

test("every row links to its existing bout page, by the same id the bout route serves", () => {
  const board = buildPredictionBoard(card);
  for (const row of board.rows) assert.equal(row.href, `/ufc/bout/${row.boutId}/`);
});

test("segments come from the provider's start times: the main event's start is the main card, earlier is prelims", () => {
  const board = buildPredictionBoard(card);
  const main = Date.parse(card.bouts[0].startUtc);
  for (const [i, b] of card.bouts.entries()) {
    assert.equal(board.rows[i].segment, Date.parse(b.startUtc) >= main ? "Main card" : "Prelims");
  }
});

test("fixtures: an unknown pick name, a missing card and a missing method are all handled honestly", () => {
  const f = { bouts: [
    { boutId: 1, startUtc: "2026-10-11T00:00Z", red: { name: "A" }, blue: { name: "B" }, prediction: { winner: { name: "Z", probability: 0.6 }, method: { most: "KO" } } },
    { boutId: 2, startUtc: "2026-10-10T21:00Z", red: { name: "C" }, blue: { name: "D" }, prediction: { winner: { name: "C", probability: 0.55 }, method: null } },
    { boutId: 3, startUtc: "2026-10-10T21:00Z", red: { name: "E" }, blue: { name: "F" }, prediction: null, unmodelledReason: "too little history" },
  ] };
  const b = buildPredictionBoard(f);
  assert.equal(b.rows[0].pick, null, "a winner name matching neither fighter is not shown as a pick");
  assert.equal(b.rows[1].pick.side, "red");
  assert.equal(b.rows[1].methodLean, null, "no method lean without a method head");
  assert.equal(b.rows[1].segment, "Prelims");
  assert.equal(b.rows[2].unmodelledReason, "too little history");
  assert.deepEqual(buildPredictionBoard(null).rows, []);
});

test("/ufc renders the board as its events section, and the board says what the numbers are", () => {
  const page = read("src/app/ufc/page.tsx");
  const games = page.indexOf('<section id="ufc-games"');
  const overview = page.indexOf('<header id="ufc-overview"');
  assert.ok(games > 0 && overview > games, "the board section comes before the overview");
  assert.match(page.slice(games, overview), /<UfcPredictionBoard card=\{card\} \/>/);
  const comp = read("src/components/ufc/prediction-board.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
  assert.match(comp, /not a sportsbook price/);
  assert.match(comp, /it is not the chance that the pick wins that way/);
  assert.match(comp, /method and round are not yet graded/);
  assert.doesNotMatch(comp, /methodLean\.(probability|p)\b/, "the board never renders a method probability");
});

// Founder directive 2026-10-23 public readiness: the per-bout "experimental lean" hedge is replaced by the public
// vocabulary, and the Model Performance disclosure is stated ONCE for the card on /ufc — with the true facts, never a
// claim of skill — instead of on every bout.
test("/ufc states the UFC Model Performance disclosure once, with its facts and a link to the graded record", () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\s+/g, " ");
  const page = strip(read("src/app/ufc/page.tsx"));
  const comp = strip(read("src/components/ufc/prediction-board.tsx"));
  assert.equal((page.match(/PUBLIC_TERMS\.MODEL_PERFORMANCE/g) ?? []).length, 1, "exactly one Model Performance disclosure on the page");
  assert.doesNotMatch(comp, /MODEL_PERFORMANCE|Model Performance/, "the board never repeats it per bout");
  assert.match(page, /backtested on past cards and graded publicly beside the de-vigged sportsbook line, on a small live sample so far \(the old moneyline model was retired\)/);
  assert.match(page, /href="#ufc-record"/, "it links to the graded record");
  assert.match(page, /<section id="ufc-record"/, "and the anchor exists");
  assert.doesNotMatch(`${page} ${comp}`, /experimental lean|Predictions · experimental|" · experimental"/i, "the retired hedge labels stay gone");
  assert.doesNotMatch(`${page} ${comp}`, /\b(proven|edge over the market|beats? the market)\b/i, "the disclosure never implies proven skill");
});
