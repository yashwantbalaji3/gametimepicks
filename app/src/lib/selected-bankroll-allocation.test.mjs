/**
 * Tests for the Build My Card paper-bankroll allocator
 * (`selected-bankroll-allocation.ts`). Guards the invariants from
 * `docs/PARLAY_LAB_BUILDER_DESIGN_2026-05-30.md` §2.4 / §2.6 / §2.8:
 *   - allocate ONLY across selected slips,
 *   - whole-dollar stakes, totalAllocated ≤ bankroll, reserve ≥ 0,
 *   - even + confidence modes (confidence falls back to even),
 *   - drop settled / no-price slips with honest reasons,
 *   - honest "—": null odds never get a fabricated stake or payout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocateSelectedBankroll,
  allocateWholeDollars,
  DEFAULT_BANKROLL,
} from "./selected-bankroll-allocation.ts";

/** Build a slip with N legs whose `oddsForSide` is known so combined
 *  odds compute. `odds: null` simulates a missing price. */
function fakeSlip(
  slipId,
  { legs = 2, odds = -110, status = "pending", score = 1 } = {},
) {
  const legList = Array.from({ length: legs }, (_, i) => ({
    sport: "mlb",
    gameId: null,
    gameDate: "2026-05-29",
    playerId: i + 1,
    playerName: `Player ${i + 1}`,
    team: "BOS",
    opponent: "NYY",
    market: "batter_hits",
    side: "Over",
    line: 0.5,
    projection: 1.1,
    edgePct: 5,
    confidence: "Strong",
    bookmaker: "draftkings",
    oddsForSide: odds,
  }));
  return {
    slipId,
    riskProfile: "balanced",
    sport: "mlb",
    status,
    legs: legList,
    score,
    sameGame: false,
    hasAnomalyLeg: false,
  };
}

// ---------------------------------------------------------------------------
// allocateWholeDollars (largest-remainder primitive)
// ---------------------------------------------------------------------------

test("allocateWholeDollars: equal weights sum to budget", () => {
  const out = allocateWholeDollars(100, [1, 1, 1, 1]);
  assert.deepEqual(out, [25, 25, 25, 25]);
  assert.equal(out.reduce((a, b) => a + b, 0), 100);
});

test("allocateWholeDollars: remainder goes to earliest indices (deterministic)", () => {
  const out = allocateWholeDollars(100, [1, 1, 1]);
  assert.deepEqual(out, [34, 33, 33]);
  assert.equal(out.reduce((a, b) => a + b, 0), 100);
});

test("allocateWholeDollars: weighted split sums to budget, heavier weight gets more", () => {
  const out = allocateWholeDollars(100, [3, 1]);
  assert.deepEqual(out, [75, 25]);
});

test("allocateWholeDollars: budget 0 → all zeros", () => {
  assert.deepEqual(allocateWholeDollars(0, [1, 1]), [0, 0]);
});

test("allocateWholeDollars: zero total weight → all zeros", () => {
  assert.deepEqual(allocateWholeDollars(100, [0, 0]), [0, 0]);
});

test("allocateWholeDollars: budget < n → first `budget` slips get $1, rest $0", () => {
  const out = allocateWholeDollars(3, [1, 1, 1, 1, 1]);
  assert.deepEqual(out, [1, 1, 1, 0, 0]);
  assert.equal(out.reduce((a, b) => a + b, 0), 3);
});

// ---------------------------------------------------------------------------
// allocateSelectedBankroll — even mode
// ---------------------------------------------------------------------------

test("even split: total allocated equals whole-dollar bankroll, reserve 0", () => {
  const slips = [fakeSlip("a"), fakeSlip("b"), fakeSlip("c"), fakeSlip("d")];
  const r = allocateSelectedBankroll({ bankroll: 100, slips, mode: "even" });
  assert.equal(r.allocations.length, 4);
  assert.equal(r.totalAllocated, 100);
  assert.equal(r.reserve, 0);
  assert.ok(r.allocations.every((a) => a.stake === 25));
});

test("even split: indivisible bankroll keeps total ≤ bankroll, reserve ≥ 0", () => {
  const slips = [fakeSlip("a"), fakeSlip("b"), fakeSlip("c")];
  const r = allocateSelectedBankroll({ bankroll: 100, slips, mode: "even" });
  assert.equal(r.totalAllocated, 100);
  assert.ok(r.totalAllocated <= 100);
  assert.ok(r.reserve >= 0);
  assert.deepEqual(r.allocations.map((a) => a.stake), [34, 33, 33]);
});

