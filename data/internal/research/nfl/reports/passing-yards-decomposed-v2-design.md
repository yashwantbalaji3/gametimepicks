# NFL passing yards — decomposed candidate v2: pre-look design (P318 / Phase 5F, 2026-09-15 21:20Z)

**Status:** DESIGN, written and committed BEFORE the one development look it authorises. DEV ONLY. Nothing public changes.

## What has already been seen (disclosure)
- P299 and P300 passing-yards figures on 2014–2021 (second look for this family class); P300 REJECTED on ECE 0.055.
- The v1 decomposed candidate (`passing-yards-decomposed-dev.{md,json}`) on the POOLED development seasons 2022–2025, 1,816 QB-games:
  MAE 60.5–61 (baselines 65.2 / 65.3), level 1.007, p10–p90 coverage 0.815–0.89, **ECE 0.050–0.051** at the rolling-4 line for the
  two tightest dispersion pairs, on a 3×3 grid of (NB size R, Y/A cv). By season (R 25, cv 0.30): MAE 55.6 / 65.0 / 61.5 / 61.7,
  level 0.995–1.020, coverage 0.83–0.89. **No per-season ECE and no reliability bins have been looked at.**
- Any look at 2024–2025 below is therefore a second look at those seasons' MAE/level/coverage aggregates, and a FIRST look at
  their calibration. It is not blind; the blind population for this family stays the 2026 forward test.

## Why a v2 look is legitimate rather than threshold chasing
The v1 result is not a near miss to be rescued by tuning: its conditional mean is kept EXACTLY (attempts × Y/A, same constants),
and the only thing v2 may change is the dispersion RULE, chosen on a designated FIT slice by residual shape and a coverage target
— never by ECE, and never on the slice it is assessed on. Both the fit rule and the assessment metric are frozen here.

## Frozen design
- **Conditional mean:** unchanged from v1 (HL 6, SD 0.85, PRIOR_TEAM 4, PRIOR_YPA 150, MIN_SHARE 0.5, candidate rule, VOID rule).
- **Fit slice:** seasons 2022–2023. **Assessment slice:** seasons 2024–2025. Warm-up from 2021 as before.
- **Dispersion rule (the only change):**
  1. attempts ~ NegBin with size `R(n) = R0 · n / (n + 4)`, where `n` is the candidate QB's decayed share denominator in games
     (a new or returning starter with little role history gets a wider attempts distribution; a settled starter tends to R0).
     `R0 = 40` (the coverage-chosen v1 pair; fixed, not re-fit).
  2. Y/A family chosen on the FIT slice by residual shape: Gamma vs log-normal, judged by the fit slice's PIT histogram at the
     fitted dispersion (the family whose tail masses are closer to 0.10/0.10 wins; ties go to Gamma, the v1 family).
  3. Y/A dispersion (`cv` for Gamma, `sigma` for log-normal) fitted on the FIT slice ONLY, by bisection to p10–p90 coverage 0.80.
- **One assessment run** on 2024–2025 with the fit-slice constants. Metrics: MAE p50, level, p10–p90 coverage and width, ECE (10 bins)
  of P(over the rolling-4 line), MAE vs the rolling-4 median on lined rows; by season.
- **Bars (assessment slice):** ECE ≤ 0.05; coverage in [0.72, 0.88]; level in [0.92, 1.08]; MAE p50 < rolling-4 MAE on lined rows;
  n ≥ 300 scored. All must hold. No constant is revisited after the run.
- **If cleared:** register a forward-only private arm for 2026 weeks 3+ (its own protocol file beside the share-level forward,
  graded by the same grader; the public family stays ESTIMATE until the forward receipt and a founder step say otherwise).
- **If not cleared:** STOP with the assessment figures disclosed; the next prerequisite is genuinely new evidence (the 2026 forward
  record), not another dev iteration.
