/**
 * GLOSSARY — the single source of truth for user-facing terms is complete + honest.
 *
 * Pins: every term the product needs is defined (model %, market %, edge, EV, confidence, reliability,
 * paper-only, no-play, pending, void, settlement, market-implied, simulation, shadow calibration); each
 * carries a short + long definition; presets resolve; and the honesty framing (paper-only, pending ≠
 * loss, market-anchored sim, edge caution) is present in the copy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { GLOSSARY_TERMS, glossaryTerm, glossaryByCategory, legendPreset, LEGEND_PRESETS } from "./glossary.ts";

const REQUIRED = ["model-probability", "market-probability", "edge", "ev", "confidence", "reliability", "paper-only", "no-play", "pending", "void", "settlement", "market-implied", "simulation", "calibration"];

test("1 · every required term is defined with a short + long definition", () => {
  for (const id of REQUIRED) {
    const t = glossaryTerm(id);
    assert.ok(t, `missing term: ${id}`);
    assert.ok(t.term && t.short && t.long, `${id} needs term/short/long`);
    assert.ok(t.short.length <= 140, `${id} short def should stay compact`);
  }
});

test("2 · every term is reachable via a category group (no orphans)", () => {
  const grouped = glossaryByCategory().flatMap((g) => g.terms.map((t) => t.id));
  for (const t of GLOSSARY_TERMS) assert.ok(grouped.includes(t.id), `${t.id} is not in any category group`);
  assert.equal(grouped.length, GLOSSARY_TERMS.length, "no duplicate/missing in category grouping");
});

test("3 · legend presets resolve to real terms", () => {
  for (const name of Object.keys(LEGEND_PRESETS)) {
    const terms = legendPreset(name);
    assert.ok(terms.length > 0, `${name} preset empty`);
    for (const t of terms) assert.ok(t.id && t.short, `${name} preset has a bad term`);
  }
});

test("4 · the honesty framing is present (paper-only, pending≠loss, market-anchored, edge caution)", () => {
  assert.match(glossaryTerm("paper-only").short, /paper|educational|\$0/i);
  assert.match(glossaryTerm("pending").short, /never|not.*loss/i);
  assert.match(glossaryTerm("simulation").long, /market-anchored|does not claim to beat/i);
  assert.match(glossaryTerm("edge").long, /under-?perform|caution/i, "edge carries the anti-calibration caution");
});

/*
 * 5 · THE OWNER'S DEFINITION IS WHAT REACHES THE READER (P288).
 *
 * This module's own header calls it "the single source of truth for every term the site shows a
 * user", and it had `edge` right: model probability − market probability, in percentage points.
 * /about nonetheless carried its own paraphrase — "how much higher or lower the projection is vs.
 * the line" — which is a DIFFERENT quantity and does not share its sign. In the 2026-09-12 board a
 * hitter projected 1.37 against a 1.5 line had Gap +10.7 while one projected 0.92 against 0.5 had
 * −2.3, so a reader taught the paraphrase read both backwards on the page that shows them.
 *
 * A single source of truth with a hand-copied second copy is two sources. These assert that the
 * quantity is stated as a probability difference wherever it is defined, and that the wrong
 * paraphrase cannot come back.
 */
test("5 · the edge/gap term is defined as a probability difference by its owner", () => {
  const edge = glossaryTerm("edge");
  assert.match(edge.short, /model\s*%\s*minus\s*market\s*%/i, "the short form names both probabilities");
  assert.match(edge.long, /model probability\s*[−-]\s*market probability/i, "the long form states the subtraction");
  assert.match(edge.long, /percentage points/i, "and its unit");
});

test("5b · no reference page redefines it as projection-minus-line", () => {
  const pages = ["src/app/about/page.tsx", "src/app/market-guide/page.tsx", "src/app/learn/page.tsx", "src/app/methodology/page.tsx"];
  for (const rel of pages) {
    const p = path.join(process.cwd(), rel);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, "utf8");
    // Strip comments: the /about comment deliberately QUOTES the wrong definition to record it.
    const code = src.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
    const prose = code.replace(/\s+/g, " ");
    assert.doesNotMatch(
      prose,
      /projection is vs\.? the line|projection (?:minus|vs\.?|against) the line[^.]{0,40}percentage points/i,
      `${rel}: the gap is model probability − market probability, not the projection against the line`,
    );
  }
});
