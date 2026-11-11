# NBA Elo — root cause of staleness and config evidence (founder P0D, 2026-11-11)

Status: **EXPLORATORY, development seasons only. No change to official forecasts or history.** Engine
(forecast-guard). Report: `data/internal/research/nba/reports/elo-config-walkforward-dev.json`. Script:
`app/scripts/nba/research-elo-config-walkforward.mjs`.

## 1. Root cause, confirmed in code and data
The official Elo is frozen **by design of its data rule**, not by a failed job.

| Fact | Line reference |
|---|---|
| The official NBA game head is the Elo side in the v0.1 receipt | `app/src/lib/consistency/official-snapshot.mjs:30,327`; `NBA_OFFICIAL_FAMILY` at `:338` |
| Family v0.1 has `dataRule: "corpus-v1"` | `app/src/lib/sports/nba/experimental-forecast.mjs:68` |
| The builder passes only the corpus rows for that rule | `app/scripts/nba/build-nba-experimental-forecasts.mjs:152` (`corpusRows = corpus.rows`); finals fold only when `dataRule === "corpus-v1+season-2026-27"` (`:156`, `:163–171`), i.e. v0.2 and v1, never v0.1 |
| Ratings are built from exactly those rows | `experimental-forecast.mjs:268` → `team-rating.mjs:90` `buildTeamRatings(rows, …)` |
| The corpus ends at the 2025-26 Finals | `data/internal/research/nba/corpus-v1.json`: 4,179 rows, latest `dateUtc` 2026-06-14T00:30Z, the receipt's `lastFoldedDateUtc.regular` |
| The 2026-27 start applies one boundary regression and then nothing more | `team-rating.mjs:54` `regress`, applied once via `targetSeason` (`:108–110`) |

## 2. Which implementation produced which number
| Number | Implementation | Config |
|---|---|---|
| **Model card** `model-card-v1.json:11,13` (Elo log loss 0.6161, n 2643) and `reports/baseline-evaluation-v1.json` | `app/scripts/nba/evaluate-nba-baselines.mjs` (its own inline Elo, `:36–42`) | K 20, HA 70, **mean 1505, regression 1/3** (`:42`), **in-season** walk-forward, cutoff = earlier **UTC** dates (`:72–74`), warm-up 2023-24 (`:33`), all non-preseason phases |
| **Public forecasts** (v0.1 receipts, the official Elo side) | `app/src/lib/sports/nba/team-rating.mjs` | K 20, HA 70, **mean 1500, regression 0.25** (`:22`), **frozen** for 2026-27 (§1) |
| v0.2 and v1 challengers, prereg v2 in-season challenger | `team-rating.mjs`, with the 2026-27 finals folded | 0.25, in-season |

So the card evaluated a **different config** from the one published:
- regression 1/3 vs 0.25;
- in-season updating vs frozen.

The mean (1505 vs 1500) is immaterial, because all teams start equal. The re-run in §3 reproduces the card's 0.6161 and
n 2643 exactly with the card's rule, which confirms the attribution.

## 3. Walk-forward comparison: development seasons only
**Setup:**
- Corpus-v1, with 2023-24 as fit-only warm-up and 2024-25 and 2025-26 evaluated. Both seasons were already seen by
  the card's evaluation; 2026-27 is not touched (prereg v2).
- The official update rule throughout (`team-rating.mjs` K, HA, scale).
- **One cutoff for every config:** finals on ET dates strictly before the game's ET date (prereg v2 §3).
- Game bootstrap B 2000, seed 20261020.

**Regular season** (n = 2,460; lower is better):

| Config | Log loss | Brier | ECE (10 bins) [95% CI] | Home bias |
|---|---|---|---|---|
| frozen-0.25 (**the official as run**) | 0.6720 | 0.2384 | 0.057 [0.048, 0.080] | +0.039 |
| frozen-1/3 | 0.6681 | 0.2371 | 0.043 [0.037, 0.068] | +0.041 |
| inseason-0.25 | 0.6139 | 0.2127 | 0.038 [0.026, 0.058] | +0.038 |
| **inseason-1/3** | **0.6131** | **0.2124** | 0.039 [0.026, 0.058] | +0.039 |

**Paired differences** (log loss; 95% CI):

| Comparison | All regular season | First 30 days only (n 447) |
|---|---|---|
| inseason-0.25 − frozen-0.25 | **−0.0581 [−0.0693, −0.0461]** | **−0.0211 [−0.0311, −0.0114]** |
| inseason-1/3 − frozen-0.25 | **−0.0589 [−0.0702, −0.0467]** | **−0.0221 [−0.0332, −0.0115]** |
| frozen-1/3 − frozen-0.25 | **−0.0038 [−0.0055, −0.0022]** | −0.0014 [−0.0051, +0.0022] |
| inseason-1/3 − inseason-0.25 | −0.0008 [−0.0016, 0.0000] | — |

Brier points the same way in every row. Each season agrees on its own:
- In-season vs frozen-0.25: 2024-25 0.6172 vs 0.6599; 2025-26 0.6106 vs 0.6841.
- All non-preseason phases give the same ordering.

**Reading:**
1. **In-season updating is the dominant effect.** A season-long frozen Elo is about 0.058 worse in log loss, close to
   the strength-blind home-rate baseline (0.6883). Even in the first 30 days the frozen ratings are measurably worse.
   This is the development-data counterpart of what the prereg v2 shadow is testing forward (exploratory 2026-27:
   −0.0136).
2. **1/3 vs 0.25 regression is second-order.**
   - Frozen ratings: 1/3 is better (−0.0038, CI excludes 0), because a stronger pull to the mean partly compensates
     for not updating.
   - In-season: the difference is −0.0008, with an upper bound that rounds to 0.0000. That is borderline, and I do not
     claim it.
3. **Every config over-predicts the home side by about 4 points of probability** (home bias +0.038 to +0.041). This is
   the HA = 70 question that prereg v2's HA challenger addresses. It is not resolved here.

## 4. Recommendation (founder decision input)
- **Most defensible config: in-season updating with 1/3 regression.** It is the exact config the model card evaluated
  and published (0.6161), and it is best or tied-best on every development metric.
  - 0.25 vs 1/3 *within* in-season updating is not distinguishable on development data.
  - Choosing 1/3 also aligns the code with the card instead of the other way round.
  - 0.25 has no documented source in `team-rating.mjs` beyond "the program's 25%".
- **How to get there without breaking the rules:**
  - (a) **Let prereg v2 reach its verdict** (n ≥ 300 confirmatory games, about late December). Promotion follows the
    normal approval. Folding the official mid-test would void the confirmatory comparison.
  - (b) **Settle the regression value** (prereg v2 §6 founder item 1) at or before promotion. It only takes effect at
    the 2027-28 boundary.
  - (c) **Treat the home-advantage over-prediction separately** under the prereg's HA challenger. It is not a reason to
    change K or regression.
- **Not recommended:** re-fitting K or HA on these seasons, or any change to published history. Numbers already
  published stay graded under the frozen official.
