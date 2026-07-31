# Daily Pipeline Reliability and Alerting

**Program:** 076–079 · The reliability posture after the July 28–30 outage arc, and what enforces it.

## The three failure classes this repo has actually hit, and their locks

| Failure class | Real instance | Lock | Enforced by |
|---|---|---|---|
| **Green-but-broken** — a producer crashes, the orchestrator prints ✓ | board generator crashed for 2 days behind `python \| tee` (July 29–30) | `set -o pipefail` before the first pipeline in every `automation_*.sh` | two pipefail guards + a sweep that fails on ANY orchestrator piping to tee without it — all executed by `run_all_tests.sh` (a guard that runs nowhere is not a guard; that is how this one was missed the first time) |
| **Failed-but-unseen** — the run fails correctly, nobody is told | nightly-settle failed twice and sat unread in the Actions tab for two days | one redacted alert per failed run via `scripts/ops_alert.sh`, carrying newest-board + newest-settled context | `ops_alert_test.sh` (hostile-input redaction incl. the real money hash; delivery never masks the run failure; sweep for hand-rolled payloads) + the visibility suite asserting all four production workflows route through it |
| **Generated-but-lost** — a valid artifact discarded by a writer race | morning-projections vs daily-refresh rebase race discarded a fully generated board (July 30) | ONE shared concurrency queue `gtp-generated-artifacts`, `cancel-in-progress: false`, across all six generation-side writers | visibility suite: a writer must join the queue and may never be cancelled mid-write |

Supporting locks that predate this program and remain: job-level `continue-on-error` banned on production workflows · push failures fail the run (never swallowed by an echo) · settlement is lineage-gated and fail-closed (proven live July 30: `board file not found` → exit 2 → publish aborted) · `mlb-daily-production` fail-closes on a missing board rather than fabricating a slate.

## Alert configuration state

Wiring: **4/4 production workflows** route through the shared alerter (observer-verified). Delivery: **BLOCKED BY FOUNDER** — `OPS_WEBHOOK_URL` is not among the repository's secrets (names inspected this session, values untouched). Until it is set, a failing run is visible only in the Actions tab, which is precisely the condition that let the last outage sit for two days. One GitHub secret closes it; the safe, non-destructive verification command is in `OPS_ALERTING_CONTRACT.md`. No vendor was chosen.

## Daily observability

`npm run ops:public-beta-observe` now reports, from real artifacts only: deployed SHA and drift · newest board / downstream / settled dates · quarantined (07-28) and generation-blocked (07-29) dates kept distinct · settled-ledger lineage acceptance · **native stamping coverage on the newest board** (the forward-only acceptance number) · alert wiring · analytics mode · both protected hashes. Non-zero exit only on hash mismatch or artifact contradiction.

## Evidence labels

**PROVEN** — pipefail live (real failure, July 30); lineage gate live (641-row refusal); all locks guard-tested with known-negatives. **WALL_CLOCK_OPEN** — the shared writer queue preventing a real concurrent-writer collision (it is asserted structurally; the first naturally-overlapping schedule proves it live). **BLOCKED BY FOUNDER** — alert delivery. **REJECTED** — forcing a production failure to prove delivery; per-workflow concurrency groups as a serialization strategy (they serialize nothing across workflows, demonstrated by the July 30 race).
