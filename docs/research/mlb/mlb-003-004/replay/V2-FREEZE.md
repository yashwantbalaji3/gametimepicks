# `mlb-k-workload-v2` and `mlb-batter-counts-v2` (plus `v2h`): freeze before the 2025 retrospective read (2026-10-10)

**Frozen code:** `replay.mjs` as committed with this file. The specification is `REPLAY-PROTOCOL.md`, registered at `2f9c067b68`.

## Changes since registration

| Change | When | Effect |
|---|---|---|
| `handOf` returns only `L` or `R`. Two switch pitchers (`S`) count as hand unknown | After registration, **before** the 2024 read (the handedness file was fetched only then) | Prevents a crash. No model change |

**After reading 2024: no changes.**
- **Decided:** v2 and v2h go to 2025 exactly as registered.
- **Not done:** the 2024 results were not used to tune any constant, grid or component.
- **Walk-forward fits:** the per-month fitted values (κ, run and RBI coefficients) are refit inside 2025 from 2025's own earlier months, as registered.

## 2024 development read (exploratory; `replay-2024-dev.json`)

Count log loss, lower is better. 95% intervals from a paired bootstrap that resamples whole dates. Scored May 1 → postseason.

| Market | n | current | v1 | v2 | v2h | v2 − current | v2 − v1 | v2h − v2 |
|---|---|---|---|---|---|---|---|---|
| Pitcher K | 3,774 | 2.3345 | 2.2430 | 2.2369 | 2.2303 | −0.098 [−0.122, −0.071] | −0.006 [−0.009, −0.004] | −0.007 [−0.011, −0.002] |
| Hits | 35,599 | 1.2127 | 1.1958 | 1.1900 | 1.1897 | −0.023 [−0.025, −0.020] | −0.006 [−0.009, −0.004] | −0.0002 [−0.0003, 0.0000] |
| Total bases | 35,599 | 1.7912 | 1.6400 | 1.6379 | 1.6382 | −0.153 [−0.162, −0.144] | −0.002 [−0.003, −0.002] | +0.0005 [+0.0001, +0.0009] |
| H+R+RBI | 35,599 | 1.9103 | 1.8947 | 1.8015 | 1.8014 | −0.109 [−0.117, −0.100] | −0.093 [−0.098, −0.089] | −0.0000 [−0.0003, 0.0003] |
| HR | 35,599 | — | 0.3838 | 0.3840 | 0.3848 | — | +0.0002 [−0.0001, 0.0006] | +0.0007 [+0.0004, +0.0011] |
| Runs | 35,599 | — | 0.8832 | 0.8826 | 0.8826 | — | −0.0006 [−0.0017, 0.0004] | +0.0001 [−0.0001, 0.0003] |
| RBI | 35,599 | — | 0.9601 | 0.8922 | 0.8922 | — | −0.068 [−0.072, −0.064] | −0.0000 [−0.0003, 0.0003] |

**Calibration slope at the main threshold:**

| Model | K 4.5 | Hits 0.5 | TB 1.5 | H+R+RBI 1.5 |
|---|---|---|---|---|
| current | 0.47 | 0.41 | 0.39 | 0.40 |
| v2 | 1.13 | 0.94 | 1.01 | 0.96 |

**Threshold AUC:**
- K 4.5: current 0.656, v2 0.678, v2h 0.686.
- Hits 0.5: 0.549 → 0.561.
- TB 1.5: 0.556 → 0.565.
- H+R+RBI 1.5: 0.552 → 0.564.

**Reading:**
- **The largest gains are distribution shape, not discrimination.** The current model's normal approximation is badly overconfident, with slopes of about 0.4.
- **Mechanisms that helped:**
  - outcome-coherent runs and RBI, which do most of H+R+RBI's and RBI's gain;
  - the batters-faced distribution, which is small;
  - opponent K% against same-hand starters (strikeouts).
- **No gain:** the game-level batter handedness split (v2h) adds nothing for hits, TB or H+R+RBI and slightly hurts TB and HR. HR and runs show no v2 gain.
- **Market:** none of this is evidence against the market. There are no historical lines.
