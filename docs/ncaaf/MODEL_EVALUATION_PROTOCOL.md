# NCAAF-002 — Model evaluation protocol (preregistration v1)

Registered 2026-10-09, **before any model was fitted or any prediction scored**. Corpus:
`data/internal/research/ncaaf/corpus/v1/` (`ncaaf-corpus@1`, per-season sha256 in its `manifest.json`).
PRIVATE_RESEARCH. This protocol governs *research* model selection only. It sets no publication or product bar;
those remain founder decisions (playbook §4).

**What has already been seen (disclosure):** aggregate provider counts for 2016–2025 (games, statuses,
overtime, neutral sites, division pairings) and a 20-game drive sample. **No prediction, rating or
outcome-vs-forecast metric has been computed for any season.** The holdout below is unexamined for model
performance.

Amendments are appended in §9 with a date and a reason, and never edited in place. An amendment made after a
holdout result has been seen must say so, and the affected window then counts as contaminated.

## 1. Forecast unit, cutoff and population

- **Unit:** one played-final game (corpus row). College football has no ties at final (overtime), so the
  winner is binary.
- **Cutoff:** a forecast for slate day D (America/New_York date) uses **only** rows with `slateDate < D`
  (`rowsKnownBefore`). This is a morning-of-slate forecast. All state (ratings, fitted parameters, residual
  spreads, calibration) is recomputed or updated from those rows only.
- **Primary population:** `pairing = FBS-FBS`. **Secondary cohort (reported, not gating):** `FBS-FCS`.
  FCS–FCS and NON_D1 games update ratings but are never scored.
- **Inputs allowed:** corpus fields only (teams, home/away, neutral site, season, season-scoped conference id,
  division, prior scores, dates). **Not allowed:** anything without as-of evidence, i.e. rosters, QB, injuries,
  weather, recruiting/talent/returning production, provider ratings, and any odds (including the timestamp-less
  ESPN `pickcenter` / CFBD lines, which may appear only as a separately labelled benchmark).

## 2. Targets

| Target | Definition | Forecast form |
|---|---|---|
| `winner` | 1 if home score > away score | P(home win) |
| `margin` | home score − away score (signed, home perspective) | predictive distribution (mean, 80% central interval) |
| `total` | home score + away score | predictive distribution (mean, 80% central interval) |
| `teamScores` | (home, away) points | joint predictive distribution (input to NCAAF-003) |

Point predictions are **means**. "Home" on a neutral site is the provider's listed home team; the home-field
term is then 0.

## 3. Windows

| Window | Seasons | Use |
|---|---|---|
| History / burn-in | 2016–2020 | Ratings and fits accumulate; **never scored**. 2020 (COVID: 592 finals, 211 postponed, 66 canceled) is burn-in only. |
| Development | 2021–2022 | Hyperparameter tuning (grids in §4). |
| Validation | 2023 | Model selection among tuned candidates (§6). Seen once per candidate config. |
| **Locked holdout** | **2024–2025** | Scored **once**, after the frozen configuration is committed (§7). |
| Forward | 2026 games after the first write-once pregame capture (NCAAF-005) | The only evidence that can support publication. 2026 games played before the capture are not forward evidence. |

Every scored game is forecast with the expanding history up to its slate day. Development or validation games
are never refit "after the fact" on their own outcomes.

## 4. Candidates and tuning grids (fixed now)

- **B0 — no-information:** P(home win) = 0.5. Margin ~ Normal(0, σ_m). Total ~ Normal(μ_T, σ_T), where μ_T, σ_T,
  σ_m are the expanding means/SDs of all scored-population games known before D.
- **B1 — home-field only:** P(home win) = expanding home win rate of non-neutral FBS–FBS games (0.5 when
  neutral). Margin mean = expanding mean home margin (0 when neutral). Total as B0.
