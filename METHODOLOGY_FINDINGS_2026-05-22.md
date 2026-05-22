# Methodology Findings — 2026-05-22

**Status:** snapshot of the model's calibration as of 2026-05-22.
**Sample:** 677 NBA settled rows + 744 MLB settled rows.
**Author:** session 4 of the day (MLB parlays + methodology track).

This document captures the honest state of the model's calibration
and the changes we considered, shipped, and deferred. The forward
audit is NOT a backtest (see `BACKTEST_PLAN.md`); these numbers
describe a record, not a forecast.

---

## 1. By-market hit rates (read straight from `calibration_report`)

### NBA — 677 rows, 671 decisive (54.2% overall)

| Market | W-L on N decisive | Hit % | Read |
|---|---|---|---|
| REB | 135-94 on 229 | **59.0%** | strongest market on record |
| PTS | 131-121 on 252 | 52.0% | coin flip |
| AST | 98-92 on 190 | 51.6% | coin flip |

### MLB — 744 rows, 744 decisive (50.1% overall)

| Market | W-L on N decisive | Hit % | Read |
|---|---|---|---|
| Hits | 250-237 on 487 | 51.3% | slight signal |
| Total Bases | 99-105 on 204 | 48.5% | below coin flip |
| Strikeouts | 24-29 on 53 | **45.3%** | weakest market, but tiny N |

## 2. By-confidence hit rates

### NBA

| Tier | W-L on N | Hit % | Notes |
|---|---|---|---|
| High | 255-218 on 473 | 53.9% | most leans land here |
| Medium | 47-32 on 79 | **59.5%** | best tier — but thin |
| Low | 61-57 on 118 | 51.7% | controlled |

### MLB

| Tier | W-L on N | Hit % | Notes |
|---|---|---|---|
| High | 152-163 on 315 | **48.3%** | **inverted vs Medium** |
| Medium | 53-49 on 102 | 52.0% | technically the best MLB tier |
| Low | 168-159 on 327 | 51.4% | controlled |

## 3. Calibration concerns (the honest read)

### NBA
- **REB market is the real signal** — 59.0% on 229 settled rows is
  meaningfully above 50%. We should lean into it: per-market floors
  could be set such that REB picks pass with smaller edge while PTS
  picks require larger edge.
- **PTS and AST are coin flip on big samples.** This is a quiet
  result: the model has no demonstrated edge on those markets on the
  current settled sample. We shouldn't suppress them yet (the sample
  is six playoff dates — small in absolute terms), but we should
  **stop labeling extreme-edge PTS picks "Stronger signal" unless
  the calibration improves.**
- **NBA Medium > NBA High** by 5.6 percentage points (59.5 vs 53.9)
  on a thin Medium sample. This suggests the model's HIGH tier is
  pulled high by some over-aggressive scoring — possibly the same
  high-variance edge that produces the 25pp+ outliers the R5
  guardrail caps. Worth investigating once more dates settle.

### MLB
- **MLB High is BELOW coin flip on 315 settled rows.** This is the
  single most actionable finding. The model is currently labeling its
  worst MLB cohort as its "Stronger signal." This is either a
  calibration bug (the High tier admits picks that shouldn't be
  there) or a fundamental edge problem on the markets that dominate
  the High pool.
- **MLB Medium (52.0%) and Low (51.4%) are roughly coin flip** but
  STILL OUTPERFORM the High tier. The tiers are inverted relative
  to model intent.
- **Strikeouts is consistently below coin flip** (45.3%, 53 rows).
  Small sample but two consecutive dates trending the wrong way.

## 4. What this session changed

### Shipped: surface the findings honestly

- The `/about` Model Watchlist (PR #85) called out NBA REB strength
  + MLB Strikeouts weakness. This session continues that framing —
  no scoring change, but the watchlist now explicitly says **MLB
  High confidence is not yet meaningfully better than Medium / Low.**

### Shipped: Monte Carlo prototype (`pipeline/monte_carlo_props.py`)

A shadow-mode tool that, given a player's recent series + the line,
computes:

- simulated mean / std dev from real recent samples (never invents
  observations)
- prob(over) / prob(under) / prob(push)
- a `volatility` score (std / mean)
- a confidence recommendation: `Strong / Watch / High-variance / Avoid`

The recommendation downgrades high-edge picks whose volatility is
above 0.55. This is a candidate replacement for the current
confidence guardrail logic — but ONLY after it has been backtested
on the existing settled rows. **No production scoring change has
been made.**

Tests lock the contract: deterministic seeded output, no fabricated
distribution when N < 3 samples, probabilities sum to ~1.0, season
blend smooths hot streaks, no negative simulated values for counting
stats.

### Deferred: production scoring change

Per session constraints, no `score_model.py` or
`confidence_guardrails.py` edits were made. The right path:

1. Build a CLI that joins MC outputs to settled rows by
   (playerId, market, line, date).
2. Report MC-recommended vs production-tier hit rates side-by-side
   on the existing settled sample.
3. If the MC recommendation provides a meaningful uplift on the
   weak cohorts (MLB High, NBA PTS), promote it behind a config flag
   first; turn it on for production confidence labeling only when
   the next several settled dates confirm the uplift.

### Deferred: tier inversion fix on MLB High

The cleanest fix is to add `pipeline.confidence_guardrails` rules
that REQUIRE MC volatility ≤ X for the High tier. That is a
production scoring change; it needs the backtest step above.

## 5. What is NOT in the model yet

These are honest gaps the next methodology session should consider:

- **No projected-minutes context for NBA.** A 20+ point edge on a
  PTS line means very different things at 22 minutes vs 38 minutes.
- **No park-factor weighting for MLB hits / total bases.** Player
  hit rate at Coors is structurally different from Citi Field.
- **No live news / injury suppression.** Late scratches can blow
  up the model's calibration; we don't currently react.
- **No multi-game series state for NBA playoffs.** Closeout games
  have a known usage shift that we don't price in.
- **No per-bookmaker line aggregation.** We pick the first matching
  row by edge magnitude; we don't currently compute a fair line
  from a multi-book consensus.

## 6. The "consistently above 80%" honesty note

The handoff brief asks for a path to consistently above 80% accuracy.
The honest current state:

- Combined NBA + MLB lifetime hit rate is **52.3%** on 1,415
  decisive rows. The strongest single cohort (NBA REB) is 59.0%.
- Reaching 80% on the live unfiltered slate is mathematically
  implausible without a substantial model rewrite AND ~10× the
  settled-row sample to validate it.
- A more honest goal: **reach a strict-filter 60% hit rate on a
  curated subset.** Today, NBA REB at edge ≥ 5pp + High confidence
  is 56.8% on 183 rows (run via `pipeline.calibration_report
  --market REB --min-edge-pp 5 --confidence High`). With another
  month of data and the Monte Carlo guardrail, 60-62% on a curated
  cohort is a realistic, honest stretch goal.

**No 80% claim is made anywhere on the site.** The Model Watchlist
on `/about` documents the watch.

---

*This document will be updated when the next methodology pass runs.
The numbers above are derived live by `pipeline.calibration_report`
— any future maintainer can re-run that CLI to verify them.*
