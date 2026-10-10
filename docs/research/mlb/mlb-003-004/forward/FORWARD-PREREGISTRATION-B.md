# MLB-003 / MLB-004 / MLB-005 · forward test, option B (frozen-code forward replay): preregistration

**Registered:** 2026-10-10, before the first pitch of any game in the window. The commit of this file, together with the code beside it, is the registration **and the code freeze**. **Evidence of time:** the commit, and its push to GitHub (`claude/mlb-005-coherent-worlds`), before the first included game. Design: `../FORWARD-VALIDATION-DESIGN.md`.

**Status:** research only. Nothing is published, wired into a workflow, promoted or made eligible. Qualification needs this test, run to its sample sizes, and then a founder decision for each family.

## Window

- **Included:** every MLB game (postseason 2026, then the 2027 regular season and postseason) whose **actual first pitch** is after this registration commit's timestamp.
- **One look per family:** taken when the family reaches its sample size, or at the end of the 2027 regular season, whichever comes first. A family short of its n is reported as "not enough data". The 2026 postseason alone will not reach any n.
- **Exposure, disclosed:** v2 and the coherent-worlds read-out were designed on 2024 and 2026 data, and the 2025 retrospective read is spent. Only games **after** the freeze count here.

## Frozen models (by commit; no change during the window)

| Name | What | Code |
|---|---|---|
| `current` | The published prop model's probability on the board lean of record | Production (whatever is published) |
| `v2` | `mlb-batter-counts-v2` / `mlb-k-workload-v2` analytic (the frozen replay at `d170c425d1`) | `forward/run-forward-b.mjs` (this commit) |
| `engineSub` | Coherent-worlds read-out with substitution (`mlb-coherent-worlds-v2`, `cb9a52e95e`): the official-rules engine fed v2's per-PA rates, v2's batters-faced distribution and the substitution hazards; 2,000 worlds per game, seed `mlb005-fwd|<gamePk>`. The frozen engine also carries #1043's official Rule 9.06(f) walk-off hit bases (`be19ba7002`). That changes only the total bases of a game-ending non-homer hit; it was not in the 2024 development runs | same |
| `market` | The de-vigged board price for the same lean (book and capture time recorded) | — |

## Point-in-time inputs (all timestamped; nothing from the game itself)

- **Forecast time T:** the last `lineup` capture with both lineups posted (9 and 9), captured before the scheduled start. No such capture means the game is **refused** (`NO_CONFIRMED_LINEUP`).
- **Lineup:** that capture's batting order.
- **Starters:** the latest `matchup` capture at or before T.
- **State:** the official box scores of games dated **before** the game's date.
- **Lines:** the board lean of record for the player and family (`mlbLeansOfRecord`).
- **Missing inputs:** a refusal with its reason, never an imputation.
- **Population:** the nine batters per side in the captured lineup, and the captured starters.
  - A listed batter with no PA in the box score is **void**, not a loss.
  - A listed starter who does not start is void.

## Families and gates (one look each)

| Family | Minimum graded lines |
|---|---|
| Hits | 2,000 |
| Total bases | 1,000 |
| H+R+RBI | 1,000 |
| Pitcher strikeouts | 300 |

Runs, RBI and HR have no posted line on the board. They are scored on counts only and **qualify nothing**. HR stays withheld.

**Primary metric:** log loss of P(over the posted line), challenger (`v2`, `engineSub`) minus `current`.
- Paired, with a bootstrap resampling **game dates** (2,000 draws).
- Pass: 95% upper end < 0 **and** calibration slope in [0.7, 1.3].

**Always reported, never used to pass:**
- challenger minus `market`, on rows with a two-sided price;
- count log loss and CRPS;
- AUC;
- `engineSub` minus `v2`.

**Claims:**
- A pass against `current` is not a claim against the market.
- A market claim needs its own interval below 0.
- No betting-value claim follows from either.

**Integrity:**
- An input dated at or after first pitch, or a change to the frozen code or parameters, **invalidates** the affected rows.
- Rows are written once per date (`data/internal/research/mlb/forward-player-b/<date>.json`). The script refuses to overwrite.
- Failed results are kept.
