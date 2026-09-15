# MLB game totals — engine-prior sensitivity study (P317, 2026-09-15)

**Status:** DEV ONLY · SECOND LOOK. The 2026 graded record is seen. Nothing here is a candidate score, a bar or an adoption.
The over/under call stays **PAUSED** under the live-record gate. Registration: `engine-level-shadow-protocol.json` (forward only, private).

## Question
The diagnosis named a LEVEL defect (simulated ~7.8 runs a game against ~8.9 scored). Which documented league approximation inside
`lib/mlb/full-game` pulls the level down, and can a principled candidate repair it without degrading the distribution's shape?

## Method
Every graded total row's forecast of record names an artifact hash; the git revision that first carried it supplies the board and the
team-markets comparison, the committed lineup archive supplies the batting orders (latest capture at or before generation; the
lineup-refresh job simulates on a capture it never commits, so the next committed pre-first-pitch capture stands in as its twin).
The control re-simulation must reproduce every simulated output of the committed game (204 of 263 did; 59 are excluded, not
approximated — their in-job capture differs from anything committed). Every configuration then re-simulates with production's seed
per game (common random numbers) through the same engine, parameterised (`EngineParams`; the defaults are the published engine byte
for byte, pinned by test).

## Results (204 games, 2026-08-23 → 2026-09-14; actual 9.3431, posted line 8.2034)
Level = actual − simulated mean (0 is right; positive = the engine is low). Slope = simulated mean per point of posted line (actual: 1.3194).
Coverage targets 0.80; PIT tail mass 0.20 if well specified (higher = too tight); log loss and ECE lower is better (coin 0.6931, market 0.6947).

| id | mechanism | sim mean | level | slope | sd | cov | width | PIT tails | LL fixed | ECE fixed | hits/tm | BB/tm | HR/tm |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C0 | control — the published engine | 7.8141 | 1.529 | 0.2102 | 3.9174 | 0.7598 | 10.0098 | 0.2794 | 0.7905 | 0.1854 | 8.3278 | 3.2633 | 1.055 |
| W | walk + HBP rate 0.085 → 0.093 | 8.1464 | 1.1967 | 0.2191 | 4.0294 | 0.7794 | 10.3971 | 0.2549 | 0.7703 | 0.1856 | 8.4169 | 3.6088 | 1.0652 |
| E | reach on error 0 → 0.009 per PA | 8.2106 | 1.1325 | 0.2207 | 4.0473 | 0.7941 | 10.4216 | 0.25 | 0.7698 | 0.1848 | 8.4286 | 3.3028 | 1.0678 |
| B | bases-per-hit fallback 1.58 → 1.63 | 7.9301 | 1.4131 | 0.1751 | 3.9465 | 0.7696 | 10.1275 | 0.2843 | 0.7834 | 0.1817 | 8.3253 | 3.2617 | 1.1091 |
| D | double plays 0 → 0.12 per opportunity | 7.4917 | 1.8514 | 0.1964 | 3.8225 | 0.7402 | 9.701 | 0.3039 | 0.8156 | 0.2106 | 8.1938 | 3.2109 | 1.0377 |
| F | free advance 0 → 0.013 per PA with runners on | 7.9096 | 1.4335 | 0.2091 | 3.9377 | 0.7745 | 10.0833 | 0.2794 | 0.7843 | 0.1895 | 8.3272 | 3.2629 | 1.0553 |
| S | PA divisor 3.85 → 4.27 (self-consistent) | 6.5416 | 2.8015 | 0.1787 | 3.5164 | 0.6765 | 8.8088 | 0.3529 | 0.92 | 0.2883 | 7.3162 | 3.1801 | 0.9268 |
| P | productive out scores from third 0.4 → 0.5 | 7.88 | 1.4631 | 0.2123 | 3.9276 | 0.7696 | 10.0588 | 0.2794 | 0.7872 | 0.1866 | 8.3258 | 3.2616 | 1.0548 |
| X | starter pulled after 22 batters (was 25) | 7.8076 | 1.5355 | 0.2104 | 3.9121 | 0.7549 | 9.9657 | 0.2794 | 0.7928 | 0.1965 | 8.3253 | 3.264 | 1.054 |
| H | input level: hits ×1.037, total bases ×1.069 | 8.3546 | 0.9885 | 0.2612 | 4.0601 | 0.7892 | 10.5147 | 0.2451 | 0.7618 | 0.1595 | 8.6573 | 3.2915 | 1.1496 |
| R | un-lined batters at 0.80 hits / 1.25 TB (was 0.70 / 1.10) | 8.1284 | 1.2147 | 0.2253 | 4.0164 | 0.7892 | 10.3431 | 0.2549 | 0.7698 | 0.1815 | 8.5797 | 3.2847 | 1.0803 |
| BUNDLE_LEAGUE | W + E + B + D + F | 8.4289 | 0.9143 | 0.1651 | 4.1094 | 0.7941 | 10.6176 | 0.2402 | 0.7595 | 0.1671 | 8.3774 | 3.5923 | 1.1156 |
| BUNDLE_LEAGUE_H | W + E + B + D + F + H | 8.9952 | 0.348 | 0.2153 | 4.2422 | 0.8039 | 10.9853 | 0.2402 | 0.7435 | 0.1365 | 8.7122 | 3.6239 | 1.2149 |

