# Daily Freshness SLO & Observer Guard (Program 100-103 Lane H)

The incident ran 62 hours despite every failure alerting correctly. The gap was not *wiring* —
it was that nothing distinguished "a workflow failed once" from "**the product has had no
current board for three days**". This lane closes that.

## Freshness state machine (what the observer must distinguish)

`NO_SCHEDULE` → `SCHEDULE_READY_AWAITING_MARKETS` → `PARTIAL_PREGAME_COVERAGE` →
`CURRENT_BASE_BOARD` → `CURRENT_WITH_PATCHES` → `GAMES_IN_PROGRESS_BOARD_FROZEN` →
`AWAITING_SETTLEMENT` → `SETTLED`

versus the failure states `STALE` and `FAILED`.

**The governing principle: a partial but current Aug 3 state is healthier than a fully populated
Aug 1 page.** `SCHEDULE_READY_AWAITING_MARKETS` on today's date is a *healthy* state; a complete
board from three days ago is not.

## SLO (evidence-backed, not a marketing claim)

| Condition | Expectation | Escalation |
|---|---|---|
| Board exists for the current ET slate date | by 11:00 ET on a scheduled slate day | WARN at 11:00, **CRITICAL at 14:00 ET** |
| Newest settled date ≥ current ET date − 1 | after the nightly window | WARN ≥ 2 days, CRITICAL ≥ 3 |
| Public contract `asOfSettledDate` == ledger newest settled | always | CRITICAL on publish (gate), WARN in generate |
| Generator fails on N consecutive scheduled days | never | **CRITICAL from N = 2** — the missing escalation this incident needed |

## What the observer already catches, and what was added

The observer already computed board age (`STALE_BOARD_DAYS = 3`) and reported
`newest board 2026-07-31 (3d old)` — it *was* saying the right thing; nobody was reading it
daily. The durable fix is therefore **push, not pull**: the freshness condition must escalate
through the already-proven OPS webhook rather than waiting to be observed.

Recommended (implemented as the observer's verdict input; alerting wired via the existing
`ops_alert.sh` WARNING kind — no new vendor, no new channel):

1. **Repeat-failure escalation** — a scheduled generator failing on 2+ consecutive slate days is
   CRITICAL, distinct from a single transient failure.
2. **Stale-with-healthy-runs detection** — the most dangerous shape this incident had: many
   workflows green while no current artifact exists. Alert on *"scheduled slate day + successful
   runs + no board for today"*, which no single-run failure alert can express.
3. **Data-commit-without-deployment** — a generated-data commit whose change class requires a
   build but produced no canonical deployment.

## Ownership (unchanged, re-verified this incident)

One scheduled board-generation owner (`morning-projections`) · one scheduled settlement writer
(`nightly-settle`) · append-only top-up may add future-event rows but never regenerates a
started slate · watchdog is recovery-only and checks active writers first · retired
`daily-rebuild` stays retired. All verified intact during this incident — the ownership model
held; only the gate scoping was wrong.
