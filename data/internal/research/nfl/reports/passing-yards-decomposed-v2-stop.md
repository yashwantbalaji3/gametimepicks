# NFL passing yards — decomposed candidate v2: STOP (P318 / Phase 5F, 2026-09-15)

**Status:** DEV ONLY · **STOP.** The one look the pre-look design authorised was taken exactly as frozen and did not clear.
Passing yards stays the founder-approved public **ESTIMATE**. No constant was revisited; no second look at 2014–2021; no forward arm.

## The look (design: `passing-yards-decomposed-v2-design.md`, committed `0082d9953` before this run)
- Fit slice 2022–2023 (908 QB-games): attempts size `R(n) = 40·n/(n+4)`; Y/A dispersion fitted to p10–p90 coverage 0.80 —
  Gamma cv 0.183 (coverage 0.8007) vs log-normal σ 0.194 (0.8007); PIT tail distance 0.0165 vs 0.0187 → **Gamma kept** (v1's family).
- Assessment slice 2024–2025 (908 QB-games, 885 with a rolling-4 line), scored once: `passing-yards-decomposed-v2-assessment.json`.

| bar | result | cleared |
|---|---|---|
| ECE ≤ 0.05 at the rolling-4 line | **0.0516** | no |
| coverage in [0.72, 0.88] | 0.791 (2024 0.782 · 2025 0.800) | yes |
| level in [0.92, 1.08] | 1.004 | yes |
| MAE p50 < rolling-4 MAE (lined rows) | 61.1 vs 65.8 | yes |
| n ≥ 300 | 908 | yes |

Reliability bins (shown → observed over rate): 0.26→0.27, 0.35→0.42, 0.45→0.51, 0.55→0.58, 0.65→0.67, 0.74→0.80, 0.84→0.67 (n 39).
The middle bins under-forecast the over rate by about five points: against its own recent-form line the forecast's median sits
a little low, while its mean against the realised total is right (level 1.004). That is a fact about the line the bar is measured
at, disclosed here and not to be fixed by shifting anything after the fact.

## What this candidate has established (development only)
Typical miss improves by about 7% over both baselines on every season 2022–2025 with the conditional mean fixed; level is right;
ranges are honest. Calibration of P(over) at a recent-form line is 0.050–0.052 across two independent dispersion designs. The
evidence does not support a registration under the family's bars, and the bars are not for renegotiation.

## Prerequisite for any future step
Genuinely new evidence: the 2026 forward record. The share-level forward protocol already grades a passing-yards family weekly;
if a future protocol adds this decomposed candidate as a private forward arm, that must be registered before its first forecast,
scored by the existing grader, and judged by the same bars. No further development iteration on 2022–2025 is warranted.
