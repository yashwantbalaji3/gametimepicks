# Provider & Modeling Roadmap (2026-07-14)

What each internal engine needs to earn a public surface. Companion to `PROVIDER_GAP_ROADMAP.md` (data access);
this one is about the **modeling** path. Nothing here is surfaced until its "definition of done" is met.

## Soccer — from FIFA-Poisson V1 to a real projection product

| Need | Why | Current status | Cost / complexity | Definition of done |
|---|---|---|---|---|
| **2022 WC results set** (64 matches) | The only way to validate V1 out-of-sample | Not fetched (API-Football 2022–2024 access on the free plan) | ~2 API calls, low | Backtest N≥64, model Brier/RPS beats closing-market baseline with calibration buckets |
| **Historical closing odds** for those matches | A fair baseline is the *market*, not uniform | Not stored | Medium (odds history provider) | Model-vs-market Brier delta computed on a real sample |
| **2026 player statistics** | Live prop settlement + lineup-informed Tier 2 | **Blocked** — free API-Football has no 2026 season | Paid plan | Flip goalscorer/shots from experimental→supported; settle props |
| **Projected lineups / minutes** | Anytime-scorer & shots need who starts | Sparse (`stats/normalized`) | Medium | Tier 2 player projections with disclosed lineup confidence |
| **xG / event data** (StatsBomb/Opta-class) | The jump from ratings-Poisson to a true model; corners/cards/shot quality | None | High $ | A genuine independent soccer model, replacing the FIFA proxy |
| **Dixon-Coles low-score correction** | Independent Poisson slightly misprices 0-0/1-0/1-1 | Not implemented (V1 is plain bivariate) | Low (code) | Correct-score calibration improves on the backtest set |

**Soccer bottom line:** V1 is a real internal engine but validated only on N=5. The cheapest high-value unlock is
the **2022 WC backtest** — it needs no money, just the fetch + a baseline. Everything public waits on it.

## MLB — from market-anchored full-game to a validated one

| Need | Why | Current status | Complexity | Definition of done |
|---|---|---|---|---|
| Larger rolling backtest | N is small; needs more settled dates | Rolling harness exists (`full-game-sim-backtests/`) | Low | Out-of-sample Brier beats de-vig market baseline, stable across weeks |
| Probable-pitcher reliability | Pitcher is the biggest full-game lever; currently neutral | `pitcherStrength: neutral(0)` | Medium | Pitcher-adjusted run means, backtested |
| Bullpen / lineup / weather | Refine run distribution | Not ingested | Medium | Completeness flags flip true, measured lift |
| Park factors beyond static ±3% | Real venue effects | Static approximation | Low | Data-driven park factors |

**MLB bottom line:** the engine is built and honest (market-anchored, internal, not web-served). To go public it
must beat the market baseline out-of-sample AND add pitcher signal — until then the public MLB report stays a
player-prop sim + market-anchored lines.

## Sequencing (highest ROI first)
1. **Soccer 2022 WC backtest** — free, validates or kills V1. Do first.
2. **MLB rolling backtest extension + pitcher signal** — data we already have.
3. **API-Football paid plan** — unlocks WC prop settlement (validates the existing settlement engine).
4. **Odds history** — enables honest model-vs-market baselines for both sports.
5. **xG/event provider** — the expensive endgame; a true independent soccer model. Never fake the interim.
