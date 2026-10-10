# Overnight journal: Lane A (Core Intelligence), 2026-10-10

Working log for the founder's overnight directive. **Not a roadmap.** The authoritative roadmap is `GAMETIMEPICKS_MASTER_ROADMAP_V2.md` on `main`; updates are drafted and batched into the next approved integration. Times are UTC (EDT = UTC−4).

## Start state (06:08Z)

- **`origin/main`:** `fbfa10a64b`, which is #1046's merge `66ddbc8a5e` plus a bot data commit.
- **Roadmap on `main`:** read end to end.
  - **Stale on `main`** (progress sits on branches awaiting a batched update):
    - MLB-001, MLB-003, MLB-004 and MLB-005 still read NOT_STARTED;
    - #1046 still reads READY_FOR_REVIEW, though it is deployed.
  - **Current:** MLB-002 (NOT QUALIFIED) and the TRUTH-001 records through #1042.
- **Research branch:** `claude/mlb-003-004-baseline-audit` at `382572cb11`.
  - Holds the 2024 and 2025 box scores, the replay, `V2-FREEZE` and `RESULT-2025`.
  - The 2025 read is spent; it is not re-run.

## Queue (mapped to roadmap IDs)

1. **MLB-002:** #1047 + #1048 combined integration. Prepare to `READY_FOR_FOUNDER_REVIEW`; do not merge.
2. **MLB-003 / MLB-004:** new mechanisms after v2.
   - Point-in-time availability matrix.
   - Pitcher workload and bullpen feature builder.
   - A forward-validation design.
   - Any new version is preregistered for **forward** qualification. Development on 2024 and 2026 is labelled exploratory; 2025 is not reused as evidence.
3. **MLB-005:** coherent world prototype and invariant tests, reusing the full-game engine. Local only.
4. **MLB-001:** #1043 rule-correction review package; how it interlocks with MLB-005.
5. **TRUTH-001 / LEDGER-001:** #1045 / #1049 base retarget assessment and dry-run reconciliation. No corrections applied.
6. **#1044:** assess whether to bundle with an approved integration (docs only).
7. **Roadmap:** reconciliation drafted into the next integration head.

## Entries

### 06:08Z–07:00Z · MLB-002 · #1047 + #1048 integration

- **Integration worktree:** branch `claude/mlb-002-integration` from #1048's head `b7cbb2b1bd` (which contains all 8 of #1047's commits). Merged `origin/main` `fbfa10a64b` with no conflicts, giving `d0b009219f`. 18 files in scope.
- **Public isolation:** no app page, product, Results, saved-pick or ledger code imports the matchup symbols or reads `engine-level-shadow/`.
  - **Importers:** the generator, `engine.ts`, `plate-appearance.ts`, `matchup-features.mjs` and its tests.
  - **Other readers of `engine-level-shadow/`:** the P317 receipt builder (top-level `YYYY-MM-DD.json` only), `playoff-slate-totals-evidence.py` (top-level glob) and the commit-scope test.
  - **Workflow `git add`:** `mlb-daily-production`, `mlb-lineup-refresh` and `nightly-settle` already stage `data/internal/research/mlb/engine-level-shadow/`, including subfolders, so there is no workflow change.
- **Byte identity** (`main` generator vs integration generator; same slate, same `--now`, both `--write`; sha256 of every file written). Every public and internal file except the new `matchup-v1/` file is identical:

  | Case | Files compared | Shadow rows | Shadow time | Wall time, main → integration | Max RSS |
  |---|---|---|---|---|---|
  | 2026-10-07, 18:00Z (4 games pregame) | 3 | 4 | 1.17 s | 2.11 → 2.95 s | 121 → 125 MB |
  | 2026-10-07, 23:59Z (after 2 first pitches) | 3 | 2 (only unstarted games) | 0.60 s | 1.38 → 1.83 s | — |
  | 2026-10-08, 18:00Z (1 game) | 3 | 1 | 0.28 s | 0.94 → 1.24 s | — |
  | 2026-09-15, 18:00Z (15 games) | 3 | 15 | 4.09 s | 5.2 → 8.7 s | 135 → 142 MB |

- **Hardening** (`fc0b7b3b2b`):
  - a 60 s wall-clock budget for the whole shadow; remaining games are skipped and counted;
  - per-row `codeCommit` (`GITHUB_SHA`) and `simulationVersion`;
  - a formatting fix in `engine.ts`.
- **Fault injection** (2026-10-07 18:00Z). Six temporary patches; public output byte-identical and generator exit 0 in all six:

  | Fault | Rows | Logged |
  |---|---|---|
  | Feature builder throws for every game | 0 | 4 failures |
  | Shadow throws before its loop | 0 | 1 failure |
  | Challenger simulation unusable | 0 | 4 failures |
  | Write fails | 4 computed, not written | warning |
  | No feature captures | 4 (fallback to published rates) | — |
  | Budget exhausted | 0 | 4 over budget |

- **Tests:** targeted tests 12/12 (matchup, matchup-features, engine-level separation, commit scope) on Node 20.4.0. The full unit phase is running.
