# MLB Prop & Market Coverage Audit — July 21, 2026

Grounded in the shipped July‑21 artifacts (not assumptions). Money untouched; md5 `affe6b21071f2b3be96bb2774eb347c3`.

## Method

- **Provider-available** = present in `public/data/mlb/player-props/2026-07-21.json` (raw FanDuel lines) or `team-markets/2026-07-21.json`.
- **Sim-modeled** = present in `boards/2026-07-21.json` with finite `projection`+`sigma` (⇒ sampled 10k by `mlb-generator.ts`).
- **Distribution** = has a 10k-bin histogram in `game-simulations/2026-07-21.json`.
- **Settlement** = deterministically gradeable from the official MLB StatsAPI box score (`gradeProp` / linescore), per `mlb-calibration-findings`.
- **Product-eligible** = may enter a Bank Builder / Moonshot card (requires settleable + non-experimental).

## Player-prop markets

| Market | Provider line? | Model proj+σ? | 10k dist? | Model prob? | Market prob? | Deterministic settle? | Product eligible? | Public report status |
|---|---|---|---|---|---|---|---|---|
| `pitcher_strikeouts` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (box: K) | ✅ | **Model prediction** (surface fully) |
| `batter_hits` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (box: H) | ✅ | **Model prediction** (surface fully) |
| `batter_total_bases` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (box: TB) | ✅ | **Model prediction** (surface fully) |
| `batter_hits_runs_rbis` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (box: H+R+RBI) | ✅ | **Model prediction** (surface fully) |
| `pitcher_outs` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ (box: IP×3) | ❌ | **Market context only** (no model yet) |
| `pitcher_earned_runs` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ (box: ER) | ❌ | **Market context only** |
| `batter_home_runs` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ (box: HR) | ❌ | **Market context only** (rare event — Gaussian model unsuitable) |
| `batter_rbis` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ (box: RBI) | ❌ | **Market context only** |
| `batter_runs_scored` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ (box: R) | ❌ | **Market context only** |
| `batter_walks` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (box: BB) | ❌ | **provider_unavailable** (not in feed) |
| `pitcher_walks` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | **provider_unavailable** |
| `stolen_bases` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (box: SB) | ❌ | **provider_unavailable** |

**Blunt reading:**
- **4 markets are true model predictions** and settleable and product-eligible: `pitcher_strikeouts, batter_hits, batter_total_bases, batter_hits_runs_rbis`. Today the report surfaces ~21 picks out of **82 modeled leans + 74 distributions** — a big honest surfacing gap.
- **5 markets are provider-available but unmodeled** (`pitcher_outs, pitcher_earned_runs, batter_home_runs, batter_rbis, batter_runs_scored`). They have real lines → we can show **de-vigged market context**, but they are **not predictions** and **not product-eligible**. Calling them predictions would be fabrication.
- **3 markets are provider-unavailable** (`batter_walks, pitcher_walks, stolen_bases`) — not in the FanDuel feed we ingest. Not faked; marked `provider_unavailable`.

## Team / full-game markets

| Market | Provider? | GTP treatment | Public status |
|---|---|---|---|
| Moneyline | ✅ `team-markets` (`noVigProb`) | de-vigged market read | **Market context** (not a sim, not an edge) |
| Run line | ✅ `team-markets` | de-vigged market read | **Market context** |
| Game total | ✅ `team-markets` | de-vigged market read | **Market context** |
| Team total | ⚠️ not in current team-markets file | — | **provider_unavailable** (would be context if ingested) |
| First-inning / inning markets | ❌ | — | **provider_unavailable** (D) |
| Full-game scoreline / win prob / run distribution | internal engine only | mirrors market; not public-ready | **not public** — internal, documented in roadmap |

## Why the 5 unmodeled markets are not just "turned on"

`mlb-generator.ts` samples `N(projection, σ)`. That is a **defensible model for higher-count, roughly-symmetric stats** (K, hits, TB, H+R+RBI). It is a **poor** model for:
- **`batter_home_runs`** — a rare Bernoulli/Poisson event (~0.15/game). A clamped Gaussian would mis-price it badly. Needs a Poisson/Bernoulli HR-rate model.
- **`batter_rbis` / `batter_runs_scored`** — low-count, lineup/context-dependent, right-skewed. Needs a context-aware model.
- **`pitcher_outs` / `pitcher_earned_runs`** — outs are modelable from an innings projection (the cleanest candidate); ER is skewed. Both need their own projection + a backtest before they can be predictions.

To promote any of these from *market context* to *model prediction* requires: (1) a per-stat projection + σ from the recent game log, (2) an appropriate distribution family (Poisson for HR/ER, not Gaussian), (3) a backtest vs official box scores, (4) a calibration row, (5) passing the existing model gates. That is real modeling work — tracked in the coverage roadmap, **not shipped unvalidated** in this pass.

## This-pass actions (see execution doc)

- **A (ship now):** surface all 4 modeled markets fully — grouped player board (all 82 leans), a distribution per modeled market, market-agreement by stat, main takeaways.
- **B (ship now):** de-vigged **market-context** rows for the 5 provider-available player markets + the 3 team markets, explicitly labelled *market context, not simulated, not product-eligible*.
- **C/D (document):** per-stat projection models for the 5 unmodeled markets; full-game outputs; team totals / inning markets pending provider; soccer parity.
