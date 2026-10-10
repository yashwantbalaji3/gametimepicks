# MLB-003 / MLB-004 / MLB-005 · forward test B2 (next versions): preregistration

**Registered:** 2026-10-10, before the first pitch of any game in its window. The commit of this file, with `run-forward-b2.mjs`, `grade-forward-b2.mjs` and `materialize-b2.sh`, is the registration **and the code freeze**. **Evidence of time:** the commit, and its push to `claude/mlb-005-coherent-worlds`, before the first included game.

**Relation to forward test B:** B is **unchanged**. B2 runs beside it on the same games, with the same inputs, refusals, write-once rule, sample sizes, primary metric, single look and claims rules as `FORWARD-PREREGISTRATION-B.md`. Only the models differ.

## Window

Every MLB game whose actual first pitch is after this registration commit.

**Exposure, disclosed:** both models were designed after the 2024 development reads below, so only games **after** the freeze count.

## Frozen models

| Name | What | Development evidence (2024, exploratory) |
|---|---|---|
| `v3k` | `mlb-k-workload-v3`: situation-aware batters-faced mean (`dd406d91d8`), strikeouts only | −0.0138 [−0.0185, −0.0089] against v2 (counts); no posted-line gain on 2026 |
| `engineB2` | Coherent worlds: substitution (`cb9a52e95e`) + the v3 workload for both starters + **no home-field term** (the home-field version failed its registered bar: winner −0.0015 [−0.0036, +0.0004]); official rules incl. Rule 9.06(f); 2,000 worlds, seed `mlb005-fwd-b2|<gamePk>` | substitution v2: non-inferior in 7/7 markets; the **combination** of substitution and the v3 workload was not evaluated separately on 2024. That is disclosed, and this forward test is its first evaluation |

**Gates:** as in B.
- Hits 2,000, TB 1,000, H+R+RBI 1,000, K 300 graded posted lines; one look each.
- Primary: challenger minus `current` log loss at the posted line, 95% upper end < 0, and calibration slope in [0.7, 1.3].
- Market comparison always reported, never used to pass. No betting-value claim.
- Materialised only through `materialize-b2.sh`, which refuses any code drift from this freeze.
