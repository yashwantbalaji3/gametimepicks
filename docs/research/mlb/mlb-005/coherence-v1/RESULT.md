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

**Same games, game level** (no market historically; compared with league-to-date baselines).

**Correction, 2026-10-10:** the first version of this table took each final from batting lines. Those miss pinch runners who scored without a PA, which undercounts about 9% of games and drops apparent "ties". The corrected finals come from the opposing pitchers' runs allowed, which match the official linescore in 4,859 of 4,859 cross-checked 2024–2025 games (`validate-boxscore-history.mjs`). Player read-outs are unaffected and reproduced exactly. Corrected (`coherence-2024-dev-v2-substitution.json`):

| Measure | Engine v1 | Engine v2 (substitution) | League baseline | v1 − baseline |
|---|---|---|---|---|
| Games | 1,956 | 1,956 | — | — |
| Winner log loss | 0.6839 | 0.6852 | 0.6927 (home-win rate) | −0.0089 [−0.0160, −0.0018] |
| Total-runs log score | 2.8182 | 2.8176 | 2.8420 (empirical) | −0.0238 [−0.0442, −0.0041] |
| CRPS | 2.378 | 2.379 | 2.400 | — |
| Mean total | 8.57 | 8.51 | actual 8.82 | — |
| Mean P(home win) | 0.500 | — | actual 0.527 | — |

The engine has **no home-field term** (mean P(home) 0.500 against 0.527 actual) and plays without errors, double plays or wild pitches, so its totals run about 0.25–0.3 low. Both are game-model (MLB-002) mechanisms, to be registered before they are tested.

## v2: in-game substitution (`PREREGISTRATION-V2-SUBSTITUTION.md`; a disclosed second look at 2024)

- **Integrity:** 4,014,000 more worlds, 0 invariant violations, including the starter-only-line checks.
- **Opportunity:** mean simulated PA per starting batter **4.16** against 4.33 in v1 and 4.01 actual.
- **Fitted league replacement hazard by trip:** 0.003, 0.035, 0.064, 0.060, 0.100, 0.091.

| Market | Engine v2 − v2 analytic | Engine v2 − engine v1 | Decision | Calibration slope | Mean, engine v2 / actual |
|---|---|---|---|---|---|
| Pitcher K | −0.0068 [−0.0137, +0.0009] | +0.0023 [−0.0025, +0.0068] | `PROCEED_TO_FORWARD_SHADOW` | 1.01 | 4.888 / 4.880 |
| Hits | +0.0003 [−0.0006, +0.0013] | **−0.0027 [−0.0036, −0.0018]** | `PROCEED_TO_FORWARD_SHADOW` | 0.94 | 0.916 / 0.885 |
| Total bases | +0.0036 [+0.0023, +0.0049] | −0.0016 [−0.0032, +0.0001] | **`PROCEED_TO_FORWARD_SHADOW`** (was DO_NOT_PROCEED in v1) | 0.99 | 1.495 / 1.463 |
| H+R+RBI | +0.0012 [−0.0002, +0.0027] | **−0.0020 [−0.0034, −0.0005]** | `PROCEED_TO_FORWARD_SHADOW` | 0.95 | 1.828 / 1.801 |
| HR | +0.0008 [+0.0003, +0.0012] | +0.0005 [−0.0001, +0.0012] | `PROCEED_TO_FORWARD_SHADOW` (non-inferior, but slightly worse than v2) | 0.90 | 0.123 / 0.125 |
| Runs | −0.0007 [−0.0021, +0.0006] | +0.0002 [−0.0007, +0.0012] | `PROCEED_TO_FORWARD_SHADOW` | 0.95 | 0.457 / 0.467 |
| RBI | −0.0002 [−0.0016, +0.0012] | −0.0000 [−0.0010, +0.0009] | `PROCEED_TO_FORWARD_SHADOW` | 0.94 | 0.456 / 0.450 |

**Reading:**
- With substitution, the coherent read-outs are non-inferior to the separate per-player model in **all 7 markets**.
- Substitution clearly improves hits and H+R+RBI over v1.
- The batter means still run about 2–3% high, because simulated team PA stays above actual (no double plays or caught stealing).
- This is a development result on an exposed season. It earns only a place in the forward test (`docs/research/mlb/mlb-003-004/forward/`).

## What it shows

1. **Coherence is achievable at little or no accuracy cost.** One simulated game produces the winner, the total, every batter count and the starters' strikeouts. Those read-outs are non-inferior to the separate per-player model in 6 of 7 markets, and **better for strikeouts**.
   - The strikeout gain has a clear mechanism: the engine plays the starter's actual batters-faced against the actual lineup's per-PA K rates. Its mean strikeouts match reality (4.881 vs 4.880), where v2's analytic mixture overstates them (5.020).
