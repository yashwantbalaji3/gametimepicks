# Feature Attachment Audit (2026-07-22, 565 observations)

Every feature family traced end-to-end: **capture → stored → loaded → attached → coverage**. Read-only audit; no modeling, no money change (md5 `affe6b21071f2b3be96bb2774eb347c3`). This audit **gates new-feature work** — per the mission, attachment must be correct before adding families.

## Attachment table

| family | capture files (07-22) | attach % (of 565 obs) | missing reason | status |
|---|---|---|---|---|
| pitcher_status | (in snapshots) | **100%** | — | ✅ |
| lineup | 75 (multi-cadence) | **100%** | — | ✅ |
| bullpen | 17 | **100%** | — | ✅ |
| batter_matchup | 17 | **100%** | — | ✅ |
| park_factors | 17 | **100%** | — | ✅ |
| environment | (in snapshots) | **100%** | — | ✅ |
| batter_splits | 153 | **88%** | 12% of prop rows are for batters not in the split universe | ✅ (expected) |
| batter_form | 153 | **88%** | same | ✅ |
| batter_vs_pitcher | 153 | **88%** | insufficient H2H sample for some batters | ✅ (expected) |
| plate_appearance_opportunity | 153 | **88%** | derived from form+lineup; absent where those are | ✅ (expected) |
| market_probability | — | **80%** | 20% of leans lack a de-vig price (snapshot didn't price both sides) | ✅ (honest null) |
| **pitcher_workload** | 17 | **0% → FIXED** | single-file overwrite; the only capture was post-start (ineligible) | ⚠️ **fixed (this pass)** |
| **team_offensive_form** | 18 | **0%** | eligible-only, but the only capture was post-start for the 2 observation games | ⚠️ **cadence gap** |

## Root cause of the two 0% families — a **capture-cadence gap**, not an attachment bug

On 2026-07-22 the pregame feature captures ran **once, late (capturedAt 20:07:45 UTC)**. The two games that finalized first and produced the 565 observations (824083 @ 18:10Z, 823761) had **already started** by 20:07, so their workload/team-form captures were **ineligible** (`capturedAt ≥ eventStartTime` = leakage). The assembler correctly refused them. Families that were **100%** (lineup, bullpen, matchup, park, pitcher_status/environment) either capture multi-cadence (lineup) or were captured earlier / are venue-static.

Two distinct problems:
1. **pitcher_workload was single-file, overwriting** (`<gamePk>.json`) — a late capture could destroy an earlier eligible one. **Fixed:** now **multi-cadence, eligible-only** (`<gamePk>-<capturedAt>.json`, like lineup/batter-form); the assembler picks the latest eligible via `latestEligibleWorkload` (backward-compatible with the legacy single file). Verified: 07-23 dry-run = 5/5 eligible; 07-22 stays honestly 0% (no earlier eligible capture exists — cannot be fabricated).
2. **Capture-cadence coverage** — the early crons did not land a pregame capture before the earliest first pitch on 07-22. This is the real recurring risk; the accumulation reliability monitor (`market-capture-reliability.json`) surfaces days with a coverage gap so it never silently repeats.

## Decision: attachment before features

Per the mission's own rule ("do not add new features until attachment is correct"), this pass **fixes attachment + hardens monitoring** and **defers** free features #2–4 (opponent defensive context, travel/rest, bullpen roles) to a forward slate where the multi-cadence + earlier-cron coverage is validated end-to-end (a family added now would inherit the same cadence gap and land 0% again). Their specs remain in `MLB_FEATURE_COVERAGE_ROADMAP.md`, ready to implement on the `team_offensive_form`/`pitcher_workload` template once a clean date confirms attachment.
