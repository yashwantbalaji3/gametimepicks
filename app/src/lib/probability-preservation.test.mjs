/**
 * THE MODEL'S PROBABILITY MUST SURVIVE THE STEP THAT NARROWS A LEAN INTO A LEG (§13, §22).
 *
 * 🔴 THE DEFECT, measured on the real slate of 2026-09-26. Every one of the 371 legs in the
 * optimizer pool traces to a board lean carrying `modelProbOver` — 371 of 371 — and NOT ONE leg
 * carried a probability. The audit recorded it as "0 of 371 legs have a probability"; the sharper
 * truth is that the probability EXISTS for all 371 and was discarded in `_normalizeMlbLean`, which
 * copied `projection`, `edgePct`, `confidence`, both prices, the recent series, the bookmaker and
 * the reason — and not the probability.
 *
 * §13's Recommendation Receipt cannot be populated from a record that never carried the field, and
 * §15's correlation framework has no marginals without it. So this is the prerequisite for both.
 *
 * ⚠ CARRIED IS NOT PROMOTED. Every MLB market these come from is `DEMOTE_TO_MARKET_CONTEXT`. The
 * number is preserved so a RECEIPT can record it and `probabilityBasisFor` can mark it unusable —
 * never so a selector can multiply it. A test below pins exactly that.
 *
 * Run: cd app && npx tsx --test src/lib/probability-preservation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { _normalizeMlbLean } = await import("./data-projections.ts");
const { probabilityBasisFor, makeRecommendationReceipt, PROBABILITY_BASIS } =
  await import("./products/recommendation-receipt.mjs");
const { MLB_MARKET_CALIBRATION } = await import("./mlb/model-calibration-status.ts");

const APP = process.cwd();
const BOARDS = path.join(APP, "public/data/mlb/boards");

/** The newest committed MLB board that actually carries leans with probabilities. */
function board() {
  for (const f of fs.readdirSync(BOARDS).sort().reverse()) {
    if (!f.endsWith(".json")) continue;
    const b = JSON.parse(fs.readFileSync(path.join(BOARDS, f), "utf8"));
    const withProb = (b.leans ?? []).filter((l) => typeof l.modelProbOver === "number");
    if (withProb.length > 20) return { file: f, board: b, withProb };
  }
  return null;
}
const fx = board();

test("a committed board carries leans WITH a model probability — else this suite is vacuous", () => {
  assert.ok(fx, `no committed MLB board under ${BOARDS} carries model probabilities`);
  assert.ok(fx.withProb.length > 20, `only ${fx?.withProb.length} leans carry one`);
});

test("🔴 §22 · the probability SURVIVES the projection, on every lean that had one", { skip: !fx }, () => {
  const normalised = fx.withProb.map(_normalizeMlbLean);
  const kept = normalised.filter((l) => l.modelProbOver !== null || l.modelProbUnder !== null);
  assert.equal(kept.length, normalised.length,
    `${normalised.length - kept.length} of ${normalised.length} leans lost their probability in the projection`);
  /* And it is the SAME number, not a rounded or recomputed one. */
  for (let i = 0; i < Math.min(normalised.length, 50); i += 1) {
    assert.equal(normalised[i].modelProbOver, fx.withProb[i].modelProbOver ?? null);
  }
});

test("§3 · a lean with no probability yields null, never a zero", { skip: !fx }, () => {
  const bare = _normalizeMlbLean({ ...fx.withProb[0], modelProbOver: undefined, modelProbUnder: undefined });
  assert.equal(bare.modelProbOver, null);
  assert.equal(bare.modelProbUnder, null);
  /* And a non-numeric value is not coerced. */
  const junk = _normalizeMlbLean({ ...fx.withProb[0], modelProbOver: "0.62", modelProbUnder: NaN });
  assert.equal(junk.modelProbOver, null, "a string probability is not a probability");
  assert.equal(junk.modelProbUnder, null, "NaN is not a probability");
});

test("BOTH sides are kept — choosing here would make the projection own the receipt's decision", { skip: !fx }, () => {
  const l = _normalizeMlbLean(fx.withProb.find((x) => typeof x.modelProbUnder === "number") ?? fx.withProb[0]);
  assert.ok("modelProbOver" in l && "modelProbUnder" in l);
});

test("🔴 §13 · CARRIED IS NOT PROMOTED — the receipt still refuses to read it", { skip: !fx }, () => {
  /*
   * This is the whole safety property. Preserving the number must NOT make a demoted market usable;
   * the receipt consults the calibration verdict and drops the value into `unusableProbability`.
   */
  const lean = fx.withProb[0];
  const l = _normalizeMlbLean(lean);
  const verdict = MLB_MARKET_CALIBRATION[l.market]?.verdict ?? null;
  assert.equal(verdict, "DEMOTE_TO_MARKET_CONTEXT", `${l.market} is expected demoted today`);

  const { basis, reason } = probabilityBasisFor({
    modelProbability: l.modelProbOver, calibrationVerdict: verdict, familyPublished: true,
  });
  assert.equal(basis, PROBABILITY_BASIS.MODEL_DEMOTED);

  const receipt = makeRecommendationReceipt({
    sport: "mlb", eventId: String(l.gameId), participantId: l.playerId, marketFamily: l.market,
    modelProbability: l.modelProbOver, probabilityBasis: basis, probabilityReason: reason,
  });
  assert.equal(receipt.modelProbability, null, "a demoted probability must stay unreadable as the model's");
  assert.equal(receipt.unusableProbability, l.modelProbOver, "and must not be lost either");
  assert.match(receipt.unusableProbabilityReason, /DEMOTE/);
});

test("nothing in the app imports the exported normaliser except this guard", () => {
  /* It is exported only so the narrowing step can be exercised; an app import would make it API. */
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|mjs)$/.test(e.name)) continue;
      if (p.endsWith("data-projections.ts") || p.endsWith("probability-preservation.test.mjs")) continue;
      if (fs.readFileSync(p, "utf8").includes("_normalizeMlbLean")) hits.push(path.relative(APP, p));
    }
  };
  walk(path.join(APP, "src"));
  assert.deepEqual(hits, []);
});
