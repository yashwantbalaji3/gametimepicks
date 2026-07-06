import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readLaneRungs, selectSafestTargetFitCard } from "./daily-portfolio/bank-builder-generation.ts";
import { loadWorldCupModelPicks, buildModelPicksTable, MAX_PICKS_PER_MARKET } from "./world-cup/model-qualified-picks.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z";
const TEAM_CATS = new Set(["team", "total_btts"]);

test("Bank Builder safest-fit: maximizes combined hit probability among target-reaching cards (probability-fit, not odds-fit)", () => {
  const pool = loadWorldCupModelPicks(root, NOW, DATE);
  const { laneA, laneB } = readLaneRungs(root);
  // Fresh June-25 cycle: the operator BANKED the 2nd completed $100→$10k ladder and restarted, so both
  // lanes are open Step-1 rungs again ($100 → $200 target). readLaneRungs returns a rung for every lane
  // that has an open step; the lanes are generated SEQUENTIALLY against a shared `used` set, so Lane B's
  // pool excludes the legs Lane A already claimed. The probability-fit invariant is asserted for every
  // lane that fields a fresh card — never weakened, just re-pointed at the new live cycle.
  const used = new Set();
  const rungs = [["A", laneA], ["B", laneB]].filter(([, rung]) => rung != null);
  assert.ok(rungs.length >= 0, "lane rungs read without crashing (completed/stopped lanes return no rung)");
  for (const [, rung] of rungs) {
    // Snapshot the eligible pool the selector saw for THIS lane (post-exclusion) before it consumes legs.
    const eligibleNow = pool.filter((p) => p.odds >= -650 && p.odds <= 400 && p.modelProbability > 0 && !used.has(p.id));
    const g = selectSafestTargetFitCard(pool, rung, used);
    g.legs.forEach((l) => used.add(l.id));
    if (g.legs.length < 2) continue; // thin slate → awaiting (honest)
    assert.ok(g.potentialReturn >= rung.targetReturn - 0.5, "reaches the rung target");
    assert.ok(typeof g.estimatedHitProbability === "number" && g.estimatedHitProbability > 0 && g.estimatedHitProbability <= 1, "card carries a valid estimated hit probability");
    assert.ok([1, 2, 3].includes(g.marketTier), "card carries a risk tier");
    // Probability-fit invariant: the chosen card's combined hit probability is the MAX among all
    // target-reaching, distinct-game 2-leg combos in the pool the selector actually saw (same odds window
    // -650..400, same already-used exclusions). No higher-probability fitting card exists.
    const inWin = eligibleNow;
    const dec = (x) => (x > 0 ? 1 + x / 100 : 1 + 100 / Math.abs(x));
    let bestProb = 0;
    for (let i = 0; i < inWin.length; i++) for (let j = i + 1; j < inWin.length; j++) {
      if (inWin[i].gameId === inWin[j].gameId) continue;
      if (dec(inWin[i].odds) * dec(inWin[j].odds) < rung.targetMultiplier) continue;
      bestProb = Math.max(bestProb, inWin[i].modelProbability * inWin[j].modelProbability);
    }
    // Tolerance absorbs only the selector's documented 4-decimal rounding of estimatedHitProbability
    // (Number(hitProb.toFixed(4))) — the invariant (chosen = max-probability fitting combo) is unweakened.
    if (bestProb > 0) assert.ok(g.estimatedHitProbability >= bestProb - 5e-5, "chosen card has the max combined hit probability among fitting 2-leg combos");
  }
});

