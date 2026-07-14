# MLB Full-Game Monte Carlo Prototype — Status & Honesty Guarantee (2026-07-14)

The FreeSim-parity master mission asks for an **internal-only** MLB full-game Monte Carlo prototype: backtested,
**not web-served**, `modelMode` market-anchored (never "independent"). This already exists from a prior slice —
this doc records **what it is, where it lives, and the verification that it is honest and internal-only**. It is
not a rebuild.

## What exists (do not duplicate)
| Piece | Path |
|---|---|
| Engine | `app/src/lib/full-game-sim/mlb/artifact-builder.ts` (+ `engine.test.mjs`) |
| Artifact builder | `app/scripts/build-mlb-full-game-sim-artifacts.mjs` |
| Internal artifact | `data/internal/mlb/full-game-sim/<date>.json` |
| Rolling backtest | `app/scripts/backtest-mlb-full-game-sim-rolling.mjs` → `data/internal/mlb/full-game-sim-backtests/rolling-latest.json` |
| Readiness gate | `app/scripts/build-full-game-sim-readiness.mjs` → `data/internal/mlb/full-game-sim-readiness/` |
| Schema | `docs/FULL_GAME_SIMULATION_ARTIFACT_SCHEMA.md` |
| Backtest report | `docs/MLB_FULL_GAME_SIM_ROLLING_BACKTEST_2026-07-09.md` |
| Model design | `docs/MLB_TEAM_SCORING_MONTE_CARLO_MODEL_DESIGN_2026-07-09.md` |

## What the artifact produces (per game)
`winProbability`, `projectedScore`, and full-game `distributions` (total-runs / margin) — a **10,000-run**
market-anchored Monte Carlo. Team run rates anchor to committed finals; park factors are static ±3%; pitcher
strength is neutral. `vmr` (variance-to-mean ratio) 1.35 widens the count distribution beyond naive Poisson.

## Honesty guarantees (verified 2026-07-14)
- **Not web-served.** No full-game-sim artifact exists under `app/public/`; no public JSON contains
  `projectedScore` / `winProbability` / `market_anchored_simulation`. Verified by find + grep. ✓
- **`modelMode` is honest.** `model.source` / `model.mode` = `market_anchored_simulation`, `status`
  `experimental_internal`. **Nothing claims `predictionSource: "independent"`.** ✓
- **Money-safe.** Artifact flags `public:false`, `internal:true`, `officialMoneyRecordAffected:false`,
  `activeProductCard:false`. It cannot touch the ledger, record, bankroll, or exposure. ✓
- **No leakage in the model.** Backtest run rates use **only** committed linescore dates *strictly earlier* than
  the graded date; the final score enters only the evaluation phase (documented in `rolling-latest.json`'s
  `leakageNote`). ✓
- **Tests green.** `full-game-honesty.test.mjs` + `public-safety.test.mjs` + `mlb/engine.test.mjs` — 20/20. ✓

## Why it is NOT surfaced publicly (yet)
The public MLB report remains a **player-prop** simulation + **market-anchored** full-game lines. The full-game
distributions stay internal until the rolling backtest demonstrates the model **beats the market-implied
baseline** on out-of-sample dates. Surfacing an unvalidated full-game win probability as a "simulation" would be
exactly the dishonesty this mission forbids. Promotion is gated on the readiness artifact, not on a UI decision.

## Next step to make it public (honest path)
1. Extend the rolling backtest across more settled July dates (strictly-earlier inputs only).
2. Compare calibration vs the de-vigged market baseline. Only a **positive, stable** delta earns a surface.
3. If it passes, surface `winProbability` + total-runs distribution on the MLB report **labelled
   market-anchored**, never "independent", and keep the player-prop sim as the headline.
