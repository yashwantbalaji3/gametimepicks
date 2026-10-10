# MLB-002 · `mlb-pa-matchup-v1`: result

**Verdict under the preregistration: NOT QUALIFIED.** The primary bar fails narrowly. The challenger does **not** advance automatically to a forward shadow, nothing is promoted, and no published forecast changes.

**Registration trail:**
- `6620ac4e75` preregistration, then `cd2065d3e9` amendment 1 (slot PA reference, before any result).
- `7b42df1d77` amendment 2 (unspecified details, before the harness ran).
- `a38523dba6` harness and league constants frozen from dev-window captures.
- `88ca0ce6d9` amendment 3, after dev run 1 and before the holdout. It fixed batter-split coverage, a mechanical property: same-game captures mostly came after the early forecasts.
- Dev run 2 committed, then the holdout run once.

**Population:** graded MLB games with rebuilt point-in-time inputs. **Both arms use identical inputs and seeds**, with 10,000 games each. The control is the published engine on those same inputs, not the published number.

## Holdout (2026-09-01 → 2026-10-08), read once

359 games run. 12 had no usable inputs for **either** arm: the forecast input was unavailable, and the challenger never refuses on its own.

**Coverage:** 82.5% of batters had matchup splits, 32.9% a known slot, 89.0% of starters a season line.

| Metric | Control (published engine) | Challenger | Challenger − control, 95% |
|---|---|---|---|
| **Winner log loss** (coin 0.6931) | 0.7026 | **0.6896** | **−0.0129 [−0.0272, +0.0012]** |
| Winner Brier | 0.2545 | 0.2481 | — |
| Winner calibration slope (1 = calibrated) | 0.21 | **0.65** | — |
| Total runs CRPS | 2.510 | **2.449** | **−0.061 [−0.114, −0.007]** |
| Total runs log score | 2.888 | 2.868 | — |
| Total level (actual − mean) | +0.97 | +0.36 | — |
| Total 80% interval coverage | 0.808 | 0.825 | — |
| Run line ±1.5 home-cover log loss | 0.661 | 0.642 | — |
| **Vs the de-vigged market (358 games)**: market 0.6646 | 0.7026 | 0.6899 | challenger − market **+0.007 … +0.044** (worse) |

| Preregistered bar | Result | |
|---|---|---|
| 1. Holdout winner log loss better than control, 95% interval below 0 | upper bound **+0.0012** | **✗ fails** |
| 2. Total CRPS no worse than control + 0.02 | −0.061 | ✓ |
| 3. Total level no worse than control + 0.25 | 0.36 vs 0.97 | ✓ |
| 4. No challenger-caused refusals | 0 | ✓ |

**Subgroups:**
- Regular season (335): log-loss difference −0.0139 [−0.0282, +0.0008]; CRPS −0.072 [−0.129, −0.017].
- Postseason (24): log-loss difference +0.0008 [−0.045, +0.050]; CRPS +0.094 [−0.039, +0.226]. Too small to judge either way.

## Dev (2026-07-24 → 2026-08-31), for the record

| Run | Games | Winner log-loss difference | CRPS difference | Calibration slope (control → challenger) | Level (control → challenger) |
|---|---|---|---|---|---|
| Run 1 (20% batter coverage) | 437 | −0.0070 [−0.0195, +0.0051] | −0.039 | 0.24 → 0.38 | +0.62 → −0.01 |
| Run 2 (85.5% coverage) | 437 | −0.0077 [−0.0204, +0.0049] | −0.035 | 0.24 → 0.42 | +0.62 → −0.08 |

## What it means, stated carefully

- **Winner:** the direction is consistent (dev −0.008, holdout −0.013), but the improvement is **not established** at the registered standard. The interval includes 0.
- **Totals:** the challenger's distribution is better, **established** on the holdout (CRPS interval below 0). It also shrinks the level error. This is the mechanism the MLB-001 audit predicted: walks and home runs now depend on who is batting and pitching.
- **Calibration:** the winner calibration slope improves sharply (0.21 → 0.65), meaning probabilities far less over-spread.
- **The market is still better than both arms.** Nothing here supports a claim of betting value, and none is made.
- **Limitations:**
  - Bullpen quality is not modelled (no data).
  - Slots are unknown for most early prop-derived lineups.
  - The rebuilt inputs for many games use prop-derived lineups because the consumed lineup captures were not committed (see the MLB-001 replay).

## Recommendation (decision for the founder)

The preregistration does not qualify this challenger. Two honest options:

1. **Stop here and record it.** Not qualified.
2. **Register a new, prospective forward shadow** under a fresh preregistration. Primary bar: winner log loss improvement with the interval below 0 after n ≥ 300 new games, **and** totals CRPS no worse. The challenger would run alongside the published engine **without publishing**. This is a new test on new games, not a re-reading of this one.

Recommended: **option 2**, because the totals improvement is established and the winner effect is consistent in sign, but only under a fresh preregistration, and **with no change to anything published until it passes.**
