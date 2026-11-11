# NBA minutes: v0.3 vs official v0.1 — preregistration DRAFT (for founder approval)

**Status: DRAFT, NOT APPROVED. Nothing is promoted.** 2026-11-12, forecast-guard (engine). The drafter has seen the
exploratory results (`docs/NBA_MINUTES_BY_PLAYER_TYPE_EVALUATION.md`). Every bar, minimum and rule below is therefore
**copied** from approved documents and cited, and none is new. On approval, the file's sha256 and approval instant are
recorded the same way as prereg v2 (`docs/NBA_ELO_WALKFORWARD_PREREGISTRATION_V2.md`, header), and the scorer refuses
any other file.

## 1. Hypothesis (one primary comparison)
**H1.** On confirmatory 2026-27 regular-season games, v0.3's frozen pregame expected minutes
(`nba-minutes-model-v0.3-role-prior`) have lower absolute error than the official v0.1's frozen expected minutes
(`nba-minutes-model-v0`, game-sim rescale).

- **Primary statistic:** the paired mean of |v0.3 − actual| − |v0.1 − actual|; lower favours v0.3.
- **Interval:** game-clustered percentile bootstrap, B 2000, seed 20261020 (`bootstrap.mjs` defaults).
- **Direction claim:** only when the 95% interval excludes 0. This is the house rule, as in prereg v2 §4 and the v0.3
  arming text (`docs/nba/NBA_V01_PRESEASON_MINUTES_INVESTIGATION_2026-10-21.md` §5).

**Secondary, reported, never a verdict:**
- the challenger `nba-minutes-current-season@1` vs v0.1, and v0.3 vs the challenger;
- bias;
- 80% coverage (each model's own interval);
- the player-type strata of the exploratory evaluation (star, starter, bench, rookie, traded, returning, promoted, with
  definitions frozen in `evaluate-nba-minutes-by-player-type.mjs`);
- coverage of played players.

## 2. Population and unit
- **Unit (copied from the v0.3 arming text):** paired pregame regular-season player-games with expectedMinutes ≥ 20 in
  both models, where the player played (minutes > 0 in the final box score).
- The all-minutes population and the strata are reported as secondaries.
- **Sources:**
  - frozen `experimental-v0.1/forecasts/<date>.json` and `experimental-v0.3/forecasts/<date>.json`;
  - each game's `inputAsOf` strictly before `dateUtc`, and `gamesAlreadyStartedAtNow` = 0 for the date (V18 §8);
  - actuals from the committed final box scores.

## 3. Confirmatory vs exploratory
- **Confirmatory:** games whose tip is strictly after the approval instant of this file's sha256, from slates frozen
  after that instant.
- **Exploratory forever:** every game at or before approval. That includes the 160 games (3,517 rows) already in the
  exploratory report. They are counted, never scored into the verdict (prereg v2 §3 rule, copied).

## 4. Minimum sample and single look
- **Both minimums must hold before the single look:**
  - ≥ **300 graded games** (V18 §6 game minimum, and prereg v2 §7, copied);
  - ≥ **1,500 matched player-games** with expectedMinutes ≥ 20 (V18 §6, the points/rebounds/assists minimum, copied).
- **One look**, computed once and frozen in the looks log (V18 §12).
- **Below either minimum: INSUFFICIENT_N.** No interim verdict.
- **Timing (estimate, not a commitment):** at about 7–8 games a night, 300 confirmatory games arrive in roughly 6
  weeks from approval.

## 5. Verdicts
| Verdict | Rule |
|---|---|
| V03_BETTER | 95% CI upper bound < 0 |
| V03_WORSE | 95% CI lower bound > 0 |
| INCONCLUSIVE | the CI contains 0 |
| INSUFFICIENT_N | a §4 minimum not met |

**A V03_BETTER verdict is an input to a founder decision, never a promotion** (prereg v2 §4, copied). Promotion also
needs the V18 §7 points-family minutes bar on the same rows: **minutes MAE ≤ 6.0** (V18 §7, copied). It then follows
the normal approval: a founder-approved promotion record (the PR 1154 READY_FOR_FOUNDER_REVIEW route) and the release
gate.

## 6. What does not change
- v0.3's rule and constants are frozen as armed.
  - That includes `PRIOR_GAMES = 10` and `MINUTES_POWER = 1.25`.
  - The exploratory hint that the prior weight is too heavy late in a season is **not** acted on here. Changing it is
    a new version string with its own shadow and a sourced constant (founder item).
- v0.1 stays the official player family until a promotion. No frozen forecast or graded record is edited.
- Cross-product rule: a promotion switches site, social and grading together on one date, and history stays graded
  under the version that was published.

## 7. Founder items (left unfilled)
1. Whether the verdict should also gate the stars stratum on its own. It is reported only here; gating it would be
   multiplicity.
2. Whether to pair this with the Elo prereg v2 promotion (one release, one build) if both verdicts land together.