test("fractional bankroll: fractional remainder falls into reserve", () => {
  const slips = [fakeSlip("a"), fakeSlip("b"), fakeSlip("c"), fakeSlip("d")];
  const r = allocateSelectedBankroll({ bankroll: 100.75, slips, mode: "even" });
  assert.equal(r.totalAllocated, 100);
  assert.equal(r.reserve, 0.75);
  assert.ok(r.totalAllocated <= 100.75);
});

test("one selection: the single slip gets the whole bankroll", () => {
  const r = allocateSelectedBankroll({
    bankroll: 100,
    slips: [fakeSlip("solo")],
    mode: "even",
  });
  assert.equal(r.allocations.length, 1);
  assert.equal(r.allocations[0].stake, 100);
  assert.equal(r.reserve, 0);
});

test("budget smaller than slip count: trailing slips get $0 + null payout", () => {
  const slips = [fakeSlip("a"), fakeSlip("b"), fakeSlip("c")];
  const r = allocateSelectedBankroll({ bankroll: 2, slips, mode: "even" });
  assert.deepEqual(r.allocations.map((a) => a.stake), [1, 1, 0]);
  assert.equal(r.totalAllocated, 2);
  // $0-stake slip carries no fabricated payout.
  assert.equal(r.allocations[2].payout, null);
  // priced, funded slips carry a real projected payout.
  assert.ok(r.allocations[0].payout && typeof r.allocations[0].payout.totalReturn === "number");
});

// ---------------------------------------------------------------------------
// allocateSelectedBankroll — confidence mode
// ---------------------------------------------------------------------------

test("confidence mode: weights by score, normalized over the selected set", () => {
  const slips = [fakeSlip("a", { score: 3 }), fakeSlip("b", { score: 1 })];
  const r = allocateSelectedBankroll({ bankroll: 100, slips, mode: "confidence" });
  assert.equal(r.mode, "confidence");
  assert.deepEqual(r.allocations.map((a) => a.stake), [75, 25]);
  assert.equal(r.totalAllocated, 100);
});

test("confidence mode falls back to even when all scores are equal", () => {
  const slips = [fakeSlip("a", { score: 2 }), fakeSlip("b", { score: 2 })];
  const r = allocateSelectedBankroll({ bankroll: 100, slips, mode: "confidence" });
  assert.deepEqual(r.allocations.map((a) => a.stake), [50, 50]);
});

test("confidence mode falls back to even when a score is missing", () => {
  const a = fakeSlip("a", { score: 3 });
  const b = fakeSlip("b");
  delete b.score; // missing score
  const r = allocateSelectedBankroll({ bankroll: 100, slips: [a, b], mode: "confidence" });
  assert.deepEqual(r.allocations.map((a) => a.stake), [50, 50]);
});

// ---------------------------------------------------------------------------
// Drops: settled + no-price
// ---------------------------------------------------------------------------

test("drops settled slips with reason 'already settled' and excludes them", () => {
  const slips = [
    fakeSlip("a", { status: "pending" }),
    fakeSlip("b", { status: "win" }),
  ];
  const r = allocateSelectedBankroll({ bankroll: 100, slips, mode: "even" });
  assert.equal(r.allocatableCount, 1);
  assert.equal(r.allocations.length, 1);
  assert.equal(r.allocations[0].slip.slipId, "a");
  assert.equal(r.dropped.length, 1);
  assert.equal(r.dropped[0].reason, "settled");
  assert.equal(r.dropped[0].reasonLabel, "already settled");
  // Settled slip is never counted toward stake.
  assert.equal(r.totalAllocated, 100);
});

test("drops null-odds slips with reason 'no price available'", () => {
  const slips = [
    fakeSlip("a", { odds: -110 }),
    fakeSlip("b", { odds: null }),
  ];
  const r = allocateSelectedBankroll({ bankroll: 100, slips, mode: "even" });
  assert.equal(r.allocatableCount, 1);
  assert.equal(r.dropped.length, 1);
  assert.equal(r.dropped[0].reason, "no-price");
  assert.equal(r.dropped[0].reasonLabel, "no price available");
  assert.equal(r.allocations[0].slip.slipId, "a");
  assert.equal(r.allocations[0].stake, 100);
});

test("settled takes precedence over no-price when both apply", () => {
  const slips = [fakeSlip("a", { status: "loss", odds: null })];
  const r = allocateSelectedBankroll({ bankroll: 100, slips, mode: "even" });
  assert.equal(r.dropped.length, 1);
  assert.equal(r.dropped[0].reason, "settled");
});

