# UFC 329 — Public Prediction Readiness, Validation Status & Market Limitations (2026-07-10)

Consolidates `UFC329_PUBLIC_PREDICTION_READINESS`, `UFC329_MODEL_VALIDATION_STATUS`, and
`UFC_MARKET_LIMITATIONS_AND_PROVIDER_GAPS`. What may go public now vs what stays gated, and why.

## Event

| field | value |
|---|---|
| Event | **UFC 329: McGregor vs. Holloway 2** (`isRealCard: true`) |
| Date | 2026-07-11T21:00Z |
| Venue | T-Mobile Arena |
| Fights | 14 (ESPN MMA schedule) |
| Moneyline odds | The Odds API MMA · `generatedAt 2026-07-10T14:49:59Z` · **9 of 14 fights** have two-sided h2h prices |

## Readiness flags (from `readiness-latest.json` / `ops-status-latest.json`)

```
scheduleReady:      true      moneylineV1Ready:    true
oddsReady:          true      moneylineValidated:  false   ← model picks GATED
fighterStatsReady:  true      publicPicksVisible:  false   ← model picks GATED
gradingReady:       true      publicLevel:         grading-internal
backtestReady:      false     cleanGradedRows:     0 / 150 target
propMarketsAvailable: { h2h: true, method: false, distance: false, rounds: false }
blockers: ["no historical backtest yet"]
```

## What CAN go public now (shipped this pass)

- **Market-implied fight simulations** — each fight's **de-vigged two-sided sportsbook moneyline** rendered
  as a FreeSim report (`sourceMode: market_implied_simulation`, label **"Market-implied simulation"**).
- Market-implied win probabilities (both fighters, de-vigged to sum ≈ 1), favorite/underdog, and a
  **market-implied moneyline lean** on a clear favorite (≥ 58% de-vigged).

These are sourced from real odds and clearly labeled. No model probability, edge, or EV is exposed.

## What MUST remain gated (and why)

`moneylineValidated=false` and `cleanGradedRows = 0 / 150` — there is **no historical backtest yet**, so
none of the following may be public:

```
Model-adjusted pick        Best bet            Positive EV / edge over market
Independent UFC simulation  10,000-run sim      Bank Builder / Moonshot UFC pick
```

The internal model's `modelProbability` / `edge` exist in the artifact but the adapter **does not read
them** — the public report is market-implied only. Model picks unlock **only** when a no-leakage backtest
reaches the 150-clean-graded-fight threshold AND `publicPicksVisible` flips true AND founder approval is
respected. This mission did **not** force that — thresholds were not lowered.

## Market limitations / provider gaps

The connected feed (The Odds API MMA) is **h2h (moneyline) only**. These are `provider_needed`, shown as
roadmap, never faked, never leans:

```
Method of victory (KO/TKO · submission · decision)   Round betting / total rounds
Goes the distance                                    Exact round
```

`propMarketStatus.note`: *"Not offered by the current sportsbook feed (The Odds API MMA = h2h only)."*

## Settlement

Moneyline settles on the official fight result (win/loss). No UFC paper card is official or money-impacting;
model-adjusted picks require validation + founder approval before any public release.
