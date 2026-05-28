/**
 * Tests for the bankroll allocation helper. Pure planning math —
 * guards the "no negative stakes / no exceed bankroll / no fabricated
 * payouts" invariants and locks in the lane-weight defaults.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LANE_WEIGHTS,
  DEFAULT_MIN_PER_SLIP,
  allocateBankroll,
} from "./bankroll-allocation.ts";

/** Build a slip with a single leg whose `oddsForSide` is known so the
 *  payout helper can produce a non-null projection. */
function fakeSlip(profile, slipId, americanOdds = -110) {
  return {
    slipId,
    riskProfile: profile,
    sport: "mlb",
    status: "pending",
    legs: [
      {
        sport: "mlb",
        gameId: null,
        gameDate: "2026-05-28",
        playerId: 1,
        playerName: "Test Player",
        team: "BOS",
        opponent: "NYY",
        market: "batter_hits",
        side: "Over",
        line: 0.5,
        projection: 1.1,
        edgePct: 5.0,
        confidence: "Strong",
        bookmaker: "draftkings",
        oddsForSide: americanOdds,
      },
    ],
    score: 1.0,
    sameGame: false,
    hasAnomalyLeg: false,
  };
}

test("empty slips → reserve = bankroll, no allocations", () => {
  const r = allocateBankroll({
    bankroll: 50,
    slips: [],
    riskPreference: "balanced",
    includeSwing: false,
    maxSlips: 5,
  });
  assert.deepEqual(r.allocations, []);
  assert.equal(r.totalAllocated, 0);
  assert.equal(r.reserve, 50);
  assert.equal(r.totalPotentialPayout, 0);
});

test("invalid bankroll (0, negative, NaN) → empty result", () => {
  const slips = [fakeSlip("conservative", "s1")];
  for (const b of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = allocateBankroll({
      bankroll: b,
      slips,
      riskPreference: "balanced",
      includeSwing: false,
      maxSlips: 5,
    });
    assert.equal(r.allocations.length, 0);
    assert.equal(r.totalAllocated, 0);
    assert.equal(r.reserve, 0);
  }
});

test("maxSlips < 1 → zero allocations, reserve = bankroll", () => {
  const r = allocateBankroll({
    bankroll: 50,
    slips: [fakeSlip("conservative", "s1")],
    riskPreference: "balanced",
    includeSwing: false,
    maxSlips: 0,
  });
  assert.equal(r.allocations.length, 0);
  assert.equal(r.reserve, 50);
});

test("$50 balanced across 4 lanes (no Swing) → no negative stakes, total ≤ $50, reserve ≥ 0", () => {
  const r = allocateBankroll({
    bankroll: 50,
    slips: [
      fakeSlip("conservative", "c1"),
      fakeSlip("balanced", "b1"),
      fakeSlip("star_power", "p1"),
      fakeSlip("aggressive", "a1"), // dropped because includeSwing false
    ],
    riskPreference: "balanced",
    includeSwing: false,
    maxSlips: 5,
  });
  assert.equal(r.allocations.length, 3, "Swing excluded by default");
  for (const a of r.allocations) {
    assert.ok(a.stake >= DEFAULT_MIN_PER_SLIP, `stake too small: ${a.stake}`);
  }
  assert.ok(r.totalAllocated <= 50, `total ${r.totalAllocated} > 50`);
  assert.ok(r.reserve >= 0, `reserve ${r.reserve} < 0`);
  assert.equal(r.totalAllocated + r.reserve, 50);
});

test("includeSwing: aggressive slip included when toggle true", () => {
  const r = allocateBankroll({
    bankroll: 100,
    slips: [
      fakeSlip("conservative", "c1"),
      fakeSlip("balanced", "b1"),
      fakeSlip("star_power", "p1"),
      fakeSlip("aggressive", "a1"),
    ],
    riskPreference: "balanced",
    includeSwing: true,
    maxSlips: 5,
  });
  const profiles = r.allocations.map((a) => a.slip.riskProfile);
  assert.ok(profiles.includes("aggressive"), "expected Swing in allocations");
});

test("includeSwing: aggressive excluded when toggle false", () => {
  const r = allocateBankroll({
    bankroll: 100,
    slips: [
      fakeSlip("conservative", "c1"),
      fakeSlip("aggressive", "a1"),
      fakeSlip("aggressive", "a2"),
    ],
    riskPreference: "balanced",
    includeSwing: false,
    maxSlips: 5,
  });
  const profiles = r.allocations.map((a) => a.slip.riskProfile);
  assert.ok(!profiles.includes("aggressive"));
});

test("maxSlips respected — never allocates more slips than the cap", () => {
  const slips = [
    fakeSlip("conservative", "c1"),
    fakeSlip("conservative", "c2"),
    fakeSlip("balanced", "b1"),
    fakeSlip("balanced", "b2"),
    fakeSlip("star_power", "p1"),
    fakeSlip("star_power", "p2"),
  ];
  const r = allocateBankroll({
    bankroll: 100,
    slips,
    riskPreference: "balanced",
    includeSwing: false,
    maxSlips: 3,
  });
  assert.equal(r.allocations.length, 3);
  assert.ok(r.capHit);
});