test("all selected slips dropped → no allocation, reserve = bankroll", () => {
  const slips = [
    fakeSlip("a", { status: "win" }),
    fakeSlip("b", { odds: null }),
  ];
  const r = allocateSelectedBankroll({ bankroll: 100, slips, mode: "even" });
  assert.equal(r.allocations.length, 0);
  assert.equal(r.allocatableCount, 0);
  assert.equal(r.dropped.length, 2);
  assert.equal(r.reserve, 100);
  assert.equal(r.bankrollUnset, false);
});

// ---------------------------------------------------------------------------
// Empty + invalid input
// ---------------------------------------------------------------------------

test("empty selection → empty allocation, reserve = bankroll", () => {
  const r = allocateSelectedBankroll({ bankroll: 100, slips: [], mode: "even" });
  assert.equal(r.allocations.length, 0);
  assert.equal(r.dropped.length, 0);
  assert.equal(r.allocatableCount, 0);
  assert.equal(r.reserve, 100);
  assert.equal(r.bankrollUnset, false);
});

test("bankroll ≤ 0 → bankrollUnset, no allocation, reserve 0", () => {
  for (const bad of [0, -5]) {
    const r = allocateSelectedBankroll({ bankroll: bad, slips: [fakeSlip("a")], mode: "even" });
    assert.equal(r.bankrollUnset, true);
    assert.equal(r.allocations.length, 0);
    assert.equal(r.reserve, 0);
  }
});

test("non-finite bankroll → bankrollUnset", () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    const r = allocateSelectedBankroll({ bankroll: bad, slips: [fakeSlip("a")], mode: "even" });
    assert.equal(r.bankrollUnset, true);
  }
});

// ---------------------------------------------------------------------------
// Cross-cutting invariants
// ---------------------------------------------------------------------------

test("invariants: totalAllocated ≤ bankroll and reserve ≥ 0 across many shapes", () => {
  const shapes = [
    { bankroll: 50, n: 1 },
    { bankroll: 100, n: 3 },
    { bankroll: 250, n: 5 },
    { bankroll: 7, n: 4 },
    { bankroll: 1000.99, n: 6 },
  ];
  for (const { bankroll, n } of shapes) {
    const slips = Array.from({ length: n }, (_, i) => fakeSlip(`s${i}`, { score: i + 1 }));
    for (const mode of ["even", "confidence"]) {
      const r = allocateSelectedBankroll({ bankroll, slips, mode });
      assert.ok(r.totalAllocated <= bankroll, `total ≤ bankroll (${mode}, ${bankroll}/${n})`);
      assert.ok(r.reserve >= 0, `reserve ≥ 0 (${mode}, ${bankroll}/${n})`);
      assert.ok(r.allocations.every((a) => Number.isInteger(a.stake) && a.stake >= 0));
    }
  }
});

test("totalPotentialPayout sums only non-null payouts (honest)", () => {
  const slips = [fakeSlip("a"), fakeSlip("b")];
  const r = allocateSelectedBankroll({ bankroll: 100, slips, mode: "even" });
  const manual = r.allocations.reduce((s, a) => s + (a.payout?.totalReturn ?? 0), 0);
  assert.ok(Math.abs(r.totalPotentialPayout - Math.round(manual * 100) / 100) < 1e-9);
});

test("allocation rows carry section label + combined odds for priced slips", () => {
  const r = allocateSelectedBankroll({ bankroll: 100, slips: [fakeSlip("a")], mode: "even" });
  const row = r.allocations[0];
  assert.ok(typeof row.combinedAmerican === "number");
  assert.ok(row.sectionKey != null);
  assert.ok(row.sectionLabel != null);
});

test("deterministic: same input yields identical output", () => {
  const make = () => [
    fakeSlip("a", { score: 3 }),
    fakeSlip("b", { score: 2 }),
    fakeSlip("c", { score: 5 }),
  ];
  const r1 = allocateSelectedBankroll({ bankroll: 137, slips: make(), mode: "confidence" });
  const r2 = allocateSelectedBankroll({ bankroll: 137, slips: make(), mode: "confidence" });
  assert.deepEqual(
    r1.allocations.map((a) => [a.slip.slipId, a.stake]),
    r2.allocations.map((a) => [a.slip.slipId, a.stake]),
  );
});

test("DEFAULT_BANKROLL is a positive whole number", () => {
  assert.ok(Number.isInteger(DEFAULT_BANKROLL) && DEFAULT_BANKROLL > 0);
});
