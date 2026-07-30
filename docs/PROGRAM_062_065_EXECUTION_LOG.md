# Program 062–065 — Execution Log

**Started:** 2026-07-30 ~00:15 ET · **Operator:** Claude (Fable 5, autonomous session)
**Objective:** convert Program 058–061 decisions into production measurement and working multi-sport foundations (implementation, not strategy).

## Phase 0 — baseline (2026-07-30)

| Check | Result |
|---|---|
| Branch / HEAD | working branch `june30-reset` @ `9d0b853c` == `origin/main` tip (expected Program 058–061 integration SHA confirmed; local stale `main` branch ignored — pushes go `HEAD:main` per repo automation convention) |
| Working tree | clean except `vp/` (uncommitted by policy) |
| Full validation | ran at this exact SHA and tree ~1h prior (Program 058–061 final integration): JS suite serial **3,372 / 3,368 pass / 0 fail / 4 skipped** · typecheck clean · static build exit 0 · health **HEALTHY 18/18** · Python MLB+UFC **149 passed**; re-confirmed now: HEAD unchanged, hashes exact |
| Money md5 | `affe6b21071f2b3be96bb2774eb347c3` ✅ |
| Bank Builder lock md5 | `cb80473f88f3cb5f67208fa568925295` ✅ |
| Pre-program stashes | `stash@{0}` (WIP@23532f44), `stash@{1}` (WIP@e05ddb7) — recorded, deliberately untouched |

## Phase 0.4 — production verification (2026-07-30T04:3x Z)

- **Deployed commit = local HEAD `9d0b853c`** (`npm run verify:deployment` → "Production is serving local HEAD", built 2026-07-30T04:10Z, 0.4h old).
- Routes `/, /today, /markets, /results, /methodology, /system-status` → all **200**.
- Deployed HTML: benchmark strip present on /results ✅ · "Largest simulated probabilities" on /today ✅ · stale "Top model picks by market" absent ✅ · "profit-locking" absent ✅.
- First clean post-gate settlement: **not yet occurred** at session start (nightly-settle runs later in the morning ET) → Lane A item WALL_CLOCK_OPEN, re-checked opportunistically during the session.

## Lane status

| Lane | Status | Commit | Notes |
|---|---|---|---|
| 0 Baseline/production | **COMPLETE** | — | above |
| A Operational observation | **COMPLETE** | `043f63c8` | `npm run ops:public-beta-observe`; both live proofs remain WALL_CLOCK_OPEN |
| B Lineage + explorer | **COMPLETE** | `c7069c7e` | additive sidecar (ledger untouched) + full explorer on /markets |
| C Analytics completion | **COMPLETE (dark)** | `6462591f` | aggregator + /ops panel + endpoint options; activation BLOCKED BY FOUNDER |
| D NBA adapter implementation | **COMPLETE (unpromoted)** | `5934b40d` | tipoffIso, identity, 3 market seams, settlement foundation; stays HISTORICAL_ONLY |
| E EPL preview implementation | **COMPLETE (odds side)** | `28e6c91d` | settlement built but gated: RESULTS_SOURCE_PENDING; stays SCAFFOLD |
| F UX/release hardening | **COMPLETE** | (verified, no code needed) | 375×812: no horizontal overflow, one H1/route, accessible sort + row controls; built-HTML clean |
| G UFC continuity | **COMPLETE** | `46fb6325` | repair verified intact; SCAFFOLD_ONLY reaffirmed |
| H Integration/delivery | **COMPLETE** | — | below |

## Final integration validation (2026-07-30)

| Check | Result |
|---|---|
| JS/TS suite (serial) | **3,572 tests · 3,568 pass · 0 fail · 4 skipped** (was 3,372 at program start: +200) |
| Typecheck | clean |
| Static production build | exit 0; `/ops` and `/preview` pruned; EPL sample artifacts pruned as `public:false` |
| Health gate | HEALTHY 18/18 |
| Python `pipeline/mlb/ + ufc/ + nba/` | **214 passed** |
| Python `pipeline.settle_test` | 85 settlement assertions passed |
| Money md5 | `affe6b21071f2b3be96bb2774eb347c3` ✅ (verified before and after) |
| Bank Builder lock md5 | `cb80473f88f3cb5f67208fa568925295` ✅ |
| `vp/` | untouched, uncommitted |

**Two defects found and handled during integration:**

1. **Fixed (ours).** `pipeline/nba/settle_results_test.py::test_the_gate_raises_rather_than_warns` passed alone and failed beside `pipeline/mlb/`. Cause: the MLB lineage suite calls `importlib.reload()` for its own mutation proof, which rebinds `SettlementLineageError` **inside the shared module namespace**; the raising function then throws the new class while a by-name import still holds the old one. Fixed by resolving the class through the module at assert time, which is order-independent. This is a test-only artifact — reload never happens in production.
2. **Pre-existing, NOT ours.** `pipeline/providers/balldontlie_provider_test.py` fails 2 tests deterministically (up to 4 under a large combined run — it uses real sleeps in a rate-limiter test). Proven pre-existing by stashing every program change and reproducing the identical failures at pristine HEAD. The file is untouched by this program. Recorded, not silently absorbed; worth a separate fix.

**Pre-program stashes** `stash@{0}` and `stash@{1}` remain untouched, as instructed.
