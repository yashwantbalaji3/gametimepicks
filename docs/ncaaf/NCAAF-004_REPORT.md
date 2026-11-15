# NCAAF-004 — Challengers and calibration: result

**Status: report complete, Gate 004 met (frozen selection). No incumbent is replaced yet; two winner challengers
are "promising" and move to forward comparison.** PRIVATE_RESEARCH. Register `CHALLENGER_REGISTER.md`
(`6108a62`, committed before any 2026 result was fetched) → tuning on spent windows + freeze `baa274bb74` →
E26 scored once at `c3edff9e5` (`004-e26-receipt.json`, write-once).

**E26** = 2026 FBS–FBS played finals with slate ≤ 2026-10-05: **n = 271 games in 5 week clusters**, captured
2026-10-09 after the games. A backtest window, not forward evidence.

## Registered decisions (paired week-bootstrap, 2,000 reps, seed 20261009)

| Challenger | Δ primary loss vs incumbent | 95% CI | Bar (CI < 0) | Decision |
|---|---|---|---|---|
| H1 C1w: Elo, widened grid (K 30, HFA **55**, c 0.8, δ_FCS 200) | −0.0034 log loss | [−0.0066, −0.0007] | met | promising, held (see below) |
| H2 C1r: C1 + season-start recalibration | −0.0058 log loss | [−0.0119, −0.0002] | met | promising, held |
| H3 C2d: C2 + division effects (λ_div 1) | −0.031 CRPS | [−0.325, +0.310] | not met | C2 stays |
| H4 W2: joint analog worlds (K 300) | −0.114 CRPS | [−0.266, +0.124] | not met | W1 stays |

**Why H1/H2 do not replace C1 yet** (the register's rule is "replaces *only if*", a necessary condition):
1. Five week clusters make a percentile bootstrap fragile: each replicate redraws one of only five weeks.
2. Two challengers met the bar, and the register did not specify how to choose between them or whether to
   combine them (C1w + recalibration). Picking one now would be an unregistered post-hoc choice.
3. Both remain poorly calibrated on E26 (ECE 0.065 / 0.074 vs C1 0.082; bar 0.03).

**Next:** a registered H1-vs-H2-vs-(H1+H2) comparison on **forward** receipts (NCAAF-005), with C1 kept as the
forecast-of-record model until then.

## E26 detail (FBS–FBS, n 271)

| Model | Log loss | ECE | Cal. slope / int. | Margin CRPS | Total CRPS | FBS–FCS (n 119) LL / ECE |
|---|---|---|---|---|---|---|
| C1 | 0.5267 | 0.082 | 1.07 / +0.29 | 9.98 | 9.00 | 0.235 / 0.160 |
| C1w | 0.5233 | 0.065 | 1.07 / +0.20 | 9.94 | 9.00 | 0.225 / 0.143 |
| C1r | 0.5209 | 0.074 | 1.02 / +0.18 | 9.98 | 9.00 | 0.211 / 0.131 |
| C2 | 0.4975 | 0.065 | 1.34 / −0.45 | 9.59 | 8.87 | 0.260 / 0.177 |
| C2d | 0.4950 | 0.057 | 1.26 / +0.04 | 9.57 | 8.86 | **0.121 / 0.036** |

| Worlds | Log loss | Margin / total CRPS | 80% coverage m / t | OT pred/act | \|m\|=3 pred/act | One-score pred/act | \|m\|≥28 pred/act |
|---|---|---|---|---|---|---|---|
| W1 | 0.5012 | 9.74 / 8.72 | 0.786 / 0.863 | 0.027 / 0.026 | 0.052 / 0.070 | 0.277 / 0.314 | 0.205 / 0.266 |
| W2 | 0.4936 | 9.65 / 8.69 | 0.793 / 0.841 | 0.044 / 0.026 | 0.096 / 0.070 | 0.340 / 0.314 | 0.209 / 0.266 |

## Findings (descriptive; none change a registered decision)

- **H3 fixes the FBS–FCS cohort**: ECE 0.177 → 0.036 and log loss 0.260 → 0.121. That is the largest effect
  measured anywhere in NCAAF-004. It was a secondary cohort in the register, so it is recorded as the lead
  hypothesis for the next registered test (primary population = FBS–FCS).
- **W2 moves key-number structure the right way overall.** On 2022–25 tuning, K = 300 had the best exact CRPS.
  On E26 it over-produces 3/7 margins and OT, but E26's own 3-point share (7.0%) is far below 2016–25 levels
  (10–11%), and 271 games cannot separate that from noise.
- C2's P(home) beats C1's on E26 (0.4975 vs 0.5267). This is not a registered comparison; recorded for the next
  register.
- Every winner model remains above the 0.03 ECE bar on E26. **Nothing here is model-qualified.**

## Code

`app/src/lib/sports/ncaaf/challengers.mjs` (+ 7 tests: future-tampering leakage guard for every challenger,
recalibration fits only earlier seasons, analog worlds are exact distributions over real games),
`app/scripts/ncaaf/{capture-season-to-date,evaluate-challengers}.mjs`, corpus `corpus/e26/`. Frozen champion code
(`models.mjs`, `game-worlds.mjs`) was not modified.
