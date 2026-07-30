/**
 * PREDICTION LAYER SAFETY + CROSS-SURFACE GUARDS (Sprint 009 · Phase 11). Source guards that the product
 * states the answer first, uses no betting-hype/market-beating language, derives player direction from the
 * simulation (not the gap), and that every surface consumes the ONE canonical decision object.
 *
 * Run: npx tsx --test src/lib/mlb/prediction/prediction-safety.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

test("the Game Report leads with the prediction hero, BEFORE the probability evidence", () => {
  const src = read("src/components/game/mlb-full-game-report.tsx");
  const heroDef = src.indexOf("function PredictionHero");
  assert.ok(heroDef > 0, "a PredictionHero exists");
  // In the Overview render, the hero comes before the "Evidence" divider and the win bar.
  const overview = src.slice(src.indexOf("function Overview"));
  const heroRender = overview.indexOf("<PredictionHero");
  const evidence = overview.indexOf(">Evidence<");
  const winBar = overview.indexOf("<WinBar");
  assert.ok(heroRender > 0 && heroRender < evidence && heroRender < winBar, "the hero renders before the evidence");
  // Program 058 reframe: the hero still leads with a direct answer, but frames it as a simulation read —
  // never "prediction" as a standalone promise — and carries the not-validated disclosure inline.
  assert.match(src, /GameTimePicks simulation read/i, "direct-answer language is present, simulation-framed");
  assert.match(src, /not validated to out-predict the market/i, "the hero carries the honesty disclosure inline");
});

test("no betting-hype or market-beating language in the prediction layer or hero", () => {
  const files = [
    "src/lib/mlb/prediction/decision.ts",
    "src/lib/mlb/prediction/strength.ts",
    "src/lib/mlb/prediction/summary.ts",
    "src/lib/mlb/prediction/types.ts",
    "src/components/game/mlb-full-game-report.tsx",
  ];
  // Unambiguous betting-hype / market-beating terms. "edge"/"value" are NOT banned at the identifier level
  // (they collide with data fields like bin `value` / `lowerEdge`); the concern there is consumer COPY, which
  // is covered by the visible-string check below + the repo-wide shadow-calibration "beat the market" guard.
  const banned = /\block\b|guaranteed|best bet|free money|beat the market/i;
  for (const f of files) {
    const src = read(f);
    // Strip the safety-comment that legitimately names the forbidden concepts (contract docstring).
    const scrub = src.replace(/PREDICTION ≠ EDGE[\s\S]*?profitability claim\./g, "");
    assert.ok(!banned.test(scrub), `${f} must not use betting-hype / market-beating language`);
  }
  // The hero's user-visible copy must not sell "edge"/"value"/"advantage" as a proven consumer benefit.
  const hero = read("src/components/game/mlb-full-game-report.tsx");
  const heroBlock = hero.slice(hero.indexOf("function PredictionHero"), hero.indexOf("function Overview"));
  const visibleText = (heroBlock.match(/>[^<>{}]+</g) || []).join(" ");
  assert.ok(!/\bedge\b|\bvalue\b|\badvantage\b/i.test(visibleText), "no edge/value/advantage in the hero's visible copy");
});

test("player prediction direction comes from the SIMULATED probability, not the model-vs-market gap", () => {
  const src = read("src/lib/mlb/prediction/decision.ts");
  assert.match(src, /never the model-vs-market gap/i, "documents the rule");
  // The gap (edgePct / model−market) must not be used to choose a side.
  assert.ok(!/edgePct|modelProbability\s*-\s*marketProbability/.test(src), "no gap-based side selection");
});

test("cross-surface: every surface consumes the ONE canonical decision object", () => {
  const detail = read("src/lib/game-detail.ts");
  // game-detail computes the decision via the single engine and derives the compact line from the SAME object.
  assert.match(detail, /buildGamePredictionDecision\(fg, playerPicks\)/, "one engine builds the decision");
  assert.match(detail, /predictionLine: compactPredictionLine\(prediction\)/, "the /today line is derived from the same object");
  // The Game Report hero is fed the detail's prediction object.
  const page = read("src/components/game/game-detail-page.tsx");
  assert.match(page, /prediction=\{detail\.prediction \?\? null\}/, "the report hero uses detail.prediction");
  // /today renders the compact prediction line from the row.
  const slate = read("src/components/today/full-slate.tsx");
  assert.match(slate, /g\.predictionLine/, "/today renders the canonical compact prediction");
});

test("no Bank Builder / Moonshot / analytics surfaced in the prediction hero", () => {
  const src = read("src/components/game/mlb-full-game-report.tsx");
  // The hero function itself must not reference paper products.
  const hero = src.slice(src.indexOf("function PredictionHero"), src.indexOf("function Overview"));
  assert.ok(!/Bank Builder|Moonshot|analytics/i.test(hero), "no product/analytics clutter in the hero");
});

test("the persisted prediction artifact (if present) is gradeable but NOT settled into money", () => {
  const p = path.join(app, "public/data/mlb/predictions/2026-07-24.json");
  if (!fs.existsSync(p)) return;
  const a = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(a.settledIntoMoney, false);
  assert.equal(a.notBettingAdvice, true);
  assert.ok(Array.isArray(a.predictions) && a.predictions.length > 0);
  for (const d of a.predictions) {
    assert.ok(d.gamePk != null && d.artifactHash != null, "identity + source hash for grading");
    if (d.status !== "unavailable") {
      assert.ok(d.predictedWinner?.team, "a directional winner");
      // A prediction exists even when the market agrees (prediction ≠ edge).
      assert.ok(["ALIGNED", "MODEL HIGHER", "MODEL LOWER", "NO MARKET"].includes(d.moneyline.marketAgreement));
    }
  }
});
