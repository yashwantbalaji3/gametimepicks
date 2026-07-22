# Forward Validation Report — capture reliability on future slates

Proves the warehouse **reliably accumulates clean observations on future slates**, and that the pitcher_workload + team_offensive_form cadence fixes work forward. No modeling, no money change (md5 `affe6b21071f2b3be96bb2774eb347c3`). Bank Builder / Moonshot / portfolio untouched.

## Lifecycle (the forward slate: 2026-07-23)

```
pregame capture ──► freeze ──► first pitch ──► final status ──► settlement join ──► research observations
    ✅ VALIDATED       (auto)     (future)        (future)          (auto, --lookback 3)     (auto)
```

Forward capture is validated **now** (before first pitch); settlement + observations are **time-gated** until 07-23's games finalize — at which point the wired `mlb-pregame-capture` cron joins + assembles them automatically (proven on 07-22 = 565 observations).

## Forward-capture proof (dry-run, 2026-07-23 — 5 scheduled games)

| family | result | interpretation |
|---|---|---|
| pitcher_workload | **5/5 eligible** | captured pregame ⇒ `capturedAt < eventStart` ⇒ eligible. The multi-cadence fix produces attachable records forward. |
| team_offensive_form | **10/10 eligible** (2 teams × 5 games) | same — eligible pregame. |

Contrast with **2026-07-22**, where the same families landed **0%** on the settled observations: there the captures ran **once, late (20:07 UTC)**, after the two games that finalized first had already started (leakage → correctly excluded). Forward, captured pregame, they are **100% eligible**. The 0% was a cadence artifact of a single late run, not an attachment bug — and it is unrecoverable for 07-22 (no earlier capture exists; never fabricated).

## Feature attachment (automated — `status/feature-attachment.json`, of 565 obs)

| family | capture | eligible | attach % | status |
|---|---|---|---|---|
| lineup / bullpen / matchup / park / pitcher_status / environment | — | — | **100%** | OK |
| batter_splits / form / vs_pitcher / pa_opportunity | 156 | 156 | **88.5%** | OK (universe/sample) |
| market_probability | — | — | **80.2%** | OK (honest null) |
| **pitcher_workload** | 26 | 18 | **0%** | GAP — eligible captures exist, but for games other than the 2 that settled (cadence) |
| **team_offensive_form** | 18 | 18 | **0%** | GAP — same cadence reason |

## Reliability + health (`status/market-capture-reliability.json`)

| date | final | market snaps | observations | health | note |
|---|---|---|---|---|---|
| 2026-07-21 | 14/15 | 0 | 0 | **0.2** | ⚠️ LOST — final slate, no market capture |
| 2026-07-22 | 4/17 | 18 | 565 | **1.0** | contributed |

`dailyResearchHealthScore` (latest) = **1.0**; average = 0.6. A *data-collection* health signal (markets · observations-if-final · cadence), **not** a model score.

## Fixes shipped this pass
- **pitcher_workload**: multi-cadence + eligible-only capture; assembler `latestEligibleWorkload` (legacy-compatible). Regression test: a late ineligible capture cannot hide an earlier eligible one (`mlb-pitcher-workload-cadence.test.mjs`, 4/4).
- **team_offensive_form**: converted to multi-cadence + eligible-only; resolver now picks the **freshest eligible** per side and filters `researchEligible`.
- **feature-attachment-dashboard.mjs** + **daily research health score** — both wired into `mlb-pregame-capture`.

## Remaining blockers & decision on new features
- **Dates gate: 1/30** — the binding constraint; accumulates one qualifying (final + market-covered) date at a time.
- **Cadence coverage** — the pregame captures must land before the earliest first pitch; the monitor now flags any recurrence. The 07-23 dry-run confirms the mechanism.
- **New free features (#2–4) deferred** — per the mission's gate ("only after attachment audit passes"), and because the two most-recently-wired families (pitcher_workload, team_offensive_form) still read **0% on settled observations** (cadence, forward-only). Adding a third now would inherit the same gap. They are validated to *capture* eligibly forward; once a clean forward slate finalizes and shows them attaching >0%, add #2–4 on the same template. Specs remain in `MLB_FEATURE_COVERAGE_ROADMAP.md`.
