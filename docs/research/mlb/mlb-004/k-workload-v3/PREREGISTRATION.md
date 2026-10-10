# MLB-004 · `mlb-k-workload-v3` (role- and rest-aware workload): preregistration, 2026-10-10

**Registered:** before v3 is computed on any season. The commit of this file is the registration.

**Exposure, disclosed:**
- The mechanism comes from the exploratory 2024 residual table (`../workload-signals/bf-residuals-2024.json`). So the 2024 look is **exploratory development**: it can earn only a place in a later forward registration.
- 2025 is not used.
- 2026 posted lines are exposed and may be read only as an exploratory check.

## The only change from v2: the batters-faced mean depends on the start's situation

v2's E[BF] (last five starts shrunk to 22 with weight 3) treats every start alike. v3 adds a walk-forward shift `δ_c` for the start's **situation**. Situations are known pregame from earlier games, and the first match in this order wins:

| Situation | Rule |
|---|---|
| `OPENER_HISTORY` | ≥ 3 earlier starts with mean BF < 12 |
| `RELIEF_TO_START` | the pitcher's previous appearance was in relief |
| `SHORT_REST` | < 4 days since his previous appearance |
| `FIRST_STARTS` | 0–2 earlier starts this season |
| `LONG_LAYOFF` | ≥ 30 days since his previous appearance |
| `NORMAL` | otherwise |

- **Shift:** `δ_c` is the mean of (actual BF − E_v2[BF]) over **earlier months'** starts in situation c, shrunk toward 0 with a prior of 30 starts. It is refit at the first date of each month, like every other walk-forward parameter.
- **Mean:** `E_v3[BF] = max(3, E_v2[BF] + δ_c)`.
- **Distribution:** BF = round(E_v3 + ε), with ε drawn from the residuals (actual − E_v3) of every earlier start. Otherwise v2's rule.
- **Unchanged:** K given BF is v2's beta-binomial, with v2's walk-forward κ.

## Evaluation (development, 2024; exploratory 2026 lines)

- **Primary:** count log loss of strikeouts, v3 minus v2, on identical starts.
  - 95% interval from a bootstrap resampling whole dates.
  - `PROCEED_TO_FORWARD_SHADOW` if the upper end < 0 (an improvement), else `DO_NOT_PROCEED`.
- **Secondary:**
  - the same by situation;
  - BF mean absolute error;
  - calibration at 4.5;
  - the exploratory 2026 posted-line log loss (reported, decides nothing).
- **Qualification:** only a new forward registration, made before its own window, can qualify v3. Forward test B (v2) is not changed.
