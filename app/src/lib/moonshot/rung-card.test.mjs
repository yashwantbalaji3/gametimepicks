import test from "node:test";
import assert from "node:assert/strict";
import { selectMoonshotRungCard } from "./rung-card.mjs";
import { MOONSHOT_LADDER, MOONSHOT_SEED } from "./moonshot-ladder.mjs";

const rungFor = (step, stake) => {
  const r = MOONSHOT_LADDER.find((x) => x.step === step);
  return { lane: "A", nextStep: step, clearedSteps: step - 1, rolledStake: stake, targetReturn: r.goal, targetMultiplier: r.goal / stake };
};
const leg = (id, gameId, odds, p) => ({ id, gameId, odds, modelProbability: p, matchup: gameId, kickoffUtc: "2026-09-11T23:05:00Z" });

// A slate shaped like 2026-09-10's team markets: favourites, near-even totals, a few dogs.
const POOL = [
  leg("fav1", "g1", -168, 0.588), leg("dog1", "g1", 128, 0.412),
  leg("fav2", "g2", -150, 0.57), leg("dog2", "g2", 125, 0.43),
  leg("ov3", "g3", -110, 0.5), leg("un3", "g3", -110, 0.5),
  leg("rl4", "g4", -216, 0.66), leg("dog4", "g4", 140, 0.40),
];

test("Day 1 · $25 must reach $100 (4.00×) with two legs from different games", () => {
  const c = selectMoonshotRungCard(POOL, rungFor(1, MOONSHOT_SEED));
  assert.equal(c.legs.length, 2);
  assert.notEqual(c.legs[0].gameId, c.legs[1].gameId);
  assert.ok(c.fitsTarget);
  assert.ok(MOONSHOT_SEED * c.combinedDecimal >= 100 - 0.01, `$25 × ${c.combinedDecimal} reaches $100`);
});

test("the pair with the best chance of BOTH landing wins among those that reach the rung", () => {
  const c = selectMoonshotRungCard(POOL, rungFor(1, 25));
  const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a);
  let bestProb = 0;
  for (let i = 0; i < POOL.length; i++) for (let j = i + 1; j < POOL.length; j++) {
    if (POOL[i].gameId === POOL[j].gameId) continue;
    if (dec(POOL[i].odds) * dec(POOL[j].odds) >= 4) bestProb = Math.max(bestProb, POOL[i].modelProbability * POOL[j].modelProbability);
  }
  assert.ok(Math.abs(c.hitProbability - bestProb) < 1e-4);
});

test("THE REASON IT EXISTS · favourites only cannot reach +300, so no card is placed", () => {
  const favs = [leg("f1", "g1", -168, 0.588), leg("f2", "g2", -150, 0.57), leg("f3", "g3", -216, 0.66), leg("f4", "g4", -130, 0.54)];
  const c = selectMoonshotRungCard(favs, rungFor(1, 25));
  assert.equal(c.fitsTarget, false);
  assert.match(c.shortfallNote, /not placed/);
});

test("Day 3 · $400 needs only 2.50× — a shorter, likelier pair", () => {
  const c = selectMoonshotRungCard(POOL, rungFor(3, 400));
  assert.ok(c.fitsTarget);
  assert.ok(400 * c.combinedDecimal >= 1000 - 0.01);
  const d1 = selectMoonshotRungCard(POOL, rungFor(1, 25));
  assert.ok(c.hitProbability > d1.hitProbability, "a lower bar buys a likelier card");
});

test("a carried balance above the rung's start needs less price", () => {
  const c = selectMoonshotRungCard(POOL, rungFor(2, 150)); // $150 → $400 = 2.67×
  assert.ok(c.fitsTarget);
  assert.ok(150 * c.combinedDecimal >= 400 - 0.01);
});

test("excluded legs and games are never used (lane independence)", () => {
  const a = selectMoonshotRungCard(POOL, rungFor(1, 25));
  const games = new Set(a.legs.map((l) => l.gameId));
  const b = selectMoonshotRungCard(POOL, { ...rungFor(1, 25), lane: "B" }, { excludeGames: games, excludeIds: new Set(a.legs.map((l) => l.id)) });
  for (const l of b.legs) assert.ok(!games.has(l.gameId));
});

test("deterministic — the same slate always deals the same card", () => {
  const x = selectMoonshotRungCard(POOL, rungFor(1, 25)), y = selectMoonshotRungCard([...POOL].reverse(), rungFor(1, 25));
  assert.deepEqual(x.legs.map((l) => l.id), y.legs.map((l) => l.id));
});
