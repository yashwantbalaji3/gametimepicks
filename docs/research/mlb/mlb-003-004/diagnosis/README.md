# MLB-003 / MLB-004 · diagnosis: why the player models fail, and the improvement plan (2026-10-10)

**Exploratory.** Every 2026 window of the settled player rows was already examined in the baseline audit (and Sep–Oct game outcomes in MLB-002). Nothing here is holdout or qualification evidence.

**Receipts:** `diagnose-distribution-vs-mean.mjs` → `diagnosis-summary.json`.

## 1. How the current engine works (`pipeline/mlb/mlb_model.py`)

| Quantity | Current method | Missing |
|---|---|---|
| Batter mean (hits, TB, H+R+RBI) | `0.5 × last-10 mean + 0.5 × season mean` of the player's own game logs (`:310`); minimum 5 games | Opponent pitcher, handedness, batting slot / expected PA, park, home/away, prior seasons |
| Pitcher strikeout mean | `0.55 × last-3 mean + 0.45 × season mean` of **every** appearance's K, relief included (`:249`) | Batters faced, workload or pitch count, opposing lineup K%, starts-only filter, rest |
| Spread | Population SD over the **whole season**, floored (hits 0.85, TB 1.10, H+R+RBI 1.20, K 1.6) (`:71-79`, `:250`, `:311`) | Per-player count distribution; over-dispersion |
| P(over line) | **Normal** CDF `1 − Φ((line − μ)/σ)` (`:328-333`) | A count distribution (these are small non-negative integers; TB is heavily zero-inflated) |
| Edge / lean | Model P vs **vigged** implied probability per side (`mlb_odds.py:224-229`) | De-vigging; calibration (the Platt layer exists but is research-only) |
| Pregame safety | Logs fetched live before first pitch; **no date filter**, so a rerun for a past date would leak | A `date < gameDate` guard on any historical rebuild |
| Full-game simulation | Consumes the same means (`expHits`, `expTotalBases`, `expStrikeouts`) | (inherits all of the above) |

## 2. Mean or distribution? Hold the published mean fixed, change only the distribution

| Market (n) | A published (normal) | C Poisson | D neg. binomial, fit on earlier months | Market | AUC of (mean − line) | Market AUC |
|---|---|---|---|---|---|---|
| Hits (18,210) | 0.6803 | 0.6785 | 0.6786 | 0.6640 | 0.589 | 0.608 |
| Hits+runs+RBI (17,460) | 0.7215 | 0.7373 | **0.7036** | 0.6874 | 0.535 | 0.560 |
| Total bases (7,926) | 0.7138 | 0.7116 | **0.6866** | 0.6745 | **0.512** | 0.539 |
| Pitcher K (2,234) | 0.7514 | 0.7456 | 0.7397 | 0.6850 | **0.508** | 0.573 |

The values are log losses (coin 0.6931). A continuity correction is identical to A for the half-point lines all these markets post, so it is not the issue.

**Answer: both, by market.**
- **Distribution shape.** A count distribution with fitted over-dispersion recovers most of the gap for **total bases** (0.714 → 0.687, against the market's 0.675) and a large part of it for **hits+runs+RBI** (0.722 → 0.704). Hits are close to Poisson, so the shape matters little there.
- **The means barely discriminate.** For **strikeouts (AUC 0.508)** and **total bases (0.512)**, the projected mean is close to uninformative about over vs under, against market AUCs of 0.573 and 0.539.
  - No distribution change can fix that. It needs **better inputs**.
  - For strikeouts: expected batters faced (workload), the opposing lineup's K%, starts only, and handedness. The current mean mixes relief outings and ignores opportunity.
- **Calibration of the over side:** the systematic over-lean in the baseline (P(over) 5–11 points too high) is consistent with a symmetric normal applied to right-skewed counts around half-point lines.

## 3. Data

**Outcome capture, built.** `app/scripts/mlb/capture-mlb-boxscore-outcomes.mjs` uses StatsAPI `/game/{pk}/boxscore` with a field filter (~40 KB per game; free, no key; one request at a time; append-only per date). Per player per game it records:
- **Batting:** PA, AB, H, 2B, 3B, HR, TB, R, RBI, BB, IBB, HBP, SO, SB and batting order.
- **Pitching:** start flag, outs, IP, batters faced, pitches, strikes, SO, BB, HBP, H, R, ER, HR.

It is labelled `POSTGAME_OUTCOMES`: an evaluation target, and an input only for **later** games. Backfill for 2026-05-16 → 10-08 is in `data/internal/mlb/boxscore-outcomes/`.

This closes the gaps the baseline listed: separate runs, RBI and HR for every batter, and per-start outs, innings, batters faced and pitches.

**An untouched historical holdout (proposal, not yet captured).**
- **The opportunity:** 2024 and 2025 have never been examined in this repository for player outcomes. StatsAPI serves their box scores, about 2,430 games per season, roughly 40 minutes of polite requests and a few MB per season compressed.
- **Why it works:** the current model is a deterministic function of season game logs, so it can be rebuilt point in time (`date < gameDate`) for each game.
- **What it allows:** an honest **develop on 2024, hold out 2025** test of full count distributions, scored by log score and CRPS of the actual count.
- **Limitations, stated up front:** no market prices for those seasons (no market benchmark; the comparison is with the current model and simple baselines); features are **rebuilt**, not captured pregame; and no confirmed lineups (the slot comes from the box-score batting order, which is known only after the game, so it may not be used as a pregame input).

## 4. Improvement plan (each challenger preregistered before it is evaluated)

**MLB-004 · strikeouts (first, because the gap is largest):**
- **Mean:** expected batters faced (from the pitcher's recent starts only: BF per start, shrunk) × a log5 K-rate of the pitcher's K% against the lineup's K%, by handedness (the matchup-v1 inputs).
- **Distribution:** negative binomial in K, or binomial over BF, with dispersion fit on development data.
- **Benchmarks:** the current model, a starts-only last-N baseline, and the market where a pregame price exists.

**MLB-003 · batters:**
- **Means:** per-PA rates (hits; extra-base hits by type; HR; BB) from the batter's shrunk splits vs the starter's hand and the starter's DIPS rates. Expected PA from the batting slot when known pregame, else the published constant.
- **Distribution:** a binomial or NB count per stat. H+R+RBI is built from its components with run/RBI context from the team's simulated scoring, which links to MLB-005.

**MLB-005 · coherence:** the full-game simulation already plays these same PAs. The first coherence test asks whether the simulation's own per-player distributions (`players` in the artifact and the matchup-v1 shadow) score at least as well as the separate prop model on the same rows. If they do, the props can derive from the game simulation instead of a second model.

**Evaluation rule (no untouched 2026 window remains):**
- Development on 2026 data, already exposed.
- Primary qualification **forward**: the remaining 2026 postseason, then 2027.
- **If the 2024/2025 capture is approved, a 2025 holdout** for distribution quality.
- Failed results are kept. Nothing is promoted without a separate founder decision.
