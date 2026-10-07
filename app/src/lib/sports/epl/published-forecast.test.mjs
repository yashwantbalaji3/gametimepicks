/**
 * The four played EPL matches with no grade (Results 3E finding, 2026-10-07) were never forecast: their last
 * pre-kickoff rows withheld probabilities. They must classify as WITHHELD (excluded and disclosed), never as a
 * forecast awaiting a grade. A model-only row WITH probabilities is a published forecast and must be gradable.
 * Pinned to rows copied from the committed research archive (__fixtures__/withheld-forecasts.json).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishedModel, withheldReason, FORECAST_BASIS } from "./published-forecast.mjs";

const FX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__/withheld-forecasts.json"), "utf8"));

test("the four ungraded matches published no probability before kickoff, so there is nothing to grade", () => {
  assert.deepEqual(FX.withheld.map((w) => w.row.eventId).sort(), [
    "soccer:epl:aston-villa-v-brighton-hove-albion:20260823t1300",
    "soccer:epl:brighton-hove-albion-v-chelsea:20260830t1300",
    "soccer:epl:brighton-hove-albion-v-leeds-united:20260905t1400",
    "soccer:epl:crystal-palace-v-manchester-city:20260828t1900",
  ]);
  for (const w of FX.withheld) {
    assert.ok(Date.parse(w.generatedAt) < Date.parse(w.row.kickoffUtc), `${w.row.eventId}: the fixture row is the last PRE-kickoff one`);
    assert.equal(publishedModel(w.row), null, `${w.row.eventId} must not be treated as a forecast`);
    assert.match(withheldReason(w.row), /probabilities withheld/);
  }
});

test("a model-only row with probabilities IS a published forecast (basis MODEL_ONLY), so the grader can grade it", () => {
  const pub = publishedModel(FX.modelOnly.row);
  assert.equal(pub?.basis, FORECAST_BASIS.MODEL_ONLY);
  assert.deepEqual(pub.model.probs, FX.modelOnly.row.modelOnly.probs);
  assert.equal(withheldReason(FX.modelOnly.row), null);
});

test("a priced row reads model.probs; a row with half a probability vector is withheld", () => {
  const priced = { state: "CURRENT_PRE_EVENT", model: { probs: { home: 0.5, draw: 0.3, away: 0.2 } } };
  assert.equal(publishedModel(priced).basis, FORECAST_BASIS.MODEL);
  assert.equal(publishedModel({ state: "CURRENT_PRE_EVENT", model: { probs: { home: 0.5, draw: null, away: 0.2 } } }), null);
  assert.equal(publishedModel({ state: "ABSTAIN", modelOnly: priced.model }), null, "only the two publishing states count");
});
