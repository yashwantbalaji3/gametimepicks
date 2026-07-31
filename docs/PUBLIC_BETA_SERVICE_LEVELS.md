# Public Beta — Operational Service Levels

**Program:** 080–083 · Thresholds chosen from measured workflow behavior (the last four days of runs), not aspiration.

| Service | Level | Basis (measured) |
|---|---|---|
| Board availability | committed ≥ 60 min before the earliest first pitch | boards have landed 25 min–13 h pregame; 60 min is the floor the capture cadence supports |
| Downstream completeness | all 5 artifact families within 30 min of the board | mlb-daily-production chains off morning-projections and has completed in 8–15 min |
| Settlement completion | settled ledger advanced by 10:30 ET the morning after the slate | scheduled nightly-settle ran 04:15/06:06/08:14/10:04 ET clean on 07-31 |
| Public artifact freshness | terminal contract + daily brief same run as settlement | exporter is in the settle workflow (Sprint 048) |
| Alert dispatch | within the failing run itself | `if: failure()` step; delivery pending the founder secret |
| Stale-state rendering | never an old slate under today's heading | freshness registry + liveness banners; guard-tested |

## Incident classes and today's two live examples

Classes: `DATA_NOT_AVAILABLE · GENERATION_FAILED · PARTIAL_COVERAGE · SETTLEMENT_BLOCKED · IDENTITY_CONFLICT · PUBLISH_FAILED · ALERT_DELIVERY_FAILED · ANALYTICS_DATA_QUALITY`.

**Incident 2026-07-31 A (`DATA_NOT_AVAILABLE`, closed by design):** scheduled `mlb-pregame-capture` 12:54Z — the research observation-quality gate found `duplicateIds: 2` in the day's join and **refused to commit leaked data**. User impact: none (public surfaces unaffected; internal research join skipped one capture). Containment: automatic — the gate discards, the next scheduled capture retries fresh. Follow-up: if `duplicateIds` recurs on the next runs, pull the discarded artifact from a CI run to identify the colliding ids. Prevention already in place: this is the fail-closed path working.

**Incident 2026-07-31 B (`PUBLISH_FAILED` secondary path, contained):** scheduled `daily-lifecycle` 11:07Z — its in-workflow test gate hit the known concurrent-tree flake class (analytics NOOP tests + admin-status consistency failing only while a bot push mutates the tree mid-suite) and **correctly refused its deploy step**. User impact: none (Vercel deploys on push independently; `daily-rebuild` succeeded 29 min later). Prevention: the writer queue now serializes generators; the lifecycle's test step racing *bot pushes* remains a named limitation — its gate is conservative in the right direction (refuses, never ships on red).

Both alerts died at `OPS_WEBHOOK_URL unset` — the founder action's cost, measured twice more today.
