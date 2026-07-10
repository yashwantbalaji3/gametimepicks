# MLB Full-Game Sim — Backtest Report (2026-07-09)

**Verdict: `internal_only`.** The market-anchored simulation reproduces the market baseline (as designed)
and the only gradeable sample is tiny — not enough to conclude it adds value. Not a candidate for
founder review or public rollout.

Money md5 `affe6b21071f2b3be96bb2774eb347c3` — unchanged (read-only backtest).

---

## Method

A game is gradeable only when BOTH a committed team-market line AND an official final score exist.
Committed lines exist for **2026-07-09 only**, so the backtest grades that date's final games against the
free StatsAPI finals (`app/scripts/backtest-mlb-full-game-sim.mjs`).

## Results (2026-07-09)

| metric | sim | market baseline |
|---|---|---|
| games graded | 6 | — |
| skipped (not final) | 7 | — |
| moneyline Brier | **0.2448** | 0.2452 |
| moneyline accuracy | 0.50 | 0.67 |
| total O/U Brier (sim) | 0.2521 | — |
| total O/U accuracy (sim) | 0.50 | — |
| run-line cover accuracy (sim) | 0.50 | — |
| projected total MAE | 4.50 | 4.50 (market line) |

## Reading

- **The sim tracks the market by construction.** Its moneyline Brier (0.2448) ≈ the market's (0.2452),
  and its projected-total MAE (4.50) ≈ the market line's (4.50) — expected for a market-anchored model.
  It does **not** beat the market.
- **The sample is far too small** (6 games) to conclude anything — accuracy figures (0.50–0.67) are pure
  noise at this N. Flagged as `INSUFFICIENT SAMPLE` in the artifact.
- **No cherry-picking:** all 6 final games with committed lines were graded; the 7 non-final games were
  skipped and recorded.

## Verdict + next step

`internal_only`. To move toward `promising_but_needs_forward_test`, the engine needs a real forward
backtest across many dates — which requires **committing team-market lines daily** (only one date has
them today). Beating the market additionally requires the missing independent scoring inputs (pitcher /
lineup / bullpen / park). Public rollout stays **BLOCKED**; the engine + its artifacts remain internal.
