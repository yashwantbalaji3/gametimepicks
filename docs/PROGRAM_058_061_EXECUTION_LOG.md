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
| Phase 0 reconciliation | **COMPLETE** | see above; pushed `32120fb5` to origin/main + origin/june30-reset |
| A — Strategy ratification | **COMPLETE** | `5603a5e8` docs (PRODUCT_STRATEGY_RESEARCH_TERMINAL + MULTISPORT_PROMOTION_GATES); public-positioning repair (methodology/full-game-report/today components — "prediction"→"simulation read", edge→model–market gap, profit-locking→paper ladders) committed with Lane G |
| B — Analytics | **COMPLETE** | event-contract v2 (SCHEMA_VERSION 2, MARKET_FAMILIES, FEEDBACK_TOPICS, 8 new closed-enum events), page-events funnel extension, docs/PUBLIC_BETA_ANALYTICS_CONTRACT.md; provider still OFF — ONE founder action remains (sign ANALYTICS_ACTIVATION_DECISION §7 + endpoint + 2 env vars) |
| C — Final MLB variance experiment | **COMPLETE — IMPROVES_MODEL_ONLY, stopping rule TRIGGERED** | `ecc215fc` preregistration → `e2037ad9` execution. Selection on validation chose per-market variance widening; untouched test 0.2462 vs market 0.2409, 0/3 sub-windows better, hybrid w=0 a third time. Independent sportsbook-beating objective SUSPENDED. Per-market: hits+HRR research-content-only, TB disable, Ks insufficient evidence |
| D — NBA adapter foundation | **COMPLETE (doc)** | docs/NBA_RESEARCH_ADAPTER_READINESS.md — gates today: G1 partial, G2/G3/G4 fail, G5/G6 pass; prerequisite zero = persist ISO tip-off (espn_provider discards it); ~4–5 engineer-weeks preseason plan from ~Sep 14 |
| E — EPL market-intelligence prototype | **COMPLETE (design doc)** | docs/EPL_MARKET_INTELLIGENCE_PROTOTYPE.md — TS engine canonical, legacy Python settlers FROZEN, new soccer/epl/ root, 1X2+de-vig three-way, fail-closed postponement states; mid-Aug season target |
| F — UFC identity/settlement repair | **COMPLETE** | boutId-keyed settlement join in grade_moneylines.py + build_backtest_dataset.py, fail-closed on missing/ambiguous boutId, rematch/no-contest/mutation tests, regrade correction audit artifact, docs/UFC_IDENTITY_AND_SETTLEMENT_REPAIR.md; gradingReady honestly flips false |
| G — Disagreement explorer / market benchmark | **COMPLETE (phase 1)** | ResultsMarketBenchmark on /results (contract-adapter numbers, no rate arithmetic); /today categories reframed "largest simulated probabilities", calibration-failed chip, PREDICTION_DISABLED_MARKETS excludes TB from ranked lists |
| Public beta release review | **COMPLETE (docs)** | classification + 7-day observation plan in docs/PROGRAM_058_061_FOUNDER_REPORT.md |

**Session note:** the first Ultracode session hit its usage limit mid-program (2026-07-29 ~6pm ET) with Lanes B/E/F agents interrupted; resumed 11:49pm ET via workflow resume (`wf_0e7797ad-4ca`) — EPL doc found complete on disk, UFC + analytics re-executed, NBA doc replayed from cache.

## Final integration validation (2026-07-30, after rebase onto origin/main @ `b7c91f05`)

| Check | Result |
|---|---|
| JS/TS suite (serial) | 3,372 tests · 3,368 pass · **0 fail** · 4 skipped |
| Typecheck | clean |
| Static production build | exit 0; ops/preview + `public:false` data pruned |
| Health gate | HEALTHY 18/18 |
| Python `pipeline/mlb/` + `pipeline/ufc/` | **149 passed** (53 identity/lineage + 96 UFC incl. new rematch/mutation fixtures) |
| Money md5 | `affe6b21071f2b3be96bb2774eb347c3` ✅ |
| Bank Builder lock md5 | `cb80473f88f3cb5f67208fa568925295` ✅ |
| `vp/` | untouched, uncommitted (autostash-preserved through both rebases) |

Rebase 2: the 8 program commits were rebased onto three overnight bot archive-metadata commits (`840d7635`, …, `b7c91f05`) with `--autostash`; no conflicts; bot history preserved. Two pre-program stashes (`stash@{0}` WIP@23532f44, `stash@{1}` WIP@e05ddb7) were found and deliberately left untouched — they are not this program's data.
