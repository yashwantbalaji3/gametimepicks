# Projection Engine Contracts (2026-07-14)

Strict shapes for the internal engines, so honesty is enforced by structure, not vibes. Both are **internal-only**
(`public:false`, not web-served) until validation passes.

## Honest source labels (the only ones allowed)
`internal_prototype` · `market_anchored_simulation` · `market_anchored_soccer_v1` · `internal_soccer_projection_v1`
· `projection_only` · `market_implied` · `validated_*` (earned only). **Never** `independent`, `validated`,
`edge`, `best bet`, `lock`, `positive EV` unless earned by a passing, documented backtest.

## 1. SoccerProjectionArtifact — `data/internal/world-cup/projection-engine/<date>.json`
Produced by `app/scripts/build-internal-soccer-projections.mjs` from the pure engine
`app/src/lib/world-cup/internal-soccer-projection-engine.ts`.

```
{
  version: "internal-soccer-projection-engine-v1",
  generatedAt, date,
  modelMode: "internal_soccer_projection_v1" | "market_anchored_soccer_v1",
  public: false, internal: true, webServed: false, officialMoneyRecordAffected: false,
  competition: "WorldCup", strengthSource: "fifa_points", engine: "bivariate_poisson_fifa_supremacy",
  matchCount,
  matches: [{
    matchId, home, away, kickoff, stage,
    inputs: { homeFifaPoints, awayFifaPoints, marketTotalLine },
    projection: {                                  // from projectMatch()
      modelMode, lambdaHome, lambdaAway,
      expectedGoals: { home, away, source: "model" },
      matchResult90: { homeWin, draw, awayWin },   // sums to 1
      totalGoals: { line, over, under, expected, distribution: { pmf[], expected } },
      btts: { yes, no },
      doubleChance: { homeOrDraw, awayOrDraw, homeOrAway },
      drawNoBet: { home, away },
      correctScore: { distribution: [{home,away,prob}], source: "internal_model" }
    },
    marketComparison: { source, market: {homeWin,draw,awayWin}|null, delta: {homeWin,draw,awayWin}|null }
  }],
  validation: { backtestStatus: "not_run"|"insufficient_sample"|"internal_only"|"public_ready", note },
  limitations: string[], disclaimer
}
```
**Rules enforced by tests:** `public===false`; `modelMode` ∈ the two soccer labels; no `"independent"`/`"validated"`
substring; `matchResult90` sums to 1; `correctScore.source==="internal_model"` (never fabricated); backtestStatus
honest. Correct-score exists because the model actually computes it (Poisson matrix) — if inputs were missing it
would be `unavailable`.

## 2. MlbFullGameSimulationArtifact — `data/internal/mlb/full-game-sim/<date>.json` (already built, prior slice)
Produced by `app/scripts/build-mlb-full-game-sim-artifacts.mjs` from `src/lib/full-game-sim/mlb/artifact-builder.ts`.

```
{
  ... date, asOf, public: false, internal: true, runCount: 10000, seed,
  modelMode: "market_anchored_simulation",   // NEVER "independent"
  officialMoneyRecordAffected: false, activeProductCard: false,
  games: [{
    schemaVersion, gameId, gamePk, teams, guardrails,
    winProbability: { home, away },
    projectedScore: { home, away },
    distributions: { totalRuns, margin },
    runLineCoverProbability?, totalOverProbability?,
    marketCoverage, dataQuality,
    model: { source: "market_anchored_simulation", mode, status: "experimental_internal", modelVersion, seed, vmr }
  }]
}
```
**Rules enforced by tests** (`full-game-honesty.test.mjs`, `public-safety.test.mjs`, `mlb/engine.test.mjs`):
`public===false`; not web-served (nothing under `app/public` carries `projectedScore`/`winProbability`/
`market_anchored_simulation`); `model.source` never `"independent"`; money guardrails all false.

## Shared invariants (both engines)
1. Written under `data/internal/…`, never `app/public/…`.
2. `public:false` until a backtest passes AND the founder approves.
3. `modelMode` names the honest method; market-anchored is never called independent.
4. Distributions/scorelines appear only when the model actually computes them.
5. Zero effect on official money, record, bankroll, exposure, portfolio md5.
