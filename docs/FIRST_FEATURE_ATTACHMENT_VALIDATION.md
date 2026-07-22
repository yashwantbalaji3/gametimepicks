# First Feature Attachment Validation — status & plan

Validates that `pitcher_workload` + `team_offensive_form` attach **>0%** once a slate with pregame captures finalizes. No modeling, no money change (md5 `affe6b21071f2b3be96bb2774eb347c3`).

## Status: TIME-GATED

The real forward validation requires a slate that (a) was captured pregame and (b) has finalized. As of this pass:
- **2026-07-22** — finalized (4 games → 565 observations), but its `pitcher_workload`/`team_offensive_form` captures ran **once, late** (after first pitch) → 0% (unrecoverable; never fabricated).
- **2026-07-23** — **5 games, all Scheduled (not final), not yet captured.** Cannot settle → cannot validate attachment on real observations yet.

So the loop closes on the **next slate that is both captured pregame and finalized** — not manufacturable now without fabrication.

## Evidence the fix works (forward capture, dry-run)

Captured 2026-07-23 pregame (before first pitch): **pitcher_workload 5/5 eligible · team_offensive_form 10/10 eligible** (100%). This proves the multi-cadence, eligible-only capture + the `latestEligibleWorkload` / freshest-eligible resolvers produce **attachable** records forward — the mechanism is correct; only a finalized, pregame-covered date is missing.

## Expected result (when it runs)
On the first slate captured pregame **and** final:
```
07-22 pitcher_workload coverage: 0%   (late capture)
07-NN pitcher_workload coverage: >0%  (pregame capture → eligible → attached)
```
The automated `feature-attachment.json` (with `trendByDate`) will show the family flip from GAP to OK, and `capture-window-health.json` will show that date's `windowHealthScore` at/near 1.0. **No historical rewriting** — 07-22 stays 0% honestly.

## How to run it (operator, when the date is final)
```
node app/scripts/join-mlb-pregame-settlements.mjs   --today <date> --lookback 1 --write
node app/scripts/build-mlb-research-observations.mjs --today <date> --lookback 1 --write
node app/scripts/research-observation-quality.mjs
node app/scripts/feature-attachment-dashboard.mjs      # compare trendByDate[<date>].pitcherWorkload vs 07-22
```
(All are wired into `mlb-pregame-capture` and run automatically on the cron `--lookback 3` window; this is only for an explicit on-demand check.)
