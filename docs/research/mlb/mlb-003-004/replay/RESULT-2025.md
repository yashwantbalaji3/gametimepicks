# 2025 retrospective holdout read: result (2026-10-10)

**Label:** `RETROSPECTIVE_HOLDOUT`.
- 2025 was read **once**, by `--holdout-read`, at frozen commit `d170c425d1` (`V2-FREEZE.md`).
- It is **not** a prospective test, and it is **not sufficient for qualification** (`HISTORICAL-DATA-AND-HOLDOUT-AUDIT.md`).
- No historical lines exist, so nothing here compares to the market or supports a betting-value claim.
- Output: `holdout-2025-result.json`. The harness now refuses any re-read.

## Registered criterion, per market (`REPLAY-PROTOCOL.md`)

The criterion has three parts:
1. v2 − current count log loss, 95% interval below 0;
2. v2 − v1, interval below 0;
3. calibration slope at the main threshold in [0.7, 1.3].

| Market | n | v2 − current | v2 − v1 | Slope v2 (current) | AUC at main threshold, current / v1 / v2 | Result |
|---|---|---|---|---|---|---|
| Pitcher K | 3,809 | −0.085 [−0.112, −0.058] | −0.0024 [−0.0049, −0.00002] | 1.13 (0.51) | 0.672 / 0.676 / 0.676 | **Support**, but v2's margin over v1 is marginal: the interval's upper end is −0.00002 |
| Hits | 35,566 | −0.024 [−0.026, −0.021] | −0.0049 [−0.0068, −0.0033] | 0.94 (0.39) | 0.547 / 0.553 / 0.559 | **Support** |
| Total bases | 35,566 | −0.154 [−0.163, −0.146] | −0.0030 [−0.0039, −0.0021] | 1.00 (0.37) | 0.552 / 0.557 / 0.561 | **Support** |
| H+R+RBI | 35,566 | −0.109 [−0.118, −0.100] | −0.098 [−0.103, −0.092] | 1.08 (0.40) | 0.553 / 0.561 / 0.571 | **Support** |
| Home runs | 35,566 | (no current model) | −0.0003 [−0.0007, +0.0002] | 1.01 | — / 0.605 / 0.607 | **Fails** (no gain over v1) |
| Runs | 35,566 | (no current model) | −0.0025 [−0.0039, −0.0012] | 1.01 | — / 0.558 / 0.570 | **Support** |
| RBI | 35,566 | (no current model) | −0.071 [−0.076, −0.066] | 0.99 | — / 0.553 / 0.562 | **Support** |

**Handedness variants (v2h):**
- **Strikeouts (opponent K% against same-hand starters):** v2h − v2 = **+0.0021 [−0.0027, +0.0068]**. The 2024 gain (−0.007) **did not replicate**.
- **Batters:** no gain in any market, and slightly worse for TB (+0.0005), HR (+0.0008) and RBI (+0.0003).
- **Verdict:** v2h is **not supported**.

## What this does and does not show

- **Replicated across 2024 (development), 2025 (holdout) and 2026 (exposed):**
  - The published prop model's count distributions are **badly overconfident**: calibration slope about 0.4–0.5 in every market.
  - Replacing its normal approximation with a count model fixes most of that. Total bases gains −0.15 log loss.
  - Making runs and RBI consistent with each plate-appearance outcome is the largest single mechanism gain (H+R+RBI −0.10, RBI −0.07).
- **Discrimination improves only slightly.** Threshold AUC rises by 0.005–0.02. The strikeout gain over v1 from the batters-faced distribution is barely distinguishable from zero.
- **Not shown:**
  - any gain against posted lines or the market. Earlier work found the published model at about AUC 0.51 against the line for K and TB;
  - any qualification;
  - any betting value.
- **Next required evidence:** the forward test in each preregistration (rest of the 2026 postseason, then 2027), against posted lines and the de-vigged market.
- **Status:** research only. No publication, promotion or eligibility change.
