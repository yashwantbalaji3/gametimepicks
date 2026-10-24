/** Run: npx tsx --test scripts/nba/research/paired-metrics.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pairedBootstrap, seededRandom, winnerScores } from "./paired-metrics.mjs";

test("winnerScores: Brier, log loss and accuracy on a hand-checked sample", () => {
  const s = winnerScores([0.8, 0.3], [1, 0]);
  assert.equal(s.n, 2);
  assert.equal(s.brier, Number((((0.2 ** 2) + (0.3 ** 2)) / 2).toFixed(4)));
  assert.equal(s.logLoss, Number(((-Math.log(0.8) - Math.log(0.7)) / 2).toFixed(4)));
  assert.equal(s.accuracy, 1);
  assert.throws(() => winnerScores([], []));
});

test("pairedBootstrap: identical heads give a zero interval; a strictly better head excludes zero", () => {
  const rnd = seededRandom("fixture");
  const pairs = Array.from({ length: 400 }, () => { const p = 0.3 + 0.4 * rnd(); const y = rnd() < p ? 1 : 0; return { y, elo: p, v1: p }; });
  const same = pairedBootstrap(pairs, { iterations: 200 });
  assert.equal(same.logLoss.mean, 0); assert.equal(same.logLoss.excludesZero, false);
  const better = pairedBootstrap(pairs.map((p) => ({ ...p, elo: 0.5 })), { iterations: 200 });
  assert.ok(better.logLoss.hi95 < 0, "the informative head beats a coin on its own outcomes");
  assert.deepEqual(pairedBootstrap(pairs, { iterations: 50, seed: "s" }), pairedBootstrap(pairs, { iterations: 50, seed: "s" }), "deterministic");
});
