/**
 * UFC MODEL-DIAGNOSTIC GATE — while the UFC moneyline model is unvalidated (moneylineValidated=false /
 * publicPicksVisible=false), the public /ufc page must show the MARKET-IMPLIED read only. No model
 * probability, model edge/gap, or "model pick" wording may render. Market-implied predictions stay live.
 *
 * These pin the gate WIRING (so a regression that re-exposes model numbers fails here); the built-DOM scan
 * in the gate battery is the belt-and-suspenders runtime check.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const page = read("src/app/ufc/page.tsx");
const projCard = read("src/components/ui/projection-card.tsx");
const expanded = read("src/components/ufc/expanded-fight-cards.tsx");

test("1 · /ufc computes a model gate from real validation flags (never a hardcoded unlock)", () => {
  assert.match(page, /const modelGated = !v1Validated \|\| !\(ops\?\.publicPicksVisible/, "gate = unvalidated OR not public");
  // The gate is derived from artifact flags, not a constant true/false.
  assert.doesNotMatch(page, /const modelGated = (true|false)\b/, "gate is not hardcoded");
});

test("2 · ProjectionCard supports hideModel and suppresses model probability + edge when set", () => {
  assert.match(projCard, /hideModel = false/, "hideModel prop exists");
  // When hideModel, it shows market (not the edge % / Model line).
  assert.match(projCard, /hideModel \?[\s\S]*?market/, "hideModel path shows market read");
  assert.match(projCard, /hideModel[\s\S]*?Model \$\{pct\(p\.modelProbability\)\}/, "model line only on the non-hidden branch");
});

test("3 · /ufc passes hideModel={modelGated} to the projection + expanded components", () => {
  assert.match(page, /<ProjectionCard key=\{p\.id\} p=\{p\} hideModel=\{modelGated\}/, "projections gated");
  assert.match(page, /<UfcExpandedFightCards fights=\{expandedFights\} hideModel=\{modelGated\}/, "expanded gated");
});

test("4 · ExpandedFightCards threads hideModel and gates the moneyline model number", () => {
  assert.match(expanded, /hideModel = false/, "component accepts hideModel");
  assert.match(expanded, /hideModel \? `Market:/, "moneyline summary shows market read when gated");
  assert.match(expanded, /hideModel[\s\S]*?marketProbability[\s\S]*?model gap/, "model gap only on the non-hidden branch");
});

test("5 · model-probability Suggested Cards are gated; a validation panel replaces them", () => {
  assert.match(page, /ufcCards\.length > 0 && !modelGated/, "overview suggested cards require !modelGated");
  assert.match(page, /modelGated \? \(\s*modelGatedPanel/, "cards tab shows the gated panel when gated");
  assert.match(page, /clean graded fights before public model picks unlock/, "honest gate copy present");
  assert.match(page, /\{gradedRows\} \/ \{gradedTarget\}/, "shows the real clean-graded-rows progress");
});

test("6 · the page keeps market-implied predictions live + says model picks are validating", () => {
  assert.match(page, /Market-implied/, "market-implied read is public");
  assert.match(page, /Model-adjusted picks · validating|model-adjusted picks/i, "model picks framed as gated");
  // No banned public over-claims on the page.
  const low = page.toLowerCase();
  for (const w of ["best bet", "positive ev", "validated model picks live", "guaranteed"]) {
    assert.ok(!low.includes(w), `no "${w}" on /ufc`);
  }
});

test("7 · the gate is real: the committed artifacts are currently unvalidated (so model output IS hidden)", () => {
  const ops = JSON.parse(read("public/data/ufc/ops-status-latest.json"));
  const proj = JSON.parse(read("public/data/ufc/projections-latest.json"));
  assert.equal(proj.moneylineValidated, false, "moneyline not validated yet");
  assert.equal(ops.publicPicksVisible, false, "public picks not visible yet");
  assert.ok((ops.cleanGradedRows ?? 0) < (ops.targetRowsForPublicMoneyline ?? 150), "below the validation threshold");
});
