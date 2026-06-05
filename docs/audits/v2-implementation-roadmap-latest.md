# V2 Implementation Roadmap (2026-06-05)

> Internal only. V2 is NOT live and has NO public surface. Status after the
> learning-feedback audit across 8 settled slates. No paid API, no live wiring.

## Current verdict: `v2_not_ready` — 0 corrected launch candidates
Across 8 settled dates (2026-05-27 → 2026-06-04): MLB 3743 + NBA 794 decided
legs, de-vig-able overall N = 4537. Baselines: generated pool 87W/514L (14.5%),
published cards 19W/84L (18.4%).

**No segment clears the hardened launch gates** (`classifyCandidate`): bucket
N ≥ 40, overall N ≥ 250, beats de-vig OOS, naive CI lower > de-vig, **Bonferroni-
corrected** CI lower > de-vig, adjusted p < α, date-split stable, not single-date
dependent, not edge/confidence-driven, leakage clean.

### Shadow-watchlist segments (clear naive CI only — NOT launch)
| segment | N | rate | de-vig | pAdj | dates+ | failed gates |
|---------|--:|-----:|-------:|-----:|-------:|--------------|
| nba_market_PTS | 294 | 56% | 49.7% | 0.327 | 3/3 | corrected_ci, adjusted_p, single_date_overdependence |
| nba_market_REB | 268 | 59% | 50.1% | 0.058 | 3/3 | corrected_ci, adjusted_p, single_date_overdependence |
| mlb_l5_5of5 | 253 | 63% | 56.6% | 0.495 | 6/8 | corrected_ci, adjusted_p, single_date_overdependence |

All three look attractive on the naive 95% CI but collapse under multiple-
comparison correction + single-date leave-one-out. NBA segments only have 3 dates
(can't establish stability). The MLB L5 5/5 family is the most-watched but the
adjusted p (0.495) is nowhere near significant.

## Why V2 stays internal
The honesty bar is "beats the de-vigged market out-of-sample after multiple-
comparison correction, stably across dates." Nothing meets it yet. Publishing any
of the above as an edge would be a false claim. The market is efficient on these
props at the sample sizes we have.

## What would change the verdict (gate-by-gate)
1. **More settled dates** — single-date dependence + 3-date NBA samples are the
   biggest blockers. Each new settled slate adds a date for the leave-one-out.
2. **A segment with a real, persistent edge** — would need corrected-CI lower
   bound above de-vig AND ≥70% of dates positive AND adjusted p < 0.05.
3. **Better features** — confirmed-starter, batter handedness/platoon, NBA
   modelProb/recentSeries (currently missing/unreliable) could define new
   segments; none available without pipeline work.

## Safe infrastructure already in place (default-OFF)
- `app/src/lib/v2-candidate-gates.ts` — `classifyCandidate` + hardened gates
  (Wilson, Bonferroni `correctedZ`, Poisson-binomial adjusted p, single-date LOO).
- `app/src/lib/v2-watchlist-rules.ts` — `ENABLE_V2_SHADOW_CANDIDATE = false`,
  `classifyV2WatchlistLeg`, `isV2WatchlistOnly`, `assertNotPublicReady`,
  fail-closed on missing data. Tested.
- `app/scripts/audit-v2-{end-to-end-readiness,candidate-search,dataset-inventory,watchlist}.mjs`
- **NEW:** `app/scripts/audit-v2-learning-feedback.mjs` — settled-only learning
  dataset, leakage-guarded (active slate excluded), per-segment hardened gates,
  active-slate watchlist (no outcomes). Default-off, audit-only.
- Test coverage (existing): hard-off switch, rule match/fail-closed, corrected-gate
  behavior, date volatility + single-date blocks, leakage hard block,
  `assertNotPublicReady`. These already lock every Phase-5 invariant — extended,
  not duplicated.

## Path to a (possible) future launch — STOP-gated
1. Keep accumulating settled slates; re-run `audit-v2-learning-feedback` each.
2. If a segment EVER returns `launch_candidate` (all corrected gates pass): the
   audit prints `!! LAUNCH CANDIDATE` and the operator must review the full
   evidence (N, W/L, de-vig, naive+corrected CI, adjusted p, date stability,
   LOO, active-slate matched legs, implementation + rollback) — **STOP for
   approval before any live wiring.**
3. Only then: build the active-slate apply path behind `ENABLE_V2_SHADOW_CANDIDATE`
   (still defaulting off), shadow-grade it for ≥N dates, and re-confirm before
   flipping the flag.
4. Public copy stays neutral throughout — no "v2 / new model / edge / better hit
   rate" language until a corrected candidate is live-validated AND approved.

*Internal roadmap. No live wiring. No public claims. No data/model/grading change.*
