# MLB-002 · combined integration plan for #1047 + #1048 (prepared 2026-10-10; founder decision 6)

**Status:** plan only. Both PRs stay research-only and unmerged until a separate founder approval at an exact head.

## What would reach Production

| PR | Production-path change | Default behaviour |
|---|---|---|
| #1047 `claude/mlb-002-matchup-challenger` | `app/src/lib/mlb/full-game/`: `EngineParams.matchup`, `buildMatchupPaOutcome`, `log5` | **Unchanged.** The matchup path runs only when `EngineParams.matchup` is passed. No published caller passes it. The rest is docs (RESULT.md: NOT QUALIFIED) |
| #1048 `claude/mlb-002-matchup-forward-shadow` (stacked on #1047) | `generate-mlb-full-game-simulations.mjs`: a private shadow write; `matchup-features.mjs` (pure) | **Public output byte-identical.** The shadow goes to `data/internal/research/mlb/engine-level-shadow/matchup-v1/<date>.json`, which is not a Vercel build input. Writes are wrapped in try/catch, so a shadow failure never fails the generator |

## Recommended route: one integration, one Production build

1. **Retarget #1048 to `main`.** It already contains #1047's commits.
2. **Reconcile with current `main`** (#1046 has merged since both were opened) and re-run:
   - the unit and post-build phases;
   - the byte-identity check on two pregame slates plus one post-first-pitch run (full-game file, input snapshot, P317 shadow);
   - the fault-injection test (shadow throws → public output unchanged).
3. **Request founder approval at that exact head.** Merge #1048 with `--match-head-commit`, then close #1047 as merged through #1048. That is **one** Production deployment instead of two.
4. **Batch the roadmap update** (the #1046 release, MLB-002/003/004/005 status, the PR queue) into the same reconciled head, so no separate docs-only build is needed.

## Post-merge verification

- Production `build-info` contains the merge.
- MLB and Results pages are identical to pre-merge snapshots apart from the build timestamp.
- Forecast counts are unchanged.
- No `engine-level-shadow` path is served (404).
- The next scheduled MLB generator run commits a shadow file for its pregame games, in the **same** commit as its public files (COST-001: no extra commit or build).

## Risks and rollback

- **Generator runtime:** about +0.3 s per pregame game.
- **Failure isolation:** the shadow is isolated; a failure logs and continues.
- **Rollback:** revert the merge commit. Shadow files already written stay as research evidence; they are never deleted or rewritten.

## Not part of this integration

- No activation, eligibility or promotion of `mlb-pa-matchup-v1`.
- No public page reads the shadow.
- The forward test is the one registered in `FORWARD-PREREGISTRATION.md`: a single look at n ≥ 300 forward regular-season games, which means 2027.
