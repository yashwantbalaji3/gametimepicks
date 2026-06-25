import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readLaneRungs, selectSafestTargetFitCard } from "./daily-portfolio/bank-builder-generation.ts";
import { buildPersistedDailyPortfolio } from "./daily-portfolio/accounting.ts";
import { loadWorldCupModelPicks } from "./world-cup/model-qualified-picks.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z";
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));

test("rung math (post June-24): Lane A COMPLETED the ladder + Lane B STOPPED → both terminal, no auto-rung", () => {
  const { laneA, laneB } = readLaneRungs(root);
  // POST JUNE-24: Lane A cleared all 5 rungs (Step 5 won → $10,089.23) → terminal. Lane B LOST Step 3 and
  // stopped; a stopped lane does NOT auto-place exposure on its settled rung — its restart is OPERATOR-GATED
  // (exactly like Lane A's completion banking). So neither lane yields an auto-generated next rung.
  assert.equal(laneA, null, "Lane A has no next rung — the $10k ladder is COMPLETE");
  assert.equal(laneB, null, "Lane B stopped (lost Step 3) — restart is operator-gated, no auto-rung");
});

test("safest target-fit selector still serves a forward rung + holds its invariants (synthetic rung)", () => {
  // Both LIVE lanes are terminal (Lane A completed, Lane B stopped), so the selector has no live lane to
  // serve right now. Verify the selector's invariants against a synthetic forward rung so coverage holds.
  const pool = loadWorldCupModelPicks(root, NOW, DATE);
  const rung = { lane: "B", nextStep: 3, clearedSteps: 2, rolledStake: 702.45, targetReturn: 1400, targetMultiplier: 1400 / 702.45 };
  const b = selectSafestTargetFitCard(pool, rung, new Set());
  assert.equal(b.legs.length, 2, "exactly 2 legs");
  assert.equal(new Set(b.legs.map((l) => l.gameId)).size, b.legs.length, "max 1 leg per game (or correlation noted)");
  for (const l of b.legs) assert.ok(l.odds >= -500 && l.odds <= 400, `${l.selection} within window`);
  const d = b.legs.reduce((p, l) => p * dec(l.odds), 1);
  assert.ok(Math.abs(decToAmerican(d) - b.combinedOdds) <= 2, "combined odds reconcile");
  assert.ok(b.potentialReturn >= rung.targetReturn, `reaches the rung target ($${b.potentialReturn} ≥ $${rung.targetReturn})`);
  assert.equal(b.fitsTarget, true, "card fits the rung target");
});

test("persisted daily portfolio (post June-24): both BB lanes terminal → no BB card, $0 BB exposure, money frozen", () => {
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  // POST JUNE-24: Lane A completed + Lane B stopped (operator-gated restart) → no forward BB lane is
  // auto-generated, so no BB seed is at risk in the daily view.
  assert.equal(bb.length, 0, "no forward BB lane — Lane A completed, Lane B stopped (operator-gated)");
  assert.equal(dp.products.bankBuilder.exposure, 0, "BB exposure is $0 — no active BB card");
  assert.equal(dp.activeBankroll, 10076.17); assert.equal(dp.crownBankroll, 10376.17);
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
});

test("BB seed-model invariant: a terminal lane places NO exposure; generation never touches canonical money", () => {
  // Both lanes are terminal post-June-24, so a fresh build places no BB exposure and leaves the canonical
  // bankroll/crown untouched (only an official settlement moves them).
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  assert.equal(bb.length, 0, "no forward BB lane (both terminal)");
  assert.equal(dp.products.bankBuilder.exposure, 0, "no BB seed at risk");
  assert.equal(dp.activeBankroll, 10076.17, "active bankroll unchanged by generation");
  assert.equal(dp.crownBankroll, 10376.17, "crown unchanged by generation");
});

test("started-game guard still holds for next-step cards (0 exposure after kickoff)", () => {
  const after = buildPersistedDailyPortfolio(root, "2026-06-25T00:00:00Z", DATE, "2026-06-25T00:00:00Z", true);
  assert.equal(after.openExposure, 0, "no exposure once games have started");
});

test("Bank Builder page: completed crown proof is collapsed + relabeled (not ACTIVE), active ladder leads", () => {
  const page = read("src/app/bank-builder/page.tsx");
  assert.match(page, /Completed crown proof · CROWN REACHED · historical/, "crown proof collapsed + relabeled");
  assert.match(page, /open=\{!completed\}/, "crown proof collapsed by default when completed");
  // Bank Builder consolidated to the single "Today's Dual Bank Builder" ladder (DualLadderBoard);
  // the completed crown proof renders AFTER it.
  const ladderIdx = page.indexOf("DualLadderBoard");
  const proofIdx = page.indexOf("Completed crown proof");
  assert.ok(ladderIdx > 0 && proofIdx > ladderIdx, "active dual ladder renders before the completed crown proof");
});

test("Bank Builder + Moonshot share the dynamic step rail (cleared/current/future)", () => {
  const ladder = read("src/components/ladders/product-lanes-ladder.tsx");
  assert.match(ladder, /currentStep/, "rail is driven by currentStep");
  assert.match(ladder, /cleared/, "rail renders cleared rungs");
  assert.match(ladder, /TOTAL_STEPS/, "per-product total steps");
});

test("game detail no longer promotes a raw < -500 prop as the top model pick", () => {
  const page = read("src/components/game/game-detail-page.tsx");
  assert.match(page, /qualifiedPlayerProps/, "top player pick filters to model-qualified props");
  assert.match(page, /americanOdds >= -500 && p\.americanOdds <= 400/, "excludes legs shorter than -500 (e.g. -5000)");
  assert.match(page, /No model-qualified pick/, "empty state says No model-qualified pick");
});
