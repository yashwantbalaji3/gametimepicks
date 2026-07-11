/**
 * UFC PREDICTIONS V2 UI + engine wiring. The clean board replaces the old provider-needed table: it shows a
 * GameTime Read per fight, a methodology panel, an experimental badge, confidence, and data coverage —
 * driven by the Prediction Engine V1. No forbidden over-claims, no external images.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const v2 = read("src/components/ufc/ufc-predictions-v2.tsx");
const anim = read("src/components/ufc/ufc-simulation-animation.tsx");
const page = read("src/app/ufc/page.tsx");

const NO_EXTERNAL_IMG = (src, name) => {
  assert.doesNotMatch(src, /<img\b/i, `${name}: no <img>`);
  assert.doesNotMatch(src, /https?:\/\/[^"')\s]+\.(png|jpe?g|gif|webp)/i, `${name}: no external image URL`);
};
const NO_OVERCLAIM = (src, name) => {
  const low = src.toLowerCase();
  for (const w of ["best bet", "positive ev", "validated edge", "official pick", "guaranteed"]) {
    assert.ok(!low.includes(w), `${name}: no "${w}"`);
  }
};

test("1 · V2 board shows a GameTime Read, methodology, confidence + coverage; honest badge", () => {
  assert.match(v2, /GameTime read/i, "GameTime read per fight");
  assert.match(v2, /How UFC predictions are calculated/, "methodology panel");
  assert.match(v2, /no-vig = impliedA/, "shows the no-vig formula");
  assert.match(v2, /Experimental model reads · validation in progress/, "experimental badge");
  assert.match(v2, /Fight type/i, "fight type column");
  assert.match(v2, /Method/i, "method column");
  assert.match(v2, /Insufficient data|Odds pending|—/, "honest empty states");
  NO_EXTERNAL_IMG(v2, "V2 board");
  NO_OVERCLAIM(v2, "V2 board");
});

test("2 · the animation surfaces the V1 model reads (experimental) + stays honest", () => {
  assert.match(anim, /fightType\?: string; distanceLean\?: string; methodLean\?: string/, "accepts model reads");
  assert.match(anim, /V1 model read · experimental/, "labels the model reads experimental");
  assert.match(anim, /Validation in progress/, "honest validation caveat");
  assert.match(anim, /Not an independent 10,000-run UFC model/, "no fake 10k claim");
  NO_EXTERNAL_IMG(anim, "animation");
  NO_OVERCLAIM(anim, "animation");
});

test("3 · the page builds the engine + renders V2 above the advanced odds board", () => {
  assert.match(page, /buildUfcCardPredictions/, "builds the engine card");
  assert.match(page, /buildFighterIndex\(fightersDb\?\.fighters\)/, "uses the real fighter DB");
  assert.match(page, /<UfcPredictionsV2/, "renders V2");
  assert.match(page, /fightType=\{featuredRow\?\.fightType/, "featured animation gets the model reads");
  const iTable = page.indexOf("{predictionTableSection}");
  const iOdds = page.indexOf("Advanced odds board");
  assert.ok(iTable > 0 && iOdds > 0 && iTable < iOdds, "predictions above the advanced odds board");
});

test("5 · stale-artifact guard: the Expanded tab only shows fights on the CURRENT schedule", () => {
  assert.match(page, /STALE-ARTIFACT GUARD/, "the guard is present");
  assert.match(page, /schedFighterKeys/, "builds a current-schedule fighter set");
  assert.match(page, /allExpanded\.filter\(/, "filters expanded fights to the schedule");
  assert.match(page, /schedFighterKeys\.has/, "only keeps fighters on the schedule");
});

test("4 · the old provider-needed V1 table is gone (superseded)", () => {
  assert.equal(fs.existsSync("src/components/ufc/ufc-prediction-table.tsx"), false, "old table component removed");
  assert.equal(fs.existsSync("src/lib/ufc/prediction-table.ts"), false, "old table lib removed");
  assert.doesNotMatch(page, /UfcPredictionTable\b/, "page no longer references the old table");
});
