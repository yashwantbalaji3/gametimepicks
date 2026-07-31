# Program 080–083 — Execution Log

**Started:** 2026-07-31 10:24 ET · **Mission:** operate from evidence — settled provenance, alert/analytics activation where authorized, first observation-driven day.

## Phase 0 (10:24 ET)

| Check | Result |
|---|---|
| origin/main | `edc6a4ea` — two **scheduled** nightly-settle commits landed overnight (04:15, 06:06 ET) with no manual involvement: the repeatability evidence in the wild |
| Money / lock md5 | `affe6b21…` / `cb80473f…` ✅ |
| Secrets (names only) | still no `OPS_WEBHOOK_URL`, no analytics variables — Lanes B and C stay BLOCKED BY FOUNDER |
| July 31 board | 227/227 natively stamped, 8/15 games with posted props (overnight capture) |
| Baseline | JS 3,557 · 3 real data-state failures (below) · typecheck 0 · health 18/18 · Python 219 |

## The day's operational evidence (Lane E in action)

1. **Two scheduled failures, both fail-closed successes.** `mlb-pregame-capture` 12:54Z: observation-quality gate refused `duplicateIds: 2`, discarded the leaked join, next capture retries fresh. `daily-lifecycle` 11:07Z: its test gate hit the known concurrent-tree flake class and refused its deploy step; `daily-rebuild` succeeded 29 min later. **User impact of both: none.** Both alerts died at `OPS_WEBHOOK_URL unset` — measured twice more. Recorded as the first two incident artifacts under `PUBLIC_BETA_SERVICE_LEVELS.md`.
2. **The public contract lagged the ledger** (settled 07-30, contract said 07-27) — caught by the `settled-means-decided` guard on a quiet tree; regenerated with `--write` (`a26b6b7c`); *why the workflow's contract step lagged* is an open follow-up for tomorrow's run.
3. **Partial-coverage invariant fired honestly**: 15 full-game simulations vs an 8-game props board (books hadn't posted overnight). The 9:30 ET `morning-projections` cron did not fire (GitHub best-effort; all recent runs are dispatches). Remedy: standard dispatch — which **queued behind the in-progress auto-refresh in the shared writer group: the first live observation of the serialization working** (pending → runs when the writer ahead finishes; nothing raced, nothing lost).

## Lane status

| Lane | Status |
|---|---|
| A July 31 settlement + settled PROVEN_STAMPED | **WALL_CLOCK_OPEN** — slate plays 14:20–~23:00 ET; canonical nightly path untouched. Passive: after Aug 1 settle, `ops:public-beta-observe` → lineage acceptance flips on 07-31; then `build-research-row-lineage.mjs --write` → first PROVEN_STAMPED rows |
| B Alert activation | **BLOCKED BY FOUNDER** — `OPS_WEBHOOK_FOUNDER_SETUP.md` (one secret; safe test; rollback) |
| C Analytics activation | **BLOCKED BY FOUNDER** — `ANALYTICS_STILL_BLOCKED.md` (NOT_AUTHORIZED, dark state guard-proven) |
| D Adoption dashboard | states honest: everything `NOT_CONFIGURED` / `NOT_YET_MEASURED`; no invented uniqueness |
| E Service levels + incidents | **COMPLETE** — measured thresholds; two live incident writeups; seven-day template seeded with day 1 |
| F Product iteration | evidence only: the contract-lag fix was today's one real defect; no taste-driven changes |
| G NBA/EPL | **COMPLETE (prep)** — NBA calendar criteria in `NBA_EPL_READINESS_UPDATE.md`; `EPL_RESULTS_PROVIDER_DECISION_PACKAGE.md` written (facts only, no selection) |
| H Integration | board refresh queued; final validation + deploy verification after it lands |

## Close-out (11:00 ET)

- **Serialization observed live, end to end**: the dispatched board refresh queued `pending` behind the running auto-refresh in `gtp-generated-artifacts`, released in order, completed — nothing raced, nothing cancelled, nothing lost. The first of the week's three proofs is banked on day one.
- **Refreshed board: 319/319 natively stamped, 10/15 games** — stamping survives regeneration through the scheduled path (a stronger fact than the first acceptance: the stamps are a property of the generator, not of one run).
- **Two suite failures remain, both adjudicated and understood**: the sim-orphan invariant and the prop-normalization test fire on the legitimate intraday state where full-game sims derive from team markets (which post before player props — verified in the generator source). Not fabrication; the invariant is too strict intraday. Spawned as its own careful task rather than rushed; expected to self-heal as books post the remaining lines before tonight's 14:20 ET first pitch, as they did for 07-30's full slate.
- Money `affe6b21…` / lock `cb80473f…` unchanged; `vp/` untouched.
