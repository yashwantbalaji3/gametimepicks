# Program 092–095 Execution Log (2026-07-31 evening)

Reliability closure · conditional coverage · analytics execution · workflow consolidation.
Anchor 18:12 ET. Starting truth: local = origin = `631ce980`; production served `fa49ddec`;
duplicate Vercel project Git-disconnected at ~17:30 ET (verified: last deployment 17:16:04Z,
plain-`Production` env naming returned). Protected hashes byte-exact; 2 historical stashes and
`vp/` untouched throughout.

## Actual file paths touched (discovered, then edited)

| Lane | Files |
|---|---|
| C | `app/src/lib/live-slate-invariant.mjs` (new classifier) · `event-identity.test.mjs` (state-model invariant) · `live-slate-invariant.test.mjs` (7 mutation proofs) · `markets/resolve-team.test.mjs` (doubleheader-safe matchup join) |
| D | `pipeline/mlb/settle_mlb_results.py` (`aggregate_outcomes`, voids split from pushes) · `settle_mlb_results_test.py` (July-30 regression) · `app/scripts/health-check.mjs` (`research-contract:stale` gate) · `scripts/cron_watchdog{,_test}.sh` · `.github/workflows/cron-watchdog.yml` · `scripts/run_all_tests.sh` (wired) |
| E | `.github/workflows/daily-lifecycle.yml` (cron removed) · `daily-rebuild.yml` (deleted) · `app/src/lib/settlement-writer-ownership.test.mjs` (new guard) · `workflow-failure-visibility.test.mjs` (writer list) |
| B | `app/scripts/mlb-topup-decision.mjs` · `app/src/lib/mlb-topup-decision.test.mjs` (8 proofs) · `.github/workflows/mlb-afternoon-topup.yml` |
| G | `app/api/collect.mjs` + `app/api/_collect-core.mjs` · `app/src/lib/analytics/collector-contract.test.mjs` (8 proofs incl. contract parity) |

## Live runs this program

| Run | Outcome |
|---|---|
| auto-refresh 30669837038 (dispatch) | **SUCCESS — first green ever**, 11m12s; timeout fail-soft exercised mid-run |
| auto-refresh 18:35 ET (schedule) | success, committed `0112d721` "zero Odds API credits" |
| mlb-daily-production 30671628436 (first top-up dispatch) | success; 3 credits; exposed the leans-scoped-ingest root cause; props re-captured (957 fresh rows) |
| morning-projections 30671905380 (corrected top-up) | **CANCELLED deliberately before execution** — it queued until 13/15 games were in progress and a mid-slate regen would have churned the published record. Board verified untouched (generatedAt 15:52:36Z, 319 leans). Slate-safety rule added to the decision + mutation test |
| Analytics preview (branch `analytics-collector-staging`) | staging proofs all green (see analytics doc); merged as `42ea7bc4` (kill-switched) |

## Mutation proofs executed this session (§13)

Top-up: complete-coverage SKIP · post-first-pitch SKIP · lead-cutoff SKIP · budget fail-closed ·
UNKNOWN-balance fail-closed (8 tests). Invariant: orphan/collision/unsafe/overstated hard-fail +
byte-identical fixture round-trip (7 tests). Settlement: July-30 void-denominator regression.
Health gate: live stale-contract mutation → exit 1 → restored byte-identical (md5-verified).
Watchdog: 6 dispatch-safety proofs. Analytics: forbidden-field / free-text / timestamp / parity /
kill-switch (8 tests) + 7 black-box staging probes on the preview. Ownership: 2-writer refusal +
retired-file guard. Vercel: 6 ignore-build behavioral proofs (from 088-091, still green).

## Boundaries honored

No model weights/calibration/settlement-policy change; no tuning against July 30/31; no historical
report rewrites; duplicate project untouched beyond observation; no new paid vendor; no plan
changes; no force-push; credits spent this program: **3 (mis-target) + the corrected regen run**,
inside the approved budget; secrets never printed.
