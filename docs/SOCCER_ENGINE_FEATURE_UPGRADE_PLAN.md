# Soccer Engine Feature Upgrade — Plan & V2 Result (2026-07-14)

Tuning a global coefficient was a dead end (overfits). This tried the next honest lever: a **real feature**
(in-tournament form) in a V2 engine, backtested on 2022. **Blunt result: form does NOT help — it hurts.** V1
(pure FIFA-Poisson) stays the model. Internal-only; money untouched (`affe6b21`).

## What V2 added
`internal-soccer-projection-engine-v2.ts` (`rating_poisson_with_form_v1`): the v1 FIFA-Poisson λ's are nudged by
an attack×defense **form factor** — each team's goals-for/against per game in matches **strictly before** kickoff,
relative to a 1.3 goals/team reference — blended toward "no adjustment" by a `formWeight` scaled by the shorter of
the two teams' match counts. With no prior matches (group game 1), **V2 ≡ V1** (asserted in the backtest).

Leakage control: matches processed in date order; form from strictly-earlier 90-min results only; current result
updates state after prediction; pre-tournament FIFA points; no 2026 data.

## Result (2022 WC, N=64; form covered 48/64 matches)
| Model | log loss ↓ | Brier ↓ | top-pick |
|---|---|---|---|
| **V1 (pure FIFA)** | **1.0025** | **0.5925** | **56.3%** |
| V2 form-weight 0.25 | 1.0321 | 0.6112 | 54.7% |
| V2 form-weight 0.50 | 1.0767 | 0.6366 | 54.7% |
| V2 form-weight 0.75 | 1.1382 | 0.6664 | 46.9% |
| V2 form-weight 1.00 | 1.2243 | 0.7027 | 42.2% |

**Form is monotonically worse, and worse the more you trust it.** Every proper score and top-pick degrades as
`formWeight` rises.

## Why (this is the honest lesson, not a bug)
1–3 group games is a **tiny, variance-dominated sample**. A team that thrashed a minnow looks "in form" but isn't
stronger; a good team that lost a tight opener looks "cold" but isn't weaker. The FIFA rating is built on **years**
of matches — it already contains far more signal than 1–3 tournament games. Adding raw form injects schedule luck
and noise, so it pulls predictions away from the better prior.

## Decision
- **V2 not adopted. V1 (pure FIFA-Poisson) remains the engine.** V2 is kept as an internal, documented negative
  result (`backtests/2022-wc-v2.json`, `verdict.v2BeatsV1:false`).
- Two honest dead-ends now recorded: **knobs** (tuning, overfits) and **raw form** (hurts). The model is at the
  ceiling of what FIFA-ratings + 64 matches can do.

## What could actually help (needs new information, not new math)
1. **A market baseline** — to know if v1 already competes with the price (blocked; `SOCCER_MARKET_BASELINE_BLOCKER.md`).
2. **Opponent-adjusted, multi-tournament form** — form across many tournaments (not 1–3 games) via a real ratings
   pipeline (Elo/SPI-style). Needs historical match data + a fitting pipeline, not a WC-only window.
3. **xG / shot-quality features** — the real jump from rating-Poisson to a model. Needs an event-data provider.
Until one of these lands, the engine stays v1, internal, market-implied in public.
