# First Research Dataset — Audit (2026-07-22)

The research warehouse produced its **first real ResearchObservations**. This is a data-correctness audit, **not** a model or a performance claim. Every row is a settled, officially-graded, leakage-safe market lean joined to real pregame features. No fabrication, no gate bypass. Portfolio md5 `affe6b21071f2b3be96bb2774eb347c3` untouched; Bank Builder / Moonshot / portfolio / settlement logic unchanged.

**Quality gate: PASS** (`research-observation-quality.mjs`) — 0 duplicate IDs, 0 pending, 0 missing outcomes, 0 future timestamps, 0 pregame leakage, 0 impossible stats.

---

## Total observations: 565

From the first-settlement cycle (`status/first-settlement-cycle.json`): 07-22 had **4 official-final games** with leakage-safe pregame market capture → 561 settled-eligible + 4 push = **565**. (07-21 was 14-final but had 0 pregame market capture — a coverage gap, 0 observations.)

### Breakdown by market
| group | market | observations |
|---|---|---|
| **Team** (20) | h2h (moneyline) | 4 |
| | spreads (run line) | 6 |
| | totals | 10 |
| **Pitcher** (45) | pitcher_outs | 27 |
| | pitcher_strikeouts | 10 |
| | pitcher_earned_runs | 8 |
| **Batter** (500) | batter_hits | 82 |
| | batter_total_bases | 99 |
| | batter_home_runs | 91 |
| | batter_hits_runs_rbis | 80 |
| | batter_rbis | 74 |
| | batter_runs_scored | 74 |

### Settlement outcomes
win **232** · loss **329** · push **4** (base rate ~41% win — reflects mostly Over player-prop leans against real box scores; **not** a performance claim).

### Feature coverage (of 565 observations, avg coverageScore 0.862)
| family | coverage |
|---|---|
| pitcher_status | 100% |
| lineup | 100% |
| bullpen | 100% |
| batter_matchup | 100% |
| park_factors | 100% |
| environment | 100% |
| batter_splits | 88% |
| batter_form | 88% |
| batter_vs_pitcher | 88% |
| plate_appearance_opportunity | 88% |
| market_probability (de-vig) | 80% |
| **pitcher_workload** | **0%** |
| **team_offensive_form** | **0%** |

### Missing / gaps to close
- **`pitcher_workload` 0%** — the family captured but no record attached as researchEligible for these 4 games (freshness/eligibility timing). Investigate the workload capture cadence.
- **`team_offensive_form` 0%** — newly wired this pass; no eligible capture existed pregame for 07-22 (script added mid-slate). Future dates will carry it (the assembler now attaches it per-team).
- **`market_probability` 80%** — 20% of leans lack a de-vig probability (the snapshot didn't price both sides). Honest null; those rows are excluded from market-baseline benchmarking, not from the dataset.

## Market baselines (Phase 7 — computed, NOT a model)
`mlb-research-benchmark.mjs` on the settled set (n=561): **de-vig market** Brier **0.2387**, logLoss **0.671**, accuracy **50.6%**; **sportsbook-implied** Brier 0.25, accuracy 41.4%. These are the baselines any future model must beat out-of-sample — **no model exists**, and the benchmark status stays **INSUFFICIENT**.

## Gate status — still BLOCKED
Observations **561/500** (count target met), but distinct observation **dates 1/30** — the **dates gate binds**. `modelingStatus: BLOCKED`; no model, no edge, no profitability claim. The first milestone — *a clean, labeled, timestamp-correct dataset* — is reached; the modeling gate is not, and won't be until 30 dates accumulate + out-of-sample validation + founder approval.
