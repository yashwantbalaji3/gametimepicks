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
- **Unit phase on the integration head:** 9,218 / 9,222 pass. The 2 failures are the known `live RLS` tests (Postgres); the other 2 are skips. `tsc --noEmit` clean.
- **Batched roadmap update**, committed in the same head:
  - the #1046 release record;
  - MLB-001's text, verbatim from #1043, so the two branches merge cleanly;
  - MLB-002 integration;
  - MLB-003/004/005 research status;
  - the Lane A session log.
- **Pushed** to #1048's branch, a fast-forward: head **`793588ff3b`**. #1048 retargeted to `main`; the PR body is the approval package. #1047 has a comment saying it is merged through #1048 if approved.
- **CI:** the first runs were cancelled by the retarget; a new run is pending. One later check, no polling.
- **State:** **`READY_FOR_FOUNDER_REVIEW`. Not merged.**

### 06:15Z–06:35Z · MLB-005 · coherent worlds prototype (branch `claude/mlb-005-coherent-worlds`, from #1043's pa-v3 head; pushed; no PR)
- **Engine, research hooks only** (`EngineParams.research`; absent means the published engine byte for byte, pinned by the existing hash tests, 36/36):
  - a world event observer;
  - explicit per-batter PA distributions;
  - a per-game starter batters-faced draw;
  - in-game substitution (per-trip replacement hazard, replacement PA model, starter-only lines).
- **Invariant checker** `world-invariants.mjs`: score, runs, RBI, scorers, outs, lineup order, batter and starter lines, ending, extras, workload, substitution.
  - Tests 11/11, including 6 mutation probes, a substitution mutation, and legacy's cap-awarded run detected as incoherent.
- **`mlb-coherent-worlds-v1`:** preregistered (`431072c9ae`) before any read-out. Harness `c26156bf3f`. 2024 development read:
  - **Integrity:** fidelity check 18/18 exact against the frozen replay. **4,014,000 worlds, 0 invariant violations.**
  - **Engine read-out minus v2 analytic**, count log loss:

    | Market | Engine − v2 | Decision |
    |---|---|---|
    | K | **−0.0090 [−0.0161, −0.0007]** (better) | PROCEED |
    | Hits | +0.0031 | PROCEED |
    | **TB** | **+0.0053 [+0.0037, +0.0069]** | **DO_NOT_PROCEED** |
    | H+R+RBI | +0.0032 | PROCEED |
    | HR, R, RBI | within ±0.0022 | PROCEED |

  - **Game level:** beats league baselines (winner −0.009 [−0.016, −0.002]; total log score −0.028 [−0.048, −0.008]).
  - **Cause of the TB failure:** there is no in-game substitution, so starters take 4.33 PA against 4.01 actual.
- **`mlb-coherent-worlds-v2` (substitution):** preregistered (`cb9a52e95e`) as a disclosed second look at 2024. Running.

### 06:35Z– · MLB-001 · #1043 review
- **Rules reconfirmed:**
  - no automatic runner in the postseason;
  - a non-homer walk-off ends at the winning run;
  - a cap tie is discarded and redrawn, with a bounded refusal. No fabricated run.
- **Defect found and fixed** (local `be19ba7002`, not pushed yet): Rule 9.06(f) walk-off hit bases. A game-ending non-homer now credits only the bases the winning runner advanced. Test: official and legacy are identical except the walk-off play; official TB is never higher, and at most 2 lower. rules / engine / simulate 30/30.
- **Reconciled** with `main` cleanly.
- **Byte identity of the default path against `main`:**
  - pregame (10-07, 09-15): **IDENTICAL**.
  - **after first pitch (10-07 23:59Z): DIFFERS by one additive field.** Carried `frozenPregame` entries gain `"modelVersion": "mlb-fullgame-2026.08-pa-v2"` (#1043's frozen-carry change). Game objects and `artifactHash` are unchanged, and the only other reader (`build-mlb-social-content.mjs`) checks only that the entry exists.
  - #1043's PR body **already disclosed** this as its one intended exception ("carried `frozenPregame` entries gain `modelVersion`"), so it is not a new finding. It is reconfirmed here at the reconciled head.

### 06:40Z · TRUTH-001 · #1045 / #1049
- Both merge cleanly with `main` (dry merge).
- #1045's restatement log matches `main`'s committed classification exactly (22 = 21 + 824424 held; 4 NOT_SERVED; none outside). Status `PROPOSED_NOT_APPLIED`.
- #1045 retargeted from the merged #1042 branch to `main`; still a draft. #1049 stays stacked on #1045. Nothing applied.
