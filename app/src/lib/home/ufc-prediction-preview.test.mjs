/**
 * HOMEPAGE UFC PREDICTION PREVIEW — a compact winner/method board for tonight's card.
 * Proves: the loader returns real engine rows with winner + method; the component renders Winner/Method
 * columns + a /ufc CTA + the experimental caveat; the homepage wires it; no forbidden claims.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadUfcPredictionRows } from "./ufc-preview.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const comp = read("src/components/home/ufc-prediction-preview.tsx");
const home = read("src/app/page.tsx");

test("1 · the loader returns real UFC rows with predicted winner + method", () => {
  const p = loadUfcPredictionRows();
  assert.ok(p && p.rows.length >= 1, "rows present for the upcoming card");
  assert.ok(p.marketWinnerCount >= 1, "some market-backed winners");
  assert.ok(p.methodReadCount >= 1, "some method reads");
  for (const r of p.rows) {
    assert.ok(r.display.predictedWinnerText && r.display.methodOfVictoryText, "every row has winner + method text");
  }
});

test("2 · the preview component shows Winner + Method columns, a /ufc CTA, and the caveat", () => {
  assert.match(comp, /"Winner"/, "Winner column header");
  assert.match(comp, /"Method"/, "Method column header");
  assert.match(comp, /r\.display\.predictedWinnerText/, "renders the predicted winner");
  assert.match(comp, /r\.display\.methodOfVictoryText/, "renders the method");
  assert.match(comp, /href="\/ufc"/, "links to /ufc");
  assert.match(comp, /Experimental V1|experimental V1|validation in progress/i, "experimental caveat");
  assert.doesNotMatch(comp, /<img\b/i, "no external images");
  const low = comp.toLowerCase();
  for (const w of ["best bet", "positive ev", "guaranteed", "official pick", " lock "]) assert.ok(!low.includes(w), `no "${w}"`);
});

test("3 · the homepage renders the preview when a UFC card exists (null otherwise)", () => {
  assert.match(home, /import UfcPredictionPreview/, "home imports the preview");
  assert.match(home, /loadUfcPredictionRows\(\)/, "home loads the rows");
  assert.match(home, /ufcPreview \? <UfcPredictionPreview/, "home renders it only when a card exists");
});
