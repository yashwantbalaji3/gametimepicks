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