By month, control vs the documented bundle: August 7.7627 → 8.3766 against 8.8378 actual;
September 7.8434 → 8.4586 against 9.6308. The season's league environment is 8.70 (August) to 8.85 (July) runs a game; September is running hot.

## Reading
1. **The level is repairable with documented rates.** Walks + HBP (+0.33), reach on error (+0.40), free advances (+0.10) and the
   bases-per-hit fallback (+0.12) lift the level; double plays (−0.32) lower it. The bundle of all five — the documented rule set, not
   the subset that helps — lands at 8.4289, at the August environment and about 0.3 under the season's, with
   coverage 0.7941, PIT tails 0.2402 and width 10.6176 (control 10.0098): the level is not bought with wide intervals.
2. **The PA divisor is a hidden knob.** The engine's realised PA per lineup slot is 4.27, not the documented 3.85, so simulated hits run
   11% above the board's summed projections (8.33 against 7.5). Made self-consistent (S) the level falls to 6.54. The documentation's
   "hits reproduce by construction" is not true today; the candidate keeps the divisor as published and says so.
3. **The over/under call is not a level problem.** Under every configuration the simulated mean rises only 0.17–0.26 runs per point of
   posted line where actual rises 1.3194. In the ≤7.5 band the control's P(over) is already calibrated (ECE 0.0685); it
   breaks at 8–9 (0.2354) and ≥9.5 (0.2847), where the engine cannot tell a 10.5 game from an 8 game. No level
   mechanism changes that; the best bundle still shows fixed-side log loss 0.7595 against a 0.6931 coin. **No candidate for the
   call is ready**, and the plan's bars for it (ECE ≤ 0.05, log loss below the coin) are not approached on dev.
4. **Input level (H)** — hits ×1.037 and total bases ×1.069, the settled-actual ÷ projection ratios on this seen record — adds another
   +0.57 and would put the level at 8.9952. It is a second-look fit and belongs to the projection pipeline, so it is disclosed and excluded.

## Decision
- Over/under call: **no repair ready**; pause stays. Next research question: between-game differentiation (pitcher run prevention beyond
  strikeouts, park run environment from the repo's own committed linescores, lineup quality) — a separate registration.
- Engine level: register the documented bundle as a **forward-only private shadow** scoped to distribution quality (level, coverage,
  PIT, width guard, no worse fixed-side log loss), minimum 200 forward games, one verdict. It does not touch the pause and does not
  become public without a founder-approved adoption.
