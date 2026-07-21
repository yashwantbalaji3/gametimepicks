# MLB Incremental-Signal Research — initial scope (2026-07-21)

## Recommendation

```
ACQUIRE_BETTER_PREGAME_DATA
```

The one feature family we could test leakage-safely (pitcher workload) adds **no** value beyond the market, and the other four families **cannot be tested at all** because we do not archive their pregame values. The binding constraint is data, not modeling. Everything remains internal; nothing changed publicly; no product eligibility restored; money untouched (md5 `affe6b21071f2b3be96bb2774eb347c3`).

## Executive answers (Phase 19)

1. **Which families had sufficient pregame coverage?** Only **pitcher_workload** (derivable from StatsAPI game logs, strictly-earlier starts).
2. **Which were rejected for timestamp / leakage risk?** **confirmed_lineup, bullpen, plate_appearance_opportunity, environment** — none are archived pregame. Historical lineups/bullpen/weather exist only in *postgame* data; using them would be leakage, so they were **not built** (INSUFFICIENT_PREGAME_COVERAGE).
3. **Did any single family beat the market on both Brier and log loss?** **No.**
4. **Did uncertainty support any improvement?** No — the workload holdout ΔBrier was **+0.0033** (worse), 95% CI [−0.0009, +0.0073] straddling/above 0.
5. **Stable across folds?** No — the workload challenger was **worse than market-only on the walk-forward** (Brier 0.2466 vs 0.2432).
6. **Did any combination beat its best single family?** N/A — no single family passed, so no combination was run (per protocol).
7. **Did the legacy model add value after the new features?** N/A this scope; the prior recalibration already showed the legacy model has no value beyond the market.
8. **Learning new info or reconstructing the market?** Neither helped — the frozen workload coefficients are ~0 (`recentIP −0.106` and `recentBF +0.098` nearly cancel; collinear, no signal). The market already prices pitcher workload.
9. **Markets remaining MARKET_CONTEXT_ONLY:** batter_hits, batter_total_bases, batter_hits_runs_rbis (3); pitcher_strikeouts stays INSUFFICIENT_OUT_OF_SAMPLE_DATA.
10. **Validated modeled product legs:** **0.**

## Data protocol

Market-**offset** formulation: `logit(p_final) = logit(p_market) + residual(features)` — the challenger predicts only the residual, directly answering whether the feature adds information the market lacks. 43 settled dates; selection region (first 34) with expanding-window walk-forward for selection; frozen 9-date holdout. De-vig proportional; date-clustered bootstrap (2,000×). **Timestamp guard:** every feature derived strictly from starts dated before `commenceTime` (0 failures).

## Market-level results

| market | featureFamily | nWalkForward | nHoldout | coverage | marketBrier (WF) | challengerBrier (WF) | ΔBrier (holdout) | verdict |
|---|---|---|---|---|---|---|---|---|
| pitcher_strikeouts | pitcher_workload | 441 | 196 | 98.6% | 0.2432 | 0.2466 | +0.0033 [−0.0009, +0.0073] | **MARKET_CONTEXT_ONLY** family = NO_INCREMENTAL_VALUE; market = INSUFFICIENT_OUT_OF_SAMPLE_DATA (196<500) |
| batter_hits | — | — | — | — | — | — | — | not testable (no pregame feature archive) → stays MARKET_CONTEXT_ONLY |
| batter_total_bases | — | — | — | — | — | — | — | stays MARKET_CONTEXT_ONLY |
| batter_hits_runs_rbis | — | — | — | — | — | — | — | stays MARKET_CONTEXT_ONLY |

## Feature-family coverage / verdicts

| family | source | pregame proven | coverage | verdict |
|---|---|---|---|---|
| confirmed_lineup | none archived | ❌ | — | INSUFFICIENT_PREGAME_COVERAGE |
| pitcher_workload | StatsAPI gameLog (strictly-earlier) | ✅ | 98.6% (945/958) | **NO_INCREMENTAL_VALUE** |
| bullpen | none archived | ❌ | — | INSUFFICIENT_PREGAME_COVERAGE |
| plate_appearance_opportunity | team-markets (4 dates only) | ❌ | — | INSUFFICIENT_PREGAME_COVERAGE |
| environment | none archived | ❌ | — | INSUFFICIENT_PREGAME_COVERAGE |

## Negative finding (stated directly)

**Pitcher-workload features (days rest, recent innings, recent batters faced, recent K rate) did not improve strikeout probability beyond the market — the challenger was worse than market-only out of sample. The market already prices pitcher workload. The confirmed-lineup, bullpen, plate-appearance-opportunity, and environment families could not be tested at all: we do not archive their pregame values, and reconstructing them from postgame data would be leakage.**

## What "acquire better pregame data" means (the actionable path)

To honestly test whether new information beats the market, we must **start archiving pregame snapshots at board-generation time, going forward** — capturing, before first pitch and with timestamps:
- confirmed lineups + batting order (once posted);
- projected pitch counts / probable-pitcher workload plan;
- bullpen availability (arms used in prior days);
- team totals / game totals across the full slate (currently only 4 dates archived);
- forecast weather / roof status / umpire assignment.

Then re-run this framework on a **fresh future-only holdout** in several weeks. No modeling change can substitute for data that was never recorded pregame.

## Status (unchanged — enforced)

- `PUBLIC_MODEL_OK` markets: **0.** Validated modeled BB/Moonshot legs: **0.** Product eligibility: unchanged.
- Bank Builder / Moonshot: paper/review only; active legs still flagged. No public UI change; served output unchanged. No money/settlement change.
- Artifacts: `data/internal/mlb/challengers/*.json` (`public:false`, `approvedForProduction:false`, never served). Harness: `app/scripts/research-mlb-incremental-signals.mjs`. Guards: `app/src/lib/mlb-challenger-guards.test.mjs`.
