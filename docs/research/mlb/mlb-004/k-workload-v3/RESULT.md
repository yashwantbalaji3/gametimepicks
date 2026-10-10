# MLB-004 · `mlb-k-workload-v3`: 2024 development result (2026-10-10)

**Label:** exploratory development. Registration `dd406d91d8`; harness `ef4be781f5`, run with `--k-v3`.
- 2024 was exposed by the residual exploration that motivated v3.
- 2025 was not used.
- **Not qualified.**

## 2024 (registered development read)

Count log loss of starter strikeouts, v3 minus v2, on identical starts (n = 3,774):

**−0.0138 [−0.0185, −0.0089] → `PROCEED_TO_FORWARD_SHADOW`.** Calibration slope at 4.5 is 1.06.

| Situation (pregame) | Starts | v3 − v2 |
|---|---|---|
| Relief-to-start | 195 | **−0.234 [−0.316, −0.151]** |
| Opener history | 41 | **−0.238 [−0.310, −0.165]** |
| Long layoff (≥ 30 days) | 50 | −0.012 [−0.031, +0.009] |
| First starts (0–2) | 51 | −0.000 |
| Short rest (< 4 days) | 6 | −0.060 (n too small) |
| Normal | 3,431 | +0.0013 [−0.0002, +0.0027] |

**2026 debug run (exposed):** −0.0223 [−0.0293, −0.0153], with the same pattern (relief-to-start −0.216, openers −0.185).

## Against 2026 posted lines (exploratory; 2026 examined repeatedly)

| Model | Log loss (n = 2,405) |
|---|---|
| v3 | 0.7079 |
| v2 | 0.7074 |
| Published model | 0.7505 |
| Market | 0.6844 |

- **No line-level gain over v2:** books post strikeout lines mostly for established starters, where the two models agree. v3's gain sits in the starts the market does not price.
- **v3 minus market:** +0.023 [+0.015, +0.032], still worse.

## Reading

- The situation shift fixes a real opportunity error. It is large and specific: a pitcher coming out of the bullpen, or an opener, is no longer projected for a starter's 22 batters.
- It helps count distributions and the coherent game simulation. Strikeout lines rarely exist for those starts.
- **Next:** a new forward registration (B2), made before its own window, if v3 is to be qualified. Forward test B (v2) is unchanged.
