# Monte Carlo Modeling Roadmap — Phase 19

A staged design for moving GametimePicks from rule-based projections to distribution-based simulation. Conservative on purpose: each version ships with measurable backtest evidence before replacing production scoring.

## Why Monte Carlo at all

The current model produces a single point projection (e.g. "PTS=22.4") and an edge percentage relative to the line. Two structural problems:

1. **No probability output.** "Edge=4%" doesn't tell users P(Over hits). Users want distributional thinking — "this lands above 20.5 about 58% of the time."
2. **No correlation handling.** Same-game parlays compound risk in ways linear edge math can't capture. LeBron PTS Over and Lakers team-total Over are not independent.

Monte Carlo simulation directly produces probabilities and naturally extends to correlated multi-leg analysis once we model the joint distribution.

## Versioning

### v1 — distribution prototype (THIS PHASE — `pipeline/simulation.py`)

Status: **shipped, experimental, NOT used in production scoring.**

- Models each leg as Normal(μ=projection, σ=projection×variance_pct)
- Truncates samples at 0 (impossible negative stats)
- Default variance_pct: PTS 0.30, REB 0.40, AST 0.45 (rough NBA rules of thumb)
- Independent-legs assumption for parlays (with explicit warning)
- Deterministic with `seed=` parameter
- Stdlib-only (no numpy)

**What v1 is good for:**
- Sanity-checking that distribution thinking improves on point estimates
- Wiring through to UI as a "simulation lab" experiment
- Building intuition before committing to a heavier framework

**What v1 is NOT good for:**
- Production confidence calibration
- Real parlay probability output
- Player-specific variance (uses category defaults)

### v2 — bootstrapped recent logs

When: ~30 days after Phase 19 lands, after settling 5-10 slates and verifying recent10 coverage is high (>70%).

Inputs needed:
- Player-specific recent10 game logs (already in board JSON when coverage is good)
- Per-player σ computed from log standard deviation, not category default
- Bayesian shrinkage: weight player-specific σ against league-wide prior, ratio governed by sample size

Method:
- Bootstrap-resample from recent10 instead of drawing from a fitted Normal
- Captures heavy tails and skewness without parametric assumptions
- Shrinkage prevents wildly under-sampled players from dominating

Why this is better than v1:
- Ditches the variance_pct hand-tuning
- Catches non-Normal distributions (rebounds tend to be right-skewed)
- Player-specific calibration

Tests required before promoting v2 to production:
- Backtest 30+ slates: Brier score < v1
- Calibration curve closer to identity (forecast 60% means 60% hit rate)
- Lower log loss on settled props

### v3 — correlated Monte Carlo + production-grade calibration

When: only after v2 demonstrably beats v1 on backtest.

Inputs needed:
- Per-game pace estimate (nba_api advanced stats)
- Opponent defensive rating per market (from team game logs)
- Minutes projection per player (requires injury / lineup data)
- Usage rate adjustment for teammate availability

Method:
- Joint distribution over (PTS, REB, AST) per player using a Gaussian copula calibrated from recent logs
- Same-game correlation: model team-level scoring shocks that multiply through teammate stats
- Two-step simulation: first sample game environment (pace, total), then sample player stats conditional on environment
- Calibration: isotonic regression on backtest pairs to map raw simulation P(over) to calibrated probability

Why this is better than v2:
- Same-game parlays get real probabilities instead of independence-assumption product
- Pace/defense adjustments capture matchup effects v2 ignores
- Calibration step keeps confidence-tier mapping honest

## Inputs catalog

What we need vs what we have, market-by-market:

| Input | Source | Currently available? | Phase to integrate |
|---|---|---|---|
| Projection mean | Existing model | ✓ | v1 |
| Recent10 game logs | nba_api / attach_recent10 | partial (12% coverage today) | v2 |
| Player-specific σ | computed from recent10 | needs coverage fix | v2 |
| Opponent def rating | nba_api advanced | not pulled | v3 |
| Pace | nba_api team stats | not pulled | v3 |
| Minutes projection | injury feeds + lineup | not pulled | v3 |
| Usage rate | nba_api | not pulled | v3 |
| Same-game correlation | derived from joint history | needs season aggregation | v3 |
| Game total / spread | The Odds API | available, not used | v3 |
| Rest days / B2B | schedule lookback | derivable from existing schedule cache | v3 |
| Injury status | balldontlie / news | not pulled | v3 (or before — affects every version) |

