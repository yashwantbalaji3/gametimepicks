# Program 058–061 — Execution Log

**Started:** 2026-07-29 · **Operator:** Claude (Fable 5, Ultracode autonomous session)
**Objective:** strategy ratification → adoption measurement → final MLB model decision → safe multi-sport foundations.

## SHA ledger

| Milestone | SHA |
|---|---|
| Baseline before Sprint 057 | `76fae758` |
| Sprint 057 (local, pre-rebase) | `6fcef8fc` |
| Nightly-bot commit preserved | `ad836c2f` |
| Sprint 057 rebased onto origin/main | `32120fb5` |
| Pushed to origin/main (FF) + origin/june30-reset | `32120fb5` ✅ 2026-07-29 |

**Branch decision (Phase 0.2):** `main` is the authoritative branch — every scheduled workflow pushes `HEAD:main`; `origin/june30-reset` was a stale pointer (60 behind local). Local `june30-reset` and `origin/main` diverged by exactly one commit each (Sprint 057 vs bot archive metadata, disjoint files), so the safest path was **rebase local onto origin/main** (clean, no conflicts), then fast-forward push to `main` and synchronize `june30-reset`. No force-push to `main`; `june30-reset` updated with `--force-with-lease` (its history was subsumed by the rebase).

## Phase 0 baseline (exact totals, 2026-07-29)

| Check | Result |
|---|---|
| JS/TS suite (serial) | 3,352 tests · 3,348 pass · 0 fail · 4 skipped |
| Typecheck | clean |
| Static production build | clean (ops/preview + `public:false` data pruned; build-info published) |
| Health gate | HEALTHY 18/18 |
| Python `pipeline/mlb/` (identity + settlement lineage) | 53 passed |
| Research self-tests (model-experiments / model-edge / model-learning) | all pass |
| Pipefail known-negative proof | ok — reproduces original defect, pipefail set before first piped step |
| Money md5 | `affe6b21071f2b3be96bb2774eb347c3` ✅ |
| Bank Builder lock md5 | `cb80473f88f3cb5f67208fa568925295` ✅ |
| `app/public/data` | clean |
| `vp/` | untouched (uncommitted by policy; stash/restored around rebase) |

**NOTE (suite discipline):** running the JS suite concurrently with health-check in the same tree produces spurious failures; all totals above are serial runs.

## Phase 0.5 time-sensitive observations (wall-clock, OPEN)

- Newest settled ledger date: **2026-07-27**. 2026-07-28 permanently quarantined (lineage gate refused 641 rows — live proof artifact `data/internal/mlb/integrity/settlement-lineage-live-proof.json`, verdict PROVEN).
- **First clean post-gate settlement has NOT yet occurred** — the 2026-07-29 slate settles overnight (nightly-settle.yml); 2026-07-30 ET is the first clean stamping candidate. DO NOT FORCE.
- Corrected pipefail has not yet been exercised by a real scheduled failure (known-negative proof passes locally).
- Ledger rows do **not** yet carry eventId / settlement source / provider refs / lineage verdict per row (observed newest row keys: actual, confidence, date, edgePct, gamePk, id, lean, line, marketKey…). Recorded as a named limitation for Lane G/release, not a blocker.

## Lane status

| Lane | Status | Notes |
|---|---|---|
| Phase 0 reconciliation | **COMPLETE** | see above |
| A — Strategy ratification | NOT_STARTED | |
| B — Analytics | NOT_STARTED | |
| C — Final MLB variance experiment | NOT_STARTED | |
| D — NBA adapter foundation | NOT_STARTED | |
| E — EPL market-intelligence prototype | NOT_STARTED | |
| F — UFC identity/settlement repair | NOT_STARTED | |
| G — Disagreement explorer | NOT_STARTED | |
| Public beta release review | NOT_STARTED | |

(Updated continuously below as lanes progress.)