- **C1 — Elo with margin of victory:** P = 1/(1+10^(−Δ/400)), Δ = R_home − R_away + HFA·(1 − neutral). The
  update after each game is K·MOV·(result − P), with MOV = ln(|margin|+1)·2.2/(0.001·Δ_winner + 2.2). Season
  carry-over: R ← μ_div + c·(R − μ_div) at each new season. New teams start at the division prior (FBS 1500;
  FCS 1500 − δ_FCS; NON_D1 1500 − δ_FCS − 200). Margin ~ Normal(β·Δ, σ_m), with β and σ_m by expanding least
  squares. Total as B0.
  Grid: K ∈ {20, 30, 40, 50}; HFA ∈ {40, 55, 70, 85}; c ∈ {0.5, 0.6, 0.7, 0.8}; δ_FCS ∈ {200, 300, 400}.
- **C2 — ridge offense/defense score model:** for each game, home points = μ + h·(1−neutral) + o_home − d_away + ε,
  and away points = μ + o_away − d_home + ε'. Fitted by ridge (penalty λ on o, d) on games known before D,
  weighted w = 0.5^(age_days/H). (home, away) residuals ~ bivariate Normal(σ, ρ) from the same weighted fit.
  P(home win) = P(margin > 0) under that bivariate normal.
  Grid: λ ∈ {2, 5, 10, 20}; H (half-life, days) ∈ {120, 240, 365, 730}.
- **C3 — C2 + conference effects (partial pooling):** adds season-scoped conference offense/defense effects
  with their own ridge penalty λ_c (team effects shrink toward their conference, conferences toward 0).
  Grid: C2's best (λ, H) × λ_c ∈ {1, 3, 10, 30}.

Tuning objective on development: **log loss** for C1's winner parameters, and **margin CRPS + total CRPS** for
C2/C3. Ties are broken by the simpler or smaller-parameter value.

## 5. Metrics

- Winner: **log loss (primary)**, Brier, ECE (10 equal-width bins), calibration slope/intercept (logistic
  recalibration of logit p on outcomes).
- Margin and total: CRPS (Gaussian closed form), MAE of the mean, mean signed error (bias), 80% central
  interval coverage.
- Uncertainty: 95% bootstrap intervals by resampling **weeks** (season × week clusters), 2,000 replicates,
  seed `20261009`. Paired differences between models use the same resamples.
- Every report gives exact game counts and per-season numbers, plus cohorts: weeks 1–4 vs 5+, conference vs
  non-conference, neutral, postseason, and the FBS–FCS secondary cohort.
- Simulation draws are never counted as observations.

## 6. Selection rule (validation 2023)

- **Winner champion:** lowest validation log loss. A more complex candidate replaces a simpler one only if
  the paired week-bootstrap 95% interval of (complex − simple) log loss lies entirely below 0. Otherwise
  the simpler model is kept.
- **Score champion:** the same rule on margin CRPS + total CRPS among C2/C3 (and C1+B0-total).
- The two champions may differ. NCAAF-003 then needs a joint model consistent with the winner champion, or
  it states the inconsistency and uses the score champion's own P(home win).

## 7. Freeze and holdout

1. Commit the frozen configuration (`data/internal/research/ncaaf/experiments/002-freeze.json`: candidate
   ids, hyperparameters, corpus manifest sha256, code commit SHA) **before** scoring 2024–2025.
2. The evaluator refuses to score the holdout unless that freeze file exists and its corpus hash matches. It
   writes the holdout receipt once (write-once; a second run with the same freeze must reproduce it
   byte-for-byte, and any different result is refused).
3. No hyperparameter, candidate or metric change after the holdout is scored, except through a §9 amendment
   that marks 2024–2025 as contaminated.

## 8. Research bars for Gate 002 (on the locked holdout)

The winner champion **passes** when all of these hold:
- (a) log loss beats B1 with the paired week-bootstrap 95% interval entirely below 0;
- (b) ECE ≤ 0.03 and calibration slope within [0.85, 1.15];
- (c) for the score champion, margin and total 80% interval coverage within [0.75, 0.85].

Otherwise the failure is recorded with its numbers. Per the playbook, the best supported baseline still
proceeds to NCAAF-003 as **research champion**, labelled as having failed the named bar. Passing these bars
is not model qualification: qualification needs forward evidence (NCAAF-005/006) and a founder decision.

## 9. Amendments

_None._
