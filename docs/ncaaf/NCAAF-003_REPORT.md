# NCAAF-003 — Coherent game worlds: result

**Status: Gate 003 (structural) PASS. The world engine's close-game structure is materially wrong, and that is
recorded.** PRIVATE_RESEARCH. Spec registered before any real-game simulation: `WORLD_MODEL_SPEC.md`
(`a81a795`). Freeze `231f474c1e` → holdout diagnostics run once at `58f21955b`.

## Gate 003 → 004 (structural, §3)

| Check | Result |
|---|---|
| S1 0 incoherent worlds | **PASS**: 1,568 dev + 1,606 holdout games × 10,000 worlds; the engine throws on any violation (unit-tested, and the OT-rule mutation probe goes red) |
| S2 reproducible | **PASS**: dev receipts re-run byte-identical (sha256 `f345d9e1…`) |
| S3 refusals counted | **PASS**: 0 refused in both windows (FBS–FBS from 2022, after the OT minimums were met) |
| S4 honest diagnostics | **PASS**: below, failures included |

## Diagnostics (FBS–FBS)

| | Dev 2022–23 (n 1,568) | Holdout 2024–25 (n 1,606) |
|---|---|---|
| Winner log loss: worlds / C2 analytic / C1 Elo | 0.5713 / 0.5680 / 0.5713 | 0.5639 / 0.5610 / 0.5642 |
| Winner ECE: worlds / C1 | 0.039 / 0.021 | 0.054 / 0.040 |
| Mean \|P_world − P_C1\| (p90) | 0.079 (0.167) | 0.086 (0.189) |
| Margin CRPS: worlds / C2 normal | 9.33 / 9.26 | 9.27 / 9.20 |
| Margin 80% coverage · bias | 0.818 · +1.44 | 0.822 · +1.04 |
| Total CRPS: worlds / C2 normal | **9.15 / 9.19** | **9.08 / 9.14** |
| Total 80% coverage · bias | 0.823 · +0.40 | 0.824 · +0.04 |

**Structure vs actual (holdout; dev is the same picture):**

| Shape | Worlds | Actual |
|---|---|---|
| Overtime rate | 3.0% | 5.0% |
| \|margin\| = 3 | **5.6%** | **10.0%** |
| \|margin\| = 7 | 6.2% | 8.2% |
| \|margin\| = 10 / 14 | 4.5% / 4.7% | 5.0% / 4.0% |
| One-score (\|m\| ≤ 7) | 29.7% | 35.1% |
| \|margin\| ≥ 28 | 17.7% | 18.9% |
| Totals by 7-point band | within ~2 points of actual in every band | — |

## Findings

1. **Totals: good.** Empirical regulation-score marginals reproduce the total distribution band by band. World
   total CRPS beats the Gaussian in both windows.
2. **Margins: wrong where it matters most.** Drawing the two scores from a copula of marginals cannot
   reproduce how real games end on 3 and 7: game-state dependence (late-game play for a field goal,
   ties forcing overtime) is not in a copula. Worlds under-produce |margin| = 3 by ~45%, one-score games by
   ~5–7 points of share, and OT by ~40%. **Spread cover and push probabilities near 3 and 7 from this engine
   would be materially wrong, so it must not price spreads (NCAAF-007) as is.**
3. **Home margin bias +1.0 to +1.4 points.** This is consistent with the named simplification (μ fitted on
   finals, bank of regulation scores) and with C2's own calibration intercept.
4. **Two P(home) sources disagree by 0.08 on average** (p90 ~0.18): C1 Elo vs C2-based worlds. Not patched.
   Downstream must name its source.

## Hand-off to NCAAF-004 (registered challengers)

- **W2 joint analog worlds:** draw the (margin, total) *pair* from the nearest past games in
  (expected margin, expected total) space, so key numbers, close-game share and OT come from real games.
  Target: the structure table above, margin CRPS, and coverage.
- C1 recalibration, widened Elo grids and a division effect (from NCAAF-002).

Receipts: `experiments/003-{dev-diagnostics,freeze,holdout-diagnostics}.json`; OT table
`corpus/v1/overtime-periods.json` (606 OT games, 13 quarantined: 10 `OT_PERIOD_OVER_8`, 3
`PERIOD_COUNT_MISMATCH`). Reproduce (from `app/`): `node scripts/ncaaf/evaluate-worlds.mjs --phase holdout
--now 2026-10-10T00:30:00Z` → "holdout diagnostics reproduced byte-for-byte".
