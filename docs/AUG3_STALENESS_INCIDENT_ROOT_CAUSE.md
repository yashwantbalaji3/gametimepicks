# Aug 1–3 Staleness Incident — Root Cause (Program 100-103)

**Classification: MULTI_LAYER_INCIDENT** (latent `PUBLIC_CONTRACT_STALE` + `GENERATION_FAILURE`
blast radius). **Duration: 2026-08-01 10:42 ET → 2026-08-03 ~00:40 ET (~62 hours).** Public
symptom: every current-slate surface served the 2026-07-31 board.

## The first broken edge

`SCHEDULE → PREGAME CAPTURE → **BOARD** → …` — the chain broke at BOARD GENERATION on Aug 1.
Everything downstream (no settlement, no sims, stale contract, stale public routes) is a symptom.

## The two layers

**Layer 1 — latent, pre-existing since Sprint 050 (`PUBLIC_CONTRACT_STALE`).**
`nightly-settle` rebuilds the public research contract from the settled ledger and writes it to
disk (proven in the Aug-1 log: `wrote app/public/data/research/{terminal-summary,…}.json`), but
`app/public/data/research/` was **absent from the workflow's commit allowlist**. The rebuilt
contract was therefore never committed — it could only ever be corrected by a hand-made commit
(the last one being `9ab77844`, 2026-07-31), and drifted behind the ledger after every settle.
Program 092-095 mistakenly recorded the ordering problem as "already fixed"; the ordering *was*
correct, but the artifact could never persist.

**Layer 2 — blast radius, introduced by me in Program 092-095 (`GENERATION_FAILURE`).**
The `research-contract:stale` check was added to `health-check.mjs` as a CRITICAL failure, and
that gate is invoked by **both** `nightly-settle` (publish — correct) **and**
`morning-projections` (the board GENERATOR — wrong). A downstream artifact's staleness therefore
aborted the creation of today's board.

## Timeline (evidence: workflow runs + artifact history)

| When (ET) | Event |
|---|---|
| Aug 1 03:41 | `nightly-settle` **succeeds**: July 31 settled (299 rows · 275 decisive · 146W/129L · **24 voids**, the new decisive denominator working). Contract rebuilt to 07-31 on disk — **not committed** |
| Aug 1 10:42 | `morning-projections` **FAILS**: `✗ research-contract:stale: contract asOfSettledDate 2026-07-30 ≠ ledger newest settled 2026-07-31` → `UNHEALTHY — 1 CRITICAL` → exit 1. **No Aug 1 board** |
| Aug 1 10:47 | `mlb-daily-production` correctly **skips** (the `workflow_run` success-gate from Program 088-091 doing its job) |
| Aug 1 11:27 | `mlb-daily-production` backstop cron runs and correctly **fail-closes**: "never complete a missing board" |
| Aug 2 03:42 & 05:32 | `nightly-settle` **FAILS**: `MlbSettleError: board file not found: …/boards/2026-08-01.json` — the cascade |
| Aug 2 10:45, 11:36 | `morning-projections` fails again, same gate. **No Aug 2 board** |
| Aug 1–2 (throughout) | `auto-refresh`, `mlb-pregame-capture`, `cron-watchdog`, `mlb-afternoon-topup` all **succeed** — which is why nothing looked broken from the run list alone |

**Why the watchdog didn't save it:** by design. `cron_watchdog.sh` dispatches only when the
primary **never ran**; here it ran and *failed*, which the watchdog deliberately leaves to
failure alerting (re-dispatching a failing workflow would just burn credits on a broken gate).
That rule is correct and unchanged — the gap was that nothing escalated a *repeatedly failing*
generator, addressed in `DAILY_FRESHNESS_SLO_AND_OBSERVER_GUARD.md`.

**Alerting did fire.** Every failed run routed through the OPS webhook (`::error::GameTimePicks
morning-projections FAILED on main (exit 1)`). The alerts were delivered; the incident still ran
62 hours, which is a signal-triage gap, not a wiring gap.

## Ruled out (tested, not assumed)

Vercel ignored-build logic (data commits deployed fine all week) · commit/push failure (161+ bot
commits landed) · concurrency starvation (no queue waits observed) · timezone anchoring (ET
resolution correct in every log) · duplicate Vercel project (dormant since 07-31T17:16Z) · prune
boundary · provider/market availability (pregame capture succeeded ~120 snapshots/day both days).

## The fix (both layers, shipped `8559e9cf`)

1. `nightly-settle` now **commits** `app/public/data/research/` — the contract becomes genuinely
   self-updating and the drift cannot recur.
2. `health-check.mjs` gains `--phase`: **publish keeps the strict CRITICAL default** (a stale
   public number must never ship); `--phase generate`, used only by `morning-projections`,
   downgrades contract staleness to a WARNING. Money invariants, $100→bankroll reconciliation,
   and data hygiene still hard-abort in **both** phases.
3. Drifted contract repaired from the settled ledger (07-30 → 07-31) — derived data only, no
   fabricated predictions or timestamps.

**Proofs** (`app/src/lib/freshness-incident-guards.test.mjs`, 5 tests): the settle must commit
what it rebuilds · the generator must use `--phase generate` · publish callers must NOT · the
gate's default must be `publish` and the branch must be `GENERATE_PHASE ? W : C` · the observer
must retain a board-staleness threshold. Behavioral proof on the real drifted data: publish phase
exit 1 (CRITICAL), generate phase exit 0 (WARNING), same inputs.

## What was deliberately NOT done

**Aug 1 and Aug 2 boards were not backfilled.** Pregame market snapshots exist for both days in
the internal archive (~120/day), so a board *could* have been fabricated — but choosing to
publish a prediction population after the games are final is exactly the temporal leakage the
policy forbids. Both dates are recorded **GENERATION_BLOCKED / NOT_MEASURABLE**; see
`AUG1_AUG2_ARTIFACT_AND_SETTLEMENT_AUDIT.md`.