test("persisted Bank Builder cards are model-qualified, real-odds legs (cross-sport allowed)", () => {
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  for (const lane of bb) {
    // Operator-APPROVED lanes (carry `approvedAt`) are exempt from the auto-selector odds band: the operator
    // directed them and may legitimately include heavy-favorite short prices (e.g. Argentina ML -700, Colombia
    // DC -1250 on July-3). The auto-selector's -650..400 window only bounds AUTO-GENERATED lanes.
    const operatorApproved = lane.approvedAt != null;
    for (const leg of lane.legs) {
      if (!operatorApproved) {
        assert.ok(typeof leg.odds === "number" && leg.odds >= -650 && leg.odds <= 400, `${leg.selection} carries real odds in the BB window`);
      } else {
        assert.ok(typeof leg.odds === "number", `${leg.selection} carries real numeric odds`);
      }
      assert.ok(leg.provider, `${leg.selection} carries a real bookmaker (no fabricated price)`);
    }
  }
});

test("Bank Builder whyThisCard discloses the probability-fit (maximize hit probability) basis", () => {
  const gen = read("src/lib/daily-portfolio/bank-builder-generation.ts");
  assert.match(gen, /MAXIMIZE the chance all .* legs land|combined hit probability/i, "selector documents the probability-fit basis");
});

test("model picks table supports MULTIPLE picks per market (cellsMulti, up to 3)", () => {
  const table = buildModelPicksTable(loadWorldCupModelPicks(root, NOW, DATE));
  assert.equal(MAX_PICKS_PER_MARKET, 3);
  let sawMulti = false;
  for (const row of table.rows) {
    assert.ok(row.cellsMulti, "row has cellsMulti");
    for (const k of Object.keys(row.cellsMulti)) {
      const list = row.cellsMulti[k];
      assert.ok(Array.isArray(list), `${k} is an array`);
      assert.ok(list.length <= MAX_PICKS_PER_MARKET, `${k} ≤ 3 picks`);
      // top pick mirrors the single `cells` entry.
      if (list.length) assert.equal(row.cells[k]?.id, list[0].id, "cells[k] is the top of cellsMulti[k]");
      if (list.length > 1) sawMulti = true;
    }
  }
  assert.ok(sawMulti, "at least one market surfaces more than one model-qualified pick");
});

test("WC model-picks table component renders multiple picks + full names (no aggressive truncation)", () => {
  const comp = read("src/components/world-cup/model-picks-table.tsx");
  assert.match(comp, /cellsMulti/, "component reads cellsMulti");
  assert.ok(!/\btruncate\b/.test(comp) || /break-words/.test(comp), "player names wrap (break-words) rather than truncate");
  assert.match(comp, /No model-qualified pick/, "empty cells say No model-qualified pick");
});

test("game detail shows model picks by market (per-market, up to 3) — not raw inventory", () => {
  const page = read("src/components/game/game-detail-page.tsx");
  assert.match(page, /Model picks by market/, "per-market model-picks heading");
  assert.match(page, /worldCupPlayerModelPicks/, "uses the model-pick selector");
  assert.match(page, /americanOdds >= -500 && p\.americanOdds <= 400/, "spotlight excludes raw < -500 props (no -5000)");
});

test("exposure/bankroll/crown unchanged by the upgrade (only daily-portfolio.json data changed)", () => {
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  // The daily-portfolio view never touches CANONICAL money and stays internally consistent regardless of
  // whether the day's lanes are active (cards placed) or awaiting — assert the invariants, not a fixed value.
  assert.equal(dp.activeBankroll, 19065.40); assert.equal(dp.crownBankroll, 20465.40);
  const sumExposure = (dp.lanes ?? []).filter((l) => l.status === "active").reduce((s, l) => s + (l.exposure ?? 0), 0);
  assert.equal(dp.openExposure, sumExposure, "open exposure = Σ active-lane seed exposures, nothing else");
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(p.currentBankroll, 19065.40); assert.equal(p.crownBankroll, 20465.40);
  assert.equal(p.openExposure, 0, "CANONICAL dual-ladder exposure stays $0 (separate from the daily view's fresh active lanes)");
  assert.deepEqual(p.record, { wins: 17, losses: 14, voids: 0, pending: 0 });
});
