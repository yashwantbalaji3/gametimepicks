# NFL starting-QB fallback tiers — forward-validation pre-registration (DRAFT)

Status: **DRAFT — not approved.** Founder approval is required before any forward look counts. This draft was written
by the engine session after the exploratory evaluation below was seen. **The bars in §5 are therefore left for the
founder to set**; the engine session does not choose them.

## 1. What is tested
Projections of passing yards for an NFL team's identified starting quarterback when he is **not established** at his
club (founder decision 2026-11-11):

| Tier | Who | Method (frozen at approval) |
|---|---|---|
| (b) limited individual history | traded / backup now starting, ≥ 25 verified NFL pass attempts | `tierBProjection` — STARTER_SHARE × club pass-attempt form × his own all-club shrunk completion rate and yards per completion (P300 constants) |
| (d) rookie / contextual fallback | < 25 verified NFL pass attempts | `tierDProjection` — his own attempts (often none) shrunk toward the low-history prior (completion 0.61643, yards per completion 11.3835, attempt share 0.9232; REG 2013–2017 low-history starts, n = 115), × club pass-attempt form, × opponent pass-defence ratio, dispersion scale 1.5 (strictly wider than (a)/(b)) |
| (c) college translation | — | **not built**: no verified college statistics are committed; a source needs founder approval (see §7) |

Every constant comes from a committed file:
- `data/internal/research/nfl/reports/player-props-share-level-preregistration.json`: rates, team form, dispersion, grid, bootstrap.
- `…/player-props-share-level-second-look.json`: the pass-yards dispersion scale, 1.25.
- `…/qb-starter-tier-b-backtest.json`: STARTER_SHARE 0.9746.
- `…/qb-fallback-categories-exploratory.json`: the tier (d) prior and its dispersion scale.

The code paths are `app/src/lib/sports/nfl/qb-starter-projection.mjs`, the board builder's tier rule, and the
evaluation scripts. All are frozen by commit sha at approval.

## 2. Population (forward)
Every regular-season game after approval in which the board's identified starter is tier (b) or (d). Each forecast is
the board's last pre-kickoff projection (the receipt of record: latest before kickoff). The outcome is the starter's
official passing yards in that game. A game where he does not take a snap is excluded and counted separately.

## 3. Baselines
- **League-average starter:** STARTER_SHARE × club form × league rates.
- **Team context only:** the club's own recent passing efficiency, with no QB history.

## 4. Metrics
For each tier:
- n;
- mean pinball loss over q ∈ {.1, .25, .5, .75, .9} (lower is better);
- the paired pinball difference against each baseline, with a 95% cluster bootstrap over season-weeks (2000 resamples, seed from the P300 prereg);
- bias (mean actual − mean median);
- level (Σ actual / Σ mean);
- 80% interval coverage.

## 5. Bars — FOR THE FOUNDER TO SET
Options, for reference only:
- the committed P300 bars (coverage 0.72–0.88, level 0.92–1.08, n ≥ 300);
- a smaller per-tier minimum n.

Week 10 has 6 non-established starters, so n ≥ 300 would take most of a season or more. **Until a bar is approved and met, both tiers stay "EXPERIMENTAL MODEL PROJECTION" behind `GTP_NFL_QB_FALLBACK_PUBLIC` (default OFF), and the word "validated" is never used.**

## 6. Exploratory history (NOT a validation)
Source: `scripts/research/nfl/evaluate-qb-fallback-categories.mjs` → `qb-fallback-categories-exploratory.json`.

Setup:
- REG 2018 to 2026 week 9, walk-forward.
- The starter is the game's leading passer; the history has no depth charts.
- Every category is classified with pre-game facts, except multi-QB games, which are classified in-game.

Tier (d) against the league-average starter (paired pinball diff, 95% cluster CI):

| Category | n | Paired diff (95% CI) | Coverage | Level |
|---|---|---|---|---|
| Rookie first start | 81 | −1.77 (−3.20 to −0.49) | 0.852 | 0.837 |
| Under 25 prior attempts | 112 | −1.53 (−2.68 to −0.41) | 0.839 | 0.841 |
| Injury-promoted backup | 297 | −0.62 (−1.39 to 0.11) | — | — |
| Traded | 691 | +0.27 (−0.22 to 0.76) | — | — |
| Emergency starter | 24 | −0.16 (−1.96 to 1.36) | — | — |
| Multi-QB game | 295 | −4.11 (−5.07 to −3.20) | — | 0.697 |

Notes:
- Rookie first starts and under-25 starters are still projected high (level ≈ 0.84).
- Emergency starters: n is too small to read a direction.
- Multi-QB games: the starter is often pulled, which is an in-game event.
- Opponent ablation: tier (d) without the opponent pass-defence ratio scored slightly better in rookie starts and under-25 starts. The founder's specification includes it, so it stays in the frozen method; the ablation is reported, not acted on.
- Tier (b) against the league-average starter: injury-promoted backups −0.66 (−1.17 to −0.21); traded −0.27 (−0.60 to 0.09).

## 7. Tier (c) data question (open)
- No verified college passing statistics are committed.
- nflverse provides combine measurables and draft data, but no college passing.
- The likely source is CollegeFootballData.com (CFBD). Its API is free but **requires an API key**; its current terms need checking.
- Sports-Reference's college football site forbids scraping.
- **Stopped for founder approval:** source, terms and key. College statistics would never be treated as NFL-equivalent; any translation would itself be historically tested.
