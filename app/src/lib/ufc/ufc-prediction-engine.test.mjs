/**
 * UFC PREDICTION ENGINE V1 — transparent formulas + honest layering, run against the REAL UFC 329 data
 * (schedule + odds + the 2,695-fighter stats DB).
 *
 * Proves: the odds→implied→de-vig math is correct; moneyline is market-backed with the documented confidence
 * bands; fight-type/distance/method are MODEL-DERIVED from real fighter finish/record stats where both
 * fighters are in the DB, and "Insufficient data" otherwise; method probabilities sum to ~1; every row
 * carries the experimental caveat; and NO row emits a forbidden over-claim.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildUfcCardPredictions, buildUfcPredictionV1, buildFighterIndex, impliedFromAmerican, deVig, moneylineConfidence, keyForNames } from "./ufc-prediction-engine.ts";

const loadUfc = (n) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", n), "utf8"));
const sched = loadUfc("schedule-latest.json");
const odds = loadUfc("odds-latest.json");
const fdb = loadUfc("fighters-latest.json");

const oddsIndex = new Map();
for (const bt of odds.bouts ?? []) {
  const names = bt.sides ? bt.sides.map((s) => s.name) : bt.fighters ?? [];
  if (names.length >= 2) oddsIndex.set(keyForNames(names[0], names[1]), bt);
}
const fighterByName = buildFighterIndex(fdb.fighters);
const rows = buildUfcCardPredictions(sched.fights, oddsIndex, fighterByName);

test("1 · odds → implied → de-vig math is correct", () => {
  assert.ok(Math.abs(impliedFromAmerican(-200) - 2 / 3) < 1e-9, "-200 ⇒ 0.667");
  assert.ok(Math.abs(impliedFromAmerican(150) - 0.4) < 1e-9, "+150 ⇒ 0.40");
  const dv = deVig(-200, 150);
  assert.ok(dv && Math.abs(dv.a + dv.b - 1) < 1e-9 && dv.a > dv.b, "de-vig sums to 1, favorite higher");
  assert.equal(deVig(null, 150), null, "missing side ⇒ null");
});

test("2 · moneyline confidence bands match the documented thresholds", () => {
  assert.equal(moneylineConfidence(0.72), "high");
  assert.equal(moneylineConfidence(0.64), "medium");
  assert.equal(moneylineConfidence(0.585), "low");
  assert.equal(moneylineConfidence(0.55), "no_read");
});

test("3 · the whole card builds; a mix of odds-backed + model-derived + insufficient rows", () => {
  assert.equal(rows.length, sched.fights.length, "one row per scheduled fight");
  const oddsBacked = rows.filter((r) => r.moneyline.source === "market_implied");
  const modelReads = rows.filter((r) => r.fightType.source === "model_derived");
  assert.ok(oddsBacked.length >= 5, `market-backed moneylines (${oddsBacked.length})`);
  assert.ok(modelReads.length >= 8, `model-derived fight reads from real fighter stats (${modelReads.length}) — not provider-needed`);
});

test("4 · market-backed moneyline carries de-vig probs; model method probs sum to ~1", () => {
  for (const r of rows) {
    if (r.moneyline.source === "market_implied") {
      assert.ok(r.moneyline.fighterAProbability != null && Math.abs(r.moneyline.fighterAProbability + r.moneyline.fighterBProbability - 1) < 0.02);
    }
    if (r.fightType.source === "model_derived") {
      assert.equal(r.goesDistance.source, "model_derived");
      assert.ok(r.goesDistance.probability >= 0.25 && r.goesDistance.probability <= 0.75, "distance prob clamped");
      const m = r.method.probabilities;
      assert.ok(m && Math.abs(m.koTko + m.submission + m.decision - 1) < 1e-6, "method mix sums to 1");
    } else if (r.moneyline.source === "market_implied") {
      // MARKET-ONLY fallback (odds but no fighter model): "Market-only read" / "No clear read", never blank.
      assert.equal(r.fightType.label, "Market-only read");
      assert.equal(r.method.lean, "No clear read");
    } else {
      assert.equal(r.fightType.label, "Insufficient data");
      assert.equal(r.method.lean, "Insufficient data");
    }
  }
});

test("5 · EVERY row carries the experimental caveat and NO forbidden over-claim", () => {
  for (const r of rows) {
    assert.match(r.caveat, /experimental|validation in progress/i, "experimental caveat present");
    const blob = JSON.stringify(r).toLowerCase();
    for (const w of ["best bet", " lock", "guaranteed", "positive ev", "validated edge", "official pick"]) {
      assert.ok(!blob.includes(w), `no "${w}" in the row`);
    }
  }
});

test("8 · every fight emits a DISPLAY-SAFE row — no empty cells, no forbidden claims", () => {
  const FIELDS = ["gameTimeRead", "predictedWinnerText", "methodOfVictoryText", "winnerMethodText", "moneyline", "winProbability", "fightType", "distance", "method", "roundRange", "confidence", "why", "coverage"];
  for (const r of rows) {
    for (const f of FIELDS) {
      assert.ok(r.display[f] && String(r.display[f]).trim().length > 0, `${r.eventName ?? r.fightId}: display.${f} is non-empty`);
      assert.doesNotMatch(String(r.display[f]), /undefined|null|NaN/, `display.${f} has no undefined/null/NaN`);
    }
    const blob = JSON.stringify(r.display).toLowerCase();
    for (const w of ["best bet", " lock", "positive ev", "validated edge", "official pick", "guaranteed"]) {
      assert.ok(!blob.includes(w), `no "${w}" in the display row`);
    }
  }
  // With the market-only fallback, the whole card is filled — zero "Insufficient data" when every fight has
  // odds OR a fighter model (true for this card).
  assert.equal(rows.filter((r) => r.display.fightType === "Insufficient data").length, 0, "no insufficient rows on this card");
});

test("9 · every fight has an explicit Predicted Winner + Method of Victory; winner is a name or 'No clear winner'", () => {
  const fighterNames = new Set(sched.fights.flatMap((f) => [f.fighterA, f.fighterB]));
  for (const r of rows) {
    const w = r.prediction.predictedWinner;
    assert.ok(w === "No clear winner" || fighterNames.has(w), `${r.eventName ?? r.fightId}: winner is a real fighter name or "No clear winner" (got "${w}")`);
    assert.ok(["Decision", "KO/TKO", "Submission", "No clear method"].includes(r.prediction.methodOfVictory), "method is a valid label");
    // Every two-sided-odds fight gets a named winner: ≥55% ⇒ "Market-implied winner"; 50–55% ⇒ "Slight
    // market lean". No two-sided odds ⇒ "No clear winner" (a winner is never invented from stats).
    if (r.moneyline.source === "market_implied") {
      assert.notEqual(r.prediction.predictedWinner, "No clear winner", "odds-backed fight has a named winner");
      const fav = Math.max(r.moneyline.fighterAProbability, r.moneyline.fighterBProbability);
      if (r.prediction.predictedWinnerLabel === "Market-implied winner") assert.ok(fav >= 0.55, "market winner ≥55%");
      if (r.prediction.predictedWinnerLabel === "Slight market lean") assert.ok(fav >= 0.5 && fav < 0.55, "slight lean 50–55%");
    } else {
      assert.equal(r.prediction.predictedWinner, "No clear winner", "no odds ⇒ no invented winner");
    }
  }
  assert.ok(rows.some((r) => r.prediction.predictedWinner !== "No clear winner"), "at least some fights have a named winner");
  assert.ok(rows.some((r) => r.prediction.methodOfVictory !== "No clear method"), "at least some fights have a method read");
});

test("7 · diacritic folding matches accented fighters; genuine unknowns stay honest", () => {
  // "Benoît Saint Denis" (ï) must match the DB's "Benoit Saint Denis" via diacritic folding.
  assert.ok(fighterByName.get("benoit saint denis"), "accent-folded name resolves in the index");
  // Every covered row records match quality; a modeled row has both fighters matched.
  for (const r of rows) {
    assert.ok(["matched", "unmatched"].includes(r.dataCoverage.fighterAMatchQuality));
    if (r.fightType.source === "model_derived") {
      assert.equal(r.dataCoverage.fighterAMatchQuality, "matched");
      assert.equal(r.dataCoverage.fighterBMatchQuality, "matched");
    }
  }
  // At least 12 of 14 fights now carry a model read (diacritic fold recovered one).
  assert.ok(rows.filter((r) => r.fightType.source === "model_derived").length >= 12, "≥12/14 model reads after matching fix");
});

test("6 · confidence lowers with coverage; no-data fight is honest", () => {
  const bare = buildUfcPredictionV1({ fighterA: "Nobody X", fighterB: "Nobody Y", boutId: "z" }, null, null, null);
  assert.equal(bare.moneyline.source, "unavailable");
  assert.equal(bare.gameTimeRead, "Odds pending");
  assert.equal(bare.fightType.source, "unavailable");
  assert.equal(bare.method.confidence, "no_read");
  assert.equal(bare.dataCoverage.label, "Records only");
  // A model row never claims "high" confidence without real separation + completeness.
  for (const r of rows.filter((x) => x.fightType.source === "model_derived")) {
    if (r.goesDistance.confidence === "high") assert.ok(Math.abs(r.goesDistance.probability - 0.5) >= 0.16, "high distance conf needs real separation");
  }
});
