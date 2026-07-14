# SimTheGame Parity — Provider & Data Roadmap (2026-07-14)

Practical, priced where known. Each row: what it unlocks, options, cost/effort, settlement need, priority,
definition of done. Money locked `affe6b21`.

## Soccer

| Need | Unlocks | Provider options | Cost / effort | Settlement | Priority | Definition of done |
|---|---|---|---|---|---|---|
| **Historical closing odds** | Market baseline for validation | **The Odds API `/historical`** — CONFIRMED working on the current key (~10 credits/snapshot; 64 matches ≈ 560 credits) | Already available; low effort | n/a | ~~P0~~ **DONE** | `wc-2022-closing-odds-baseline.json` fetched; model measured vs market (loses ~1%) |
| **Multi-tournament match results** | Elo/SPI-style ratings to replace noisy in-tournament form | The Odds API scores, API-Football history (2022–2024 free), football-data archives | Medium (fitting pipeline) | n/a | **P1** | A ratings model backtested vs market that closes the ~1% gap |
| 2026 player statistics | WC prop settlement (goalscorer/shots/SOT/assists) | API-Football **paid** plan | Paid tier | required | P1 | Props flip experimental→supported; real results |
| Projected lineups / minutes | Player-prop projections (who starts) | API-Football lineups, provider feeds | Medium | — | P2 | Tier-2 player projections with disclosed confidence |
| xG / event data | The real jump from rating-Poisson to a model; corners/cards | StatsBomb / Opta-class | High $ | required for corners/cards | P3 | A model that beats the market baseline out-of-sample |
| Referee / injuries | Marginal features | Specialist feeds | Low-med | — | P4 | Measured lift or dropped |

## MLB

| Need | Unlocks | Provider options | Cost / effort | Settlement | Priority | Definition of done |
|---|---|---|---|---|---|---|
| Rolling full-game backtest | Public full-game sim readiness | Existing internal engine + StatsAPI finals + market lines (have all) | Low (compute) | have | **P0** | Backtest beats market baseline out-of-sample, stable across weeks |
| Probable-pitcher reliability | Biggest full-game lever (currently neutral) | StatsAPI + a pitcher model | Medium | have | P1 | Pitcher-adjusted run means, measured lift |
| Confirmed lineups / bullpen | Refine run distribution | StatsAPI feeds | Medium | have | P2 | Completeness flags true + measured lift |
| Team totals / F5 / alt lines (odds) | More MLB markets | The Odds API (paid markets) | Paid credits | need join | P2 | Ingested + settleable end-to-end |
| Park / weather | Venue effects beyond static ±3% | Weather API + park data | Low-med | — | P3 | Data-driven park/weather factors |
| Historical odds | MLB market baseline for the full-game sim | The Odds API `/historical` (confirmed works) | Low credits | n/a | P1 | Model-vs-market for MLB full-game |

## Sequencing (cross-sport, highest ROI first)
1. **MLB full-game rolling backtest** (P0, free) — data in hand; the next real model milestone.
2. **Soccer multi-tournament ratings** (P1, free-ish) — the only honest path to beat the market.
3. **API-Football paid** (P1) — WC prop settlement; validates the settlement engine already built.
4. **The Odds API paid markets** (P2) — MLB team-totals/F5/alt lines.
5. **xG / event data** (P3, expensive) — a true independent soccer model. Never fake the interim.

## What is NO LONGER blocked
The soccer **market baseline** — previously scoped as a paid add-on — turned out to be available on the current
Odds API key. It is fetched, and the verdict is in: the engine does not beat the market. That closes the biggest
open question and redirects effort from "get odds" to "build a better model" (P1 ratings work).
