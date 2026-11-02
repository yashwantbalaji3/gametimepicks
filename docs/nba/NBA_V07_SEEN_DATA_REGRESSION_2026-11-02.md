# NBA v0.7 candidate: seen-data regression check, 2026-11-02

**Label: SEEN-DATA REPLAY. REGRESSION CHECK ONLY. NOT FORWARD EVIDENCE.** These games were read before v0.7 existed, and their documented lessons shaped its rules. Nothing below validates v0.7 or establishes that it beats any family. v0.7 is unarmed and nothing here changes a forecast, lane, receipt, ledger, workflow or reader.

**Verdict under preregistration section 7: no regression.** Fidelity held, B12 was met, and starters and sixth men projected equal frozen v0.3. Separately, 11 of 12 bars were met here and **B10 (calibration) was not**.

Rules, constants and bars: `docs/nba/NBA_V07_MINUTES_CANDIDATE_PREREGISTRATION_2026-11-02.md`, frozen and pushed at `ded21d6270` before any outcome was joined. This replay ran once, after that push. No rule, constant, bar or script changed afterwards, and no amendment was made.

```
cd app && npx tsx scripts/nba/research/replay-nba-v07-candidate.mjs --mode seen-regression --out-dir <dir outside the repo> --bootstrap 2000 --simulations 10000
```

## 1. Bars (MEASURED)

74 games, 148 sides. Fidelity: v0.1 148 of 148 sides and v0.3 148 of 148 sides re-derive. Intervals are game-clustered, 2,000 draws. Lower is better for every error and Brier figure.

| Bar | Result | Met |
|---|---|---|
| B1 Minutes | MAE 4.93 (4.65, 5.20). ΔMAE v0.7 − v0.3 −0.76 (−0.94, −0.59) | Yes |
| B2 Unconditional | Δ v0.7 − v0.3 −16.8 (−19.9, −13.8) per team-game | Yes |
| B3 Bias | −0.03 (−0.49, +0.40) | Yes |
| B4 Bias by population | Starters −1.45 (−2.18, −0.68); bench +1.24 (+0.80, +1.69); rows ≥ 34 +1.31 (+0.07, +2.66) | Yes |
| B5 Starter coverage | 735 of 740 vs 735 for v0.3 | Yes |
| B6 Sixth-man coverage | 148 of 148 vs 148 for v0.3 | Yes |
| B7 Pts | vs v0.3 −0.09 (−0.17, −0.00); vs v0.1 −0.56 (−0.74, −0.39) | Yes |
| B8 Reb | vs v0.3 −0.07 (−0.10, −0.04); vs v0.1 −0.28 (−0.35, −0.22) | Yes |
| B9 Ast | vs v0.3 −0.01 (−0.03, +0.01); vs v0.1 −0.17 (−0.22, −0.12) | Yes |
| B10 Calibration | p10–p90 share: minutes **0.728**, pts **0.759**, reb 0.789, ast 0.799. ECE 0.043. Brier Δ vs v0.3 −0.040 (−0.050, −0.031) | **No** |
| B11 Large errors | Δ per 100 vs v0.3 −0.34 (−1.18, +0.47). Rows ≥ 41: 0 vs 1 | Yes |
| B12 Integrity | Every side at 240. Unexplained rows 0 | Yes |

**B10.** Minutes and pts intervals fall below the 0.76 floor, so p10 to p90 is too narrow. The miss stands. v0.7's SD rule is unchanged, and a fix would be a new version under its own preregistration. **INFERRED:** the same miss is likely in the forward window, since nothing in v0.7 widens minutes intervals. That would block promotion under the no-single-metric rule.

## 2. Against v0.6's published numbers (MEASURED, with a caveat)

v0.6's code was not re-run. Its figures come from `NBA_V06_SEEN_DATA_REPLAY_2026-11-02.md`, on 1,442 rows that also needed a v0.5 projection. v0.7's rows number 1,463, so this is a side-by-side, not a paired comparison.

| Metric | v0.3 frozen | v0.6 replay | v0.7 replay |
|---|---:|---:|---:|
| Minutes MAE | 5.69 | 4.98 | 4.93 |
| Minutes bias | −1.54 | +0.57 | −0.03 |
| Unconditional error per team-game | 96.8 | 78.4 | 80.0 |
| Participation Brier | 0.159 | 0.122 | 0.119 |
| Starters projected of 740 | 735 | 733 | 735 |
| All who played projected of 1,661 | 1,629 | 1,608 | 1,629 |
| Rows ≥ 41 | 1 | 0 | 0 |

- **v0.6's two missed bars are met here on seen data.** v0.6 missed R3 (bias) and R6 (starters). Both Podziemski 10-23 and Smart 10-31 stay projected by rule, which is the coverage count above. That is what the rules were written to do, on games those lessons came from, so it is no evidence of forward value.
- **Unconditional error is 80.0 against v0.6's 78.4.** No interval was computed between them.

## 3. Supporting detail (MEASURED)

- **Who played with no projection, 32 rows:** 20 rookies, 10 listed Out at freeze, 2 veterans with no recent box score. All have a reason code. The same 32 count as v0.3's.
- **Participation:** ECE 0.043 against 0.117 for v0.3.
- **Unallocated minutes:** 47 of 148 sides under-full, median 0, mean 3.9, max 40.18 per side.
- **By population:** starters still run low and bench high, as in the completed-season study (section 2 of the preregistration).
- **Pts against v0.3:** the interval's upper end sits at −0.004. **Ast against v0.3 is not established**, and its interval includes 0.

## 4. First forward look (MEASURED at this head)

The schedule captured on 2026-11-01 has no regular-season game on the ET date 2026-11-03, so the first forward slate is 2026-11-04 with 14 games, then 2, 9 and 7. **INFERRED:** 30 graded games could arrive around 11-07, if the schedule holds and grading keeps pace.

Coverage report, 2026-11-04, latest committed inputs as of 2026-11-02T22:00Z, 28 teams: starters 140 of 140, sixth men 28 of 28, other rotation 156 of 157 with 1 `OUT_IN_FEED`. Coverage report, 2026-11-02, frozen receipt inputs, 30 teams: starters 147 of 150 with 3 `OUT_IN_FEED`, sixth men 30 of 30, other rotation 166 of 167 with 1 `OUT_IN_FEED`. Neither joins an outcome of its slate. Both use the last-lineup proxy, so a starter who changed since the last game is not seen.

## 5. Limits

- Seen data, 74 games, all October. Game-clustered intervals do not account for one player repeating across games.
- The Day-To-Day proxy has never been measured against a listing.
- Injury status comes from the feed at each freeze, so a change between freeze and tip is invisible.
- v0.7's medians come from a simulation with v0.3's rates and seed. Only v0.1 and v0.3 have receipts.