2. **The remaining gap is opportunity, not rates.** The engine plays every starter for the whole game: **4.33 simulated PA per starting batter against 4.01 actual**. Pinch hitters and defensive replacements are not modelled. So the read-out means run about 7–8% high for hits, TB and H+R+RBI, and total bases fails the margin. The next version needs an in-game **substitution / PA-allocation** mechanism. It must be registered before it is evaluated, and its 2024 look will be a second, disclosed look.
3. **Game level (corrected above):** the same worlds beat the league baselines on winner and total-runs scores. Totals run about 0.25 low, and there is no home-field term.

**Not shown:**
- any comparison with posted lines or the market;
- any qualification;
- anything about the published engine's own inputs. This used the v2 replay inputs, not the board's projections.

Forward evaluation (see `docs/research/mlb/mlb-003-004/FORWARD-VALIDATION-DESIGN.md`) is required before any product use.

## Exploratory: 2026 posted lines (2026 was examined repeatedly; no claim follows)

`coherence-2026-exposed-v2-substitution-exploratory.json`. Log loss of P(over the posted line) on the settled leans of record:

| Family | n | Published model | v2 | Engine v1 | Engine v2 (sub) | Market | Engine v2 − published | Engine v2 − market |
|---|---|---|---|---|---|---|---|---|
| Pitcher K | 2,405 | 0.7505 | 0.7074 | 0.7038 | **0.7037** | 0.6844 | −0.047 [−0.062, −0.032] | **+0.019 [+0.010, +0.029]** |
| Hits | 19,165 | 0.6764 | 0.6640 | 0.6670 | **0.6639** | 0.6604 | −0.013 [−0.015, −0.010] | **+0.0035 [+0.0015, +0.0056]** |
| Total bases | 8,395 | 0.7153 | 0.6838 | 0.6824 | **0.6820** | 0.6771 | −0.033 [−0.040, −0.027] | **+0.0048 [+0.0019, +0.0078]** |
| H+R+RBI | 17,412 | 0.7181 | 0.6931 | 0.6945 | **0.6919** | 0.6877 | −0.026 [−0.031, −0.022] | **+0.0042 [+0.0021, +0.0062]** |

**Reading:**
- The coherent read-out is the best of the GTP models in every family, and it beats the published model.
- **It is still worse than the market in every family**, with every interval above 0. No market edge and no betting value.
- This is consistent with the 2025 retrospective and 2024 development results, and is still not a qualification.

## Exploratory decomposition (2026)

How much would be gained if the opportunity were known?

| Market | v2 count log loss | With actual opportunity | Gain |
|---|---|---|---|
| Strikeouts (actual BF) | 2.223 | 2.107 | −0.116 |
| Hits (actual PA) | 1.190 | 1.144 | −0.045 |
| TB (actual PA) | 1.626 | 1.589 | −0.037 |
| H+R+RBI (actual PA) | 1.799 | 1.745 | −0.054 |

Opportunity (workload and plate appearances) is the largest remaining error, which motivated `mlb-k-workload-v3` (`docs/research/mlb/mlb-004/k-workload-v3/`).

## v3: home field (`PREREGISTRATION-V3-HOME-FIELD.md`; a disclosed third look at 2024) → **`DO_NOT_PROCEED`**

`coherence-2024-dev-v3-hfa.json`. 4,014,000 more worlds, 0 violations. Final league multipliers:
- home batters: K ×0.985, BB ×1.023, HR ×1.022;
- away batters: K ×1.015, BB ×0.978, HR ×0.979.

| | Engine v3 (home field) | Engine v2 | League baseline |
|---|---|---|---|
| Winner log loss (1,956 games) | 0.6837 | 0.6852 | 0.6927 |
| Mean P(home) (actual 0.527) | **0.518** | 0.500 | — |

- **Primary, winner v3 − v2:** −0.0015 [−0.0036, +0.0004]. The interval includes 0, so **DO_NOT_PROCEED**.
- **Total-runs log score v3 − v2:** −0.0001 [−0.0100, +0.0099].
- **Players against v2 analytic:** K −0.0082, hits +0.0005, HR +0.0001, runs −0.0012, RBI −0.0001, H+R+RBI +0.0018. **TB +0.0038 [+0.0026, +0.0050] sits at the margin, so it is reported as failing.**

**Reading:**
- The home-field term corrects the bias in P(home) (0.500 → 0.518), but the gain in winner log loss is not established on one development season.
- It is not carried into forward test B2.

## Exploratory: the forward-B2 engine combination (2024; run after B2 was frozen, so it cannot change B2)

`coherence-2024-dev-v2-substitution-kv3-b2check.json`. 4,014,000 worlds, 0 violations. Engine B2 = substitution + the v3 situation-aware workload. Count log loss, engine B2 minus engine v2 (substitution only):

| Market | Engine B2 − engine v2 |
|---|---|
| Pitcher K | **−0.0153 [−0.0217, −0.0087]** |
| HR | −0.0008 [−0.0014, −0.0001] |
| Hits | −0.0002 [−0.0010, +0.0005] |
| TB | −0.0007 [−0.0020, +0.0008] |
| H+R+RBI | −0.0006 [−0.0019, +0.0008] |
| Runs | −0.0001 |
| RBI | −0.0006 |

The workload fix carries into the coherent engine's strikeouts, and batter markets do not get worse.
