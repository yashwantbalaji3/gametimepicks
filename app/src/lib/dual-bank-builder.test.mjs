/**
 * Dual Bank Builder launch contract. Two parallel paper lanes launched June 15 from
 * real, odds-backed, upcoming legs — and the COMPLETED first run is preserved untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const DIR = new URL("../../public/data/bank-builder/", import.meta.url);
const dual = JSON.parse(fs.readFileSync(new URL("dual-lanes-latest.json", DIR), "utf8"));
const firstRun = JSON.parse(fs.readFileSync(new URL("public-summary-latest.json", DIR), "utf8"));

test("dual run is pending with exactly two lanes", () => {
  assert.equal(dual.status, "pending");
  assert.equal(dual.step, 1);
  assert.ok(Array.isArray(dual.lanes) && dual.lanes.length === 2, "two lanes");
  assert.deepEqual(dual.lanes.map((l) => l.lane).sort(), ["A", "B"]);
});

test("each lane is a $100 two-leg odds-backed parlay, status pending", () => {
  for (const lane of dual.lanes) {
    assert.equal(lane.stake, 100, `${lane.lane} starts at $100`);
    assert.equal(lane.status, "pending");
    assert.equal(lane.legs.length, 2, `${lane.lane} has 2 legs`);
    for (const leg of lane.legs) {
      assert.ok(typeof leg.americanOdds === "number" && leg.americanOdds !== 0, "leg is odds-backed");
      assert.ok(typeof leg.modelProbability === "number" && leg.modelProbability > 0, "leg has a model probability");
      assert.ok(leg.commenceTime, "leg has a start time (was upcoming at launch)");
      assert.ok(leg.gameLabel && leg.pick, "leg is a real pick");
    }
    // ~$200 target (allow a defensible band for lower-variance vs higher-return lanes)
    assert.ok(lane.projectedReturn >= 170 && lane.projectedReturn <= 240,
      `${lane.lane} return ~$200 (got ${lane.projectedReturn})`);
  }
});

test("the two lanes use different legs (no shared leg)", () => {
  const key = (l) => `${l.gameId}|${l.market}|${l.pick}`;
  const aKeys = new Set(dual.lanes[0].legs.map(key));
  const shared = dual.lanes[1].legs.filter((l) => aKeys.has(key(l)));
  assert.equal(shared.length, 0, "Lane A and Lane B share no leg");
});

test("lanes are differentiated (distinct thesis / risk tier or sport mix)", () => {
  const [a, b] = dual.lanes;
  const distinct = a.thesis !== b.thesis || a.riskTier !== b.riskTier ||
    a.combinedAmericanOdds !== b.combinedAmericanOdds;
  assert.ok(distinct, "lanes carry different theses / prices");
});

test("lanes use only safer MLB markets — no risky Over 1.5+ hits", () => {
  for (const lane of dual.lanes) {
    for (const leg of lane.legs) {
      if (leg.sport !== "mlb") continue;
      // batter_hits "Over" must be the 0.5 line (1+ hit), never Over 1.5/2.5.
      const isHitsOver = leg.market === "batter_hits" && /\bOver\b/.test(leg.pick);
      if (isHitsOver) {
        assert.ok(/Over 0\.5\b/.test(leg.pick), `risky MLB Over-1.5+ hits leg leaked: ${leg.pick}`);
      }
    }
  }
});

test("completed first Bank Builder run is preserved untouched", () => {
  assert.equal(firstRun.currentBankrollUnits, 10376.17);
  assert.equal(firstRun.record.wins, 5);
  assert.equal(firstRun.record.losses, 0);
  assert.equal(firstRun.runStatus, "completed");
});

test("no banned copy in the dual-lane artifact", () => {
  const banned = /\b(lock|safe|safest|guaranteed|guarantee|sure thing|free money|risk-free)\b/i;
  assert.ok(!banned.test(JSON.stringify(dual)), "no outcome-promise copy in lanes");
});
