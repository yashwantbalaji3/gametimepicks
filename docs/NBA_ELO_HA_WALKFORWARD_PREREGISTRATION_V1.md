# NBA Elo home-advantage walk-forward challenger: pre-registration v1 (FROZEN DRAFT, awaiting founder approval of this hash)

**Status: FROZEN, NOT APPROVED.** No score of the challenger against a real outcome is computed until the founder approves this exact file in writing.

How approval is recorded:
- The file's sha256 goes in `APPROVED_PREREG_SHA256`, and the approval instant in `PREREG_APPROVED_AT` (`app/src/lib/sports/nba/elo-ha-walkforward.mjs`).
- The scorer refuses any other file, and refuses an approved file that has no timestamp.
- `elo-ha-walkforward.test.mjs` pins this file's bytes to `PREREG_DRAFT_SHA256`. Any edit after freezing changes the sha256 and makes a new registration.

## 1. The founder's decision (2026-11-10), verbatim

Source: `~/gtp-evidence/nov10-founder-parlay-v3-decisions.md`, decision 2, quoted without edits:

> DECISION 2, APPROVED: NBA Elo stays available but untiered.
> - Shown in Today, the NBA hub, game pages and the Parlay Lab research section as MODEL PROJECTION, with a concise calibration caveat.
> - Never used for an official risk tier or presented as a validated edge.
> - Priorities: home-court correction, verified injuries/minutes, comparison with other NBA engines (Theater), forward evaluation (calibration, log loss, Brier, accuracy vs baselines), calibrated challengers without touching frozen history. One official NBA forecast per game/market. Promote through the normal approval, then enable the NBA tiers.

The Program Director's task text (2026-11-10), as relayed:
- the challenger's home advantage is "re-fit by MLE on games strictly before each game date (walk-forward), everything else identical", with "no tuning and no knobs chosen after seeing results";
- "confirmatory = games after founder approval";
- "the already-seen 2026-27 games are exploratory forever";
- "the primary is the paired log-loss difference (challenger − official) with a game-clustered CI that excludes 0 favourably";
- "Copy the n minimum from the existing §7 winner bar (n ≥ 300) verbatim; invent no new constant."

## 2. What is compared

- **Official:** the published Elo game-winner estimate, `nba-winner-side@1`. For each game it is the frozen official `forecast.elo.pHome` in the v0.1 forecast file of record (`data/internal/research/nba/experimental-v0.1/forecasts/<date>.json`), the value the public lane publishes. Ratings come from `team-rating.mjs`: K 20, home advantage 70 (0 at a neutral site), scale 400, 25% regression toward 1500 at each season boundary.
- **Challenger** `nba-elo-ha-walkforward@1` (`elo-ha-walkforward.mjs`):
  1. **Ratings:** the official frozen home and away ratings of that game (`forecast.elo.home.rating`, `forecast.elo.away.rating`). The challenger refuses a game whose frozen `pHome` the official formula does not reproduce to 4 decimals. Nothing else of the official model changes.
  2. **Home advantage h:** re-fit for each game by maximum likelihood. The training set is every game that:
     - was not played at a neutral site;
     - is strictly before both the official forecast's `inputAsOf` and the game's ET calendar date (America/New_York, the official record's `etDateOf`).

     Each training game is (the official pre-game rating difference home − away, home won), from one of two sources:
     - **Corpus seasons (2023-24 → 2025-26):** the regular-population games (phase ≠ 1) of the official fold (`historySamples`), with the fold's pre-game ratings.
     - **The current season:** the regular-season games of the frozen official v0.1 forecasts (`seasonSamples`). The rating difference is that forecast's own frozen ratings, and the result comes from the official finals record. Only state FINAL counts; a final under review or pending is left out, and a game frozen more than once keeps the latest freeze before tip.

     The official v0.1 Elo does not fold the current season (family data rule `corpus-v1`): every team's official rating has been constant since the 2025-26 boundary regression. So the frozen ratings are exactly the official pre-game difference of each current-season game.

     The likelihood is the official logistic, p = 1 / (1 + 10^(−(d + h) / 400)). h is the root of the monotone score Σ (y − p), found by 100 bisection steps on [−400, 400]; the bracket is the official scale, and a boundary hit is reported.
  3. **Probability:** pHome = 1 / (1 + 10^(−(ratingHome − ratingAway + h) / 400)). At a neutral site h = 0, so the challenger equals the official.

  There is no window, shrinkage, prior, recency weight or any other parameter. The training set grows by one game per final, all history included. The rating trajectory stays the official one: the challenger corrects only the home-advantage term, and the official ratings' own staleness within the season is out of its scope.

## 3. Windows

- **Confirmatory:** games whose tip is strictly after `PREREG_APPROVED_AT` of this file's sha256, and that meet all of:
  - regular season (label "NBA REGULAR SEASON — SHADOW");
  - official forecast frozen before tip (§8 of docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md);
  - an official final in the record that is not under review;
  - a challenger value that is computable (no refusal).
- **Exploratory forever:** every 2026-27 game tipping at or before the approval instant, including all games already seen in any report. They are counted, never scored, and never enter a confirmatory number.

## 4. Primary analysis and decision

| Item | Rule |
|---|---|
| Unit | one game: (official pHome, challenger pHome, home won) |
| Primary score | paired log loss difference per game, challenger − official (lower is better) |
| Interval | 95% game-clustered percentile bootstrap of the mean difference, B 2000, seed 20261020, alpha 0.05 (the champion/challenger evaluator's defaults, `bootstrap.mjs`) |
| n | ≥ 300 confirmatory games, verbatim from §7's winner bar (`PREREG.winner.minN`) |
| CHALLENGER_BETTER | n ≥ 300 and the interval's upper bound < 0 |
| CHALLENGER_WORSE | n ≥ 300 and the interval's lower bound > 0 |
| INCONCLUSIVE | n ≥ 300 and the interval includes 0 |
| INSUFFICIENT_N | n < 300 |

A CHALLENGER_BETTER verdict is an input to a founder decision, never a promotion. Promotion follows the normal approval. Until then, the official Elo stays the only published value, and the challenger feeds no public surface, pick, tier or card.

## 5. Reported, no bar

The paired Brier difference with its interval, on confirmatory games only.

The published Elo's own block (`grader-metrics.mjs` → `winner.elo.published` and `states.winnerElo`) is reported on every forward row. It is the official model's validation, not a comparison with the challenger. Its fields are n, log loss, Brier, ECE (10 bins), mean pHome, realised home-win rate and home bias, each with a game-clustered 95% interval, judged against §7's winner bars verbatim.

## 6. What changes nothing

- No frozen forecast, published lane or ledger history is rewritten.
- The challenger is computed from committed inputs only.
- Its scores exist only after approval, and only for confirmatory games.
