# MLB-005 · `mlb-coherent-worlds-v1`: 2024 development result (2026-10-10)

**Label:** DEVELOPMENT (exploratory).
- 2024 was already the development season for the MLB-003/004 v2 inputs.
- This result can earn `PROCEED_TO_FORWARD_SHADOW` and nothing more.
- No market comparison exists historically.
- 2025 was not used.
- Registration `431072c9ae`; harness `c26156bf3f`; output `coherence-2024-dev.json`.

## Integrity

- **Fidelity:** the copied replay reproduced the frozen 2024 replay **exactly** (18 of 18 values).
- **Invariants:** **4,014,000 simulated games, 0 invariant violations**, every world checked by `world-invariants.mjs`. 0 games discarded at the inning cap.
- **Coverage:** 2,007 games read out. Skipped: 11 without exactly nine listed starters, 2 without a starter.
- **Runtime:** 107 s of engine time, at 2,000 worlds per game.

## Player read-outs from the same simulated games

Count log loss, engine read-out minus the analytic v2, on identical rows. 95% interval from a bootstrap resampling whole dates. Non-inferiority margin +0.005.

| Market | n | Engine − v2 | Decision | Calibration slope, engine (v2) | Mean, engine / v2 / actual |
|---|---|---|---|---|---|
| Pitcher K | 3,751 | **−0.0090 [−0.0161, −0.0007]** (better) | `PROCEED_TO_FORWARD_SHADOW` | 1.01 (1.13) | **4.881** / 5.020 / 4.880 |
| Hits | 35,390 | +0.0031 [+0.0017, +0.0044] | `PROCEED_TO_FORWARD_SHADOW` | 0.92 (0.94) | 0.953 / 0.884 / 0.885 |
| Total bases | 35,390 | +0.0053 [+0.0037, +0.0069] | **`DO_NOT_PROCEED`** | 0.97 (1.01) | 1.555 / 1.442 / 1.463 |
| H+R+RBI | 35,390 | +0.0032 [+0.0015, +0.0046] | `PROCEED_TO_FORWARD_SHADOW` | 0.95 (0.96) | 1.906 / 1.820 / 1.801 |
| HR | 35,390 | +0.0002 [−0.0004, +0.0008] | `PROCEED_TO_FORWARD_SHADOW` | 0.92 (0.95) | 0.127 / 0.118 / 0.125 |
| Runs | 35,390 | −0.0009 [−0.0022, +0.0003] | `PROCEED_TO_FORWARD_SHADOW` | 0.96 (0.96) | 0.477 / 0.476 / 0.467 |
| RBI | 35,390 | −0.0002 [−0.0014, +0.0011] | `PROCEED_TO_FORWARD_SHADOW` | 0.96 (0.92) | 0.477 / 0.460 / 0.450 |

**Same games, game level** (no market historically; compared with league-to-date baselines):

| Measure | Engine | League baseline | Engine − baseline |
|---|---|---|---|
| Winner log loss | 0.6840 | 0.6932 (home-win rate) | −0.0092 [−0.0164, −0.0021] |
| Total-runs log score | 2.8228 | 2.8504 (empirical) | −0.0275 [−0.0482, −0.0080] |
| CRPS | 2.378 | 2.402 | — |
| Mean total | 8.56 | — | actual 8.80 |

## What it shows

1. **Coherence is achievable at little or no accuracy cost.** One simulated game produces the winner, the total, every batter count and the starters' strikeouts. Those read-outs are non-inferior to the separate per-player model in 6 of 7 markets, and **better for strikeouts**.
   - The strikeout gain has a clear mechanism: the engine plays the starter's actual batters-faced against the actual lineup's per-PA K rates. Its mean strikeouts match reality (4.881 vs 4.880), where v2's analytic mixture overstates them (5.020).
2. **The remaining gap is opportunity, not rates.** The engine plays every starter for the whole game: **4.33 simulated PA per starting batter against 4.01 actual**. Pinch hitters and defensive replacements are not modelled. So the read-out means run about 7–8% high for hits, TB and H+R+RBI, and total bases fails the margin. The next version needs an in-game **substitution / PA-allocation** mechanism. It must be registered before it is evaluated, and its 2024 look will be a second, disclosed look.
3. **Game level:** the same worlds beat the league baselines on winner and total-runs scores. The total runs are about 0.23 low (no errors, double plays or wild pitches in the published advancement).

**Not shown:**
- any comparison with posted lines or the market;
- any qualification;
- anything about the published engine's own inputs. This used the v2 replay inputs, not the board's projections.

Forward evaluation (see `docs/research/mlb/mlb-003-004/FORWARD-VALIDATION-DESIGN.md`) is required before any product use.
