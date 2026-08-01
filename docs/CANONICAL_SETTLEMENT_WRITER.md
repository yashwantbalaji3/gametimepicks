# Canonical Settlement Writer (Program 092-095 Lane E — DECIDED)

**The one scheduled settlement writer is `nightly-settle` (05:30 + 07:30 UTC).**

## Writer inventory (complete)

| Writer | Trigger | Unique responsibility | Overlap | Success evidence | Disposition |
|---|---|---|---|---|---|
| `nightly-settle` | cron 05:30+07:30 UTC + dispatch | official MLB settlement, linescores, product settlement, track record, calibration export, learning policy, corpus, **public research contract**, health gate, commit/push | — | proven daily cycles; alert-wired; serialized; pipefail-live | **CANONICAL** |
| `daily-lifecycle` | was cron 08:30 UTC | full roll (settle→generate→gate→deploy→smoke→report) — but `ENABLE_AUTONOMOUS_DEPLOY` unset meant even green runs stopped pre-deploy | re-ran the whole settle nightly-settle had just completed | 6 consecutive gate failures producing nothing | **cron removed** → manual recovery tool (dispatch preserved, now alert-wired) |
| `mlb-daily-production` / `morning-projections` | cron/chain | generation + completion (pregame) | none on settlement writes | healthy | keep (not settlement writers) |
| `auto-refresh` | cron 9×/day | recent10 hydrate + settled-results re-EXPORT (derived read-model, not ledger writes) | none on the ledger | first green today | keep |
| `ufc-post-card` etc. | dispatch-only | archive settlement (non-MLB, dormant) | none scheduled | — | dormant |

## Enforcement (not just documentation)

`app/src/lib/settlement-writer-ownership.test.mjs`:
1. Exactly `[nightly-settle.yml]` may have an active cron AND reference a settlement entry point
   (`automation_settle.sh` / `roll_to_next_day.sh` / `settle_mlb_results`) — a second scheduled
   writer OR zero scheduled writers fails the suite.
2. `daily-lifecycle` must keep `workflow_dispatch` (recovery path) and must not silently regain a
   schedule.
3. Retired `daily-rebuild.yml` must stay retired.

## Post-settlement outputs

All required post-settlement outputs (corpus, sidecar, contract, brief, health, publish) already
ride the canonical path inside nightly-settle, and the new `research-contract:stale` health-gate
check makes the publish refuse if any of them left the public contract behind the ledger.