## Avoiding overfitting

Specific guardrails:

1. **Train/test split** — backtest must use slates strictly before the model's training cutoff. No data leakage.
2. **Out-of-sample validation** — hold out 20% of slates as final sanity check, never used during model tuning.
3. **Coarser categories first** — calibration buckets are tier-level (High/Medium/Low), not per-player, until sample size justifies finer granularity.
4. **Brier + log loss tracked together** — Brier alone can be gamed by predicting near 50%; log loss penalizes overconfidence.
5. **Walk-forward only** — never refit a model using future games to predict past games.
6. **Public changelog** — when the model changes, log the change date so backtest results stay attributable to a specific version.

## Backtest harness

Plan for `pipeline/backtest.py` in v2:
- Take a date range
- For each historical slate in that range, regenerate model leans (using only data available at slate time)
- Compare against settled outcomes
- Output per-confidence-tier hit rate, Brier, log loss
- Output calibration curve (forecast probability vs realized hit rate)
- Idempotent — safe to re-run

## UI integration plan

**v1 (now, behind a feature flag):**
- New "Simulation" tab on player cards (toggle off by default)
- Shows P(over) histogram from 5000 trials
- Marked "Experimental" — does not influence the lean recommendation

**v2 (~30 days):**
- Replace single-projection display with "projection ± uncertainty band" on every card
- Calibration page showing realized vs predicted hit rates over the last 30 days

**v3 (when proven):**
- Parlay Lab outputs simulated P(parlay hits) instead of independence-product
- Confidence tier mapping retuned from calibration curve

## Parlay Lab integration plan

Current Parlay Lab outputs an "edge score" derived from per-leg edges. v3 lets us replace this with:

- **P(parlay hits)** — from correlated joint simulation
- **Expected legs won** — useful for grading parlays even on losses
- **Correlation warning surface** — explicit display of which legs share game environment, with how much that adjusts the joint probability

Risk profile thresholds get re-derived from simulated outcomes rather than hand-tuned edge cutoffs.

## Risks and limitations

**v1 risks (current):**
- Normal assumption is wrong for low-mean / right-skewed markets (REB, AST, blocks)
- Independence assumption produces optimistic same-game-parlay probabilities
- variance_pct defaults are population averages — wrong for any specific player
- Mitigation: clearly mark "experimental", do not feed into confidence tiers

**v2 risks:**
- Recent10 has small sample (10 games) → high variance in estimated σ
- Bayesian shrinkage prior choice is itself a tuning knob
- Coverage gaps (low-minutes players) leave bootstrap pool empty
- Mitigation: shrinkage strength depends on coverage; show "low confidence" label when sample is insufficient

**v3 risks:**
- Copula structure is itself a model — poorly fit copula corrupts joint probabilities
- Calibration depends on having enough settled slates (probably 500+ for tier-level calibration to be stable)
- Pace/defense adjustments add modeling complexity that compounds error
- Mitigation: only ship v3 after v2's calibration plot is monotonic for at least 90 days of settled data

## Responsible-use wording for the UI

When simulation results appear on any user-facing page:

> **Simulation lab — experimental analytics.** These probabilities are estimates from a Monte Carlo model and depend on assumptions that may not hold for any specific player or game. They are not predictions of what will happen. They are not betting advice.

Bracket every probability with its uncertainty source: "5000 trials, ±X.X% sampling error". Refuse to display point probabilities to 4 decimal places — that creates false precision.

## Phase-by-phase rollout

| Phase | Action | Gate to next |
|---|---|---|
| **19 (now)** | v1 prototype shipped, hidden from production | Phase 20 |
| **20** | Wire v1 into UI behind a feature flag, "Simulation lab" page | 5+ slates settled with recent10 coverage > 70% |
| **21** | v2 bootstrap, backtest harness, calibration curve dashboard | v2 Brier < v1 Brier on out-of-sample slates |
| **22** | Replace production confidence tiers with v2 calibrated buckets | 30 days post-v2 with stable calibration |
| **23+** | v3 correlated simulation for Parlay Lab | v3 Brier < v2 Brier on out-of-sample slates |

Each gate is a hard requirement. **No promotion of an experimental model to production based on intuition or a single good week.**