test("round-robin order: Anchor before Core before Spotlight when maxSlips = 3", () => {
  const r = allocateBankroll({
    bankroll: 60,
    slips: [
      fakeSlip("conservative", "c1"),
      fakeSlip("balanced", "b1"),
      fakeSlip("star_power", "p1"),
    ],
    riskPreference: "balanced",
    includeSwing: false,
    maxSlips: 3,
  });
  assert.equal(r.allocations[0].slip.riskProfile, "conservative");
  assert.equal(r.allocations[1].slip.riskProfile, "balanced");
  assert.equal(r.allocations[2].slip.riskProfile, "star_power");
});

test("lower-variance preference tilts more dollars toward Anchor than growth does", () => {
  const slips = [
    fakeSlip("conservative", "c1"),
    fakeSlip("balanced", "b1"),
    fakeSlip("star_power", "p1"),
    fakeSlip("aggressive", "a1"),
  ];
  const baseInput = {
    bankroll: 100,
    slips,
    includeSwing: true,
    maxSlips: 4,
  };
  const lv = allocateBankroll({ ...baseInput, riskPreference: "lower-variance" });
  const gr = allocateBankroll({ ...baseInput, riskPreference: "growth" });

  const anchorLv = lv.allocations.find((a) => a.slip.riskProfile === "conservative")?.stake ?? 0;
  const anchorGr = gr.allocations.find((a) => a.slip.riskProfile === "conservative")?.stake ?? 0;
  assert.ok(anchorLv >= anchorGr, `Anchor lower-variance=${anchorLv} should be ≥ growth=${anchorGr}`);

  const swingLv = lv.allocations.find((a) => a.slip.riskProfile === "aggressive")?.stake ?? 0;
  const swingGr = gr.allocations.find((a) => a.slip.riskProfile === "aggressive")?.stake ?? 0;
  assert.ok(swingGr >= swingLv, `Swing growth=${swingGr} should be ≥ lower-variance=${swingLv}`);
});

test("projected payouts respect odds-math null contract", () => {
  // Slip with one leg that has null odds → payout should be null.
  const slipNoOdds = fakeSlip("conservative", "c1");
  slipNoOdds.legs[0].oddsForSide = null;
  const r = allocateBankroll({
    bankroll: 50,
    slips: [slipNoOdds],
    riskPreference: "balanced",
    includeSwing: false,
    maxSlips: 5,
  });
  assert.equal(r.allocations.length, 1);
  assert.equal(r.allocations[0].payout, null);
  // Null payouts contribute 0 to the total — never NaN, never undefined.
  assert.equal(r.totalPotentialPayout, 0);
});

test("totalPotentialPayout is non-negative and finite", () => {
  const r = allocateBankroll({
    bankroll: 100,
    slips: [
      fakeSlip("conservative", "c1", -110),
      fakeSlip("balanced", "b1", +150),
    ],
    riskPreference: "balanced",
    includeSwing: false,
    maxSlips: 5,
  });
  assert.ok(Number.isFinite(r.totalPotentialPayout));
  assert.ok(r.totalPotentialPayout >= 0);
});

test("DEFAULT_LANE_WEIGHTS sum to 1.0 across all four lanes", () => {
  const sum =
    DEFAULT_LANE_WEIGHTS.conservative +
    DEFAULT_LANE_WEIGHTS.balanced +
    DEFAULT_LANE_WEIGHTS.star_power +
    DEFAULT_LANE_WEIGHTS.aggressive;
  // Floating-point safe: within a tiny epsilon
  assert.ok(Math.abs(sum - 1.0) < 1e-9, `weights sum to ${sum}`);
});

test("bankroll smaller than minPerSlip floors gracefully", () => {
  const r = allocateBankroll({
    bankroll: 0.5, // below the $1 floor
    slips: [fakeSlip("conservative", "c1")],
    riskPreference: "balanced",
    includeSwing: false,
    maxSlips: 5,
  });
  // Even if we can't fit a slip, we never go negative.
  assert.ok(r.totalAllocated <= 0.5);
  assert.ok(r.reserve >= 0);
});

test("bankroll fully utilised when possible — leftover dollars bump Anchor first", () => {
  // $50 across two lanes of one slip each (lower-variance preference,
  // no Swing). The helper should not leave most of the bankroll idle.
  const r = allocateBankroll({
    bankroll: 50,
    slips: [
      fakeSlip("conservative", "c1"),
      fakeSlip("balanced", "b1"),
    ],
    riskPreference: "lower-variance",
    includeSwing: false,
    maxSlips: 5,
  });
  // Most of the bankroll should be allocated; reserve is small.
  assert.ok(r.totalAllocated >= 45, `expected >= $45 allocated, got ${r.totalAllocated}`);
  // Anchor should not be smaller than Core under lower-variance pref.
  const anchorStake = r.allocations.find((a) => a.slip.riskProfile === "conservative")?.stake ?? 0;
  const coreStake = r.allocations.find((a) => a.slip.riskProfile === "balanced")?.stake ?? 0;
  assert.ok(anchorStake >= coreStake, `Anchor ${anchorStake} should be ≥ Core ${coreStake}`);
});
