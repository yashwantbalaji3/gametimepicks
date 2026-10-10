/**
 * TRUTH-001 — a placed card says what a loss actually costs the core bankroll.
 *
 * Run: npx tsx --test src/lib/mr-dub/lane-risk.test.mjs
 *
 * Cards printed the rolled STAKE as "at risk · open exposure" (a Moonshot lane at step 3: "$400.22 at risk"
 * while the ledger's exposure was the $25 seed). The persisted lane carries both, and accounting.ts defines
 * exposure as "the at-risk amount: Bank Builder $100 seed; Moonshot $25".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { laneRiskLabel } from "./lane-risk.ts";

test("step 3 Moonshot (2026-09-13 shape): the seed is at risk, the stake is rolled wins + seed", () => {
  assert.equal(laneRiskLabel({ status: "active", stake: 400.22, exposure: 25 }), "$25 seed at risk · $400.22 stake includes rolled wins");
  assert.equal(laneRiskLabel({ status: "active", stake: 933.56, exposure: 100 }), "$100 seed at risk · $933.56 stake includes rolled wins");
});

test("step 1: stake and seed are the same amount", () => {
  assert.equal(laneRiskLabel({ status: "active", stake: 100, exposure: 100 }), "$100 at risk · the lane seed");
});

test("not active places nothing; an unpublished exposure claims no at-risk figure", () => {
  assert.equal(laneRiskLabel({ status: "candidate", stake: 100, exposure: 100 }), "$0 placed · not activated");
  assert.equal(laneRiskLabel({ status: "active", stake: 400.22, exposure: null }), "$400.22 stake · at-risk amount not published");
});

test("EVERY committed daily-portfolio lane: exposure is the seed or $0, never the rolled stake above it", () => {
  const p = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/mr-dub/daily-portfolio.json"), "utf8"));
  for (const l of p.lanes) {
    const seed = l.product === "moonshot" ? 25 : 100;
    assert.ok(l.exposure === 0 || l.exposure === seed || l.exposure === l.stake && l.stake === seed, `${l.id}: exposure ${l.exposure}`);
  }
});

test("no lane card prints the stake as the at-risk amount", () => {
  for (const f of ["src/components/ladders/product-lanes-ladder.tsx", "src/components/mr-dub/daily-portfolio-section.tsx"]) {
    const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
    assert.doesNotMatch(src, /money\(card\.stake\)\} at risk/, f);
    assert.match(src, /laneRiskLabel\(card\)/, f);
  }
});
