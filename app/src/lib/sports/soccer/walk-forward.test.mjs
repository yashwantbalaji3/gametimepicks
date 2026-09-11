import test from "node:test";
import assert from "node:assert/strict";
import { walkForward, scorePredictions } from "./walk-forward.mjs";

const row = (season, day, home, away, ftHome, ftAway) => ({ season, dateUtc: `${day}T15:00:00.000Z`, home, away, ftHome, ftAway, result: ftHome > ftAway ? "H" : ftHome === ftAway ? "D" : "A", market: null });

test("the warm-up season is folded, never scored", () => {
  const preds = walkForward([row("2022-23", "2022-08-06", "A", "B", 2, 0), row("2023-24", "2023-08-12", "A", "B", 1, 1)]);
  assert.equal(preds.length, 1);
  assert.equal(preds[0].season, "2023-24");
});

test("no leakage: a match's own result, and its same-day slate, never reach its prediction", () => {
  const base = [row("2022-23", "2022-08-06", "A", "B", 1, 0), row("2023-24", "2023-08-12", "A", "B", 1, 0), row("2023-24", "2023-08-12", "C", "D", 1, 0)];
  const flipped = [base[0], row("2023-24", "2023-08-12", "A", "B", 0, 5), row("2023-24", "2023-08-12", "C", "D", 0, 5)];
  const a = walkForward(base), b = walkForward(flipped);
  assert.deepEqual(a.map((p) => p.probs.poisson), b.map((p) => p.probs.poisson), "changing today's results changes nothing predicted today");
  assert.deepEqual(a.map((p) => p.probs.elo), b.map((p) => p.probs.elo));
});

test("every model's probabilities sum to 1, and scoring is the standard definitions", () => {
  const rows = [row("2022-23", "2022-08-06", "A", "B", 2, 1), row("2022-23", "2022-08-13", "B", "A", 0, 0), row("2023-24", "2023-08-12", "A", "B", 3, 1)];
  for (const p of walkForward(rows)) for (const m of ["empirical", "elo", "poisson", "uniform"]) {
    const q = p.probs[m];
    assert.ok(Math.abs(q.H + q.D + q.A - 1) < 1e-5, m);
  }
  const s = scorePredictions([{ result: "H", probs: { m: { H: 1 / 3, D: 1 / 3, A: 1 / 3 } } }], "m");
  assert.equal(s.logLoss, Number(Math.log(3).toFixed(4)));
});
