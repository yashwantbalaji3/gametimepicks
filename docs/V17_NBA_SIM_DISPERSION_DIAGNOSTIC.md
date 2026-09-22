# v1.7 — NBA sim dispersion diagnostic (v0 → evidence for v1)

**As of:** 2026-09-22 overnight · **Model under test:** `nba-preseason-experimental-v0`
(`app/src/lib/sports/nba/game-sim.mjs`), minutes `nba-minutes-model-v0`, Elo `NBA_ELO_PARAMS` K=20 / HA=+70 /
25% regression · **Harness:** `app/scripts/nba/diagnose-sim-dispersion.mjs` (read-only; the sim is called
unchanged) · **Report:** `data/internal/research/nba/reports/sim-dispersion-diagnostic-2025.json` ·
**Status:** diagnostics + a preregistered plan. **No model constant was changed.** NBA remains
`HISTORICAL_ONLY`; nothing here is product-eligible.

## 0. The claim being tested, and a correction to it

The readiness receipt (N3) recorded "sim margin sd ≈ 24 (real ≈ 13)". Measured tonight from
`corpus-v1.json` (4,179 finals), **the realized margin SD is not 13**: 13 is the mean *absolute* margin
(12.87). The realized regular-season margin **SD is 15.98** (16.32 excluding overtime). The v0 gap is
therefore ≈ 22 vs ≈ 16.5 (1.33×), not 24 vs 13 (1.85×). Still uncalibrated by construction — but the size of
the fix is smaller than the receipt implied, and the receipt is corrected in its overnight section.

## 1. Realized dispersion (corpus, never hard-coded)

Population SD; `corr(H,A)` from `(Var(total) − Var(margin)) / 4`. Regular = phase 2 only (Cup final,
play-in, playoffs excluded); preseason = phase 1.

| Population | n | margin mean | margin SD | mean \|margin\| | total mean | total SD | home SD | away SD | corr(H,A) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| regular · all seasons | 3,690 | 1.84 | **15.98** | 12.87 | 229.10 | **20.03** | 12.81 | 12.81 | 0.222 |
| regular · non-OT | 3,517 | 1.89 | **16.32** | 13.27 | 228.04 | 19.37 | 12.67 | 12.66 | 0.170 |
| regular · OT only | 173 | 0.80 | 5.28 | 4.64 | 250.57 | 21.11 | 11.22 | 10.53 | 0.884 |
| regular · 2023-24 (corpus 2024) non-OT | 1,171 | 2.17 | 15.98 | 12.97 | 227.39 | 19.63 | 12.71 | 12.60 | 0.203 |
| regular · 2024-25 (corpus 2025) non-OT | 1,170 | 1.72 | 16.24 | 13.17 | 226.63 | 19.19 | 12.44 | 12.69 | 0.166 |
| regular · 2025-26 (corpus 2026) non-OT | 1,176 | 1.78 | 16.74 | 13.68 | 230.09 | 19.12 | 12.81 | 12.61 | 0.132 |
| preseason · all seasons | 217 | 4.79 | 16.78 | 12.69 | 224.27 | 19.48 | 12.30 | 13.38 | 0.149 |
| preseason · non-OT | 204 | 5.09 | 17.21 | 13.19 | 222.78 | 18.47 | 12.19 | 13.04 | 0.071 |
| postseason + play-in + cup | 272 | 4.00 | 16.80 | 13.70 | 215.32 | 17.83 | 12.18 | 12.32 | 0.060 |

Overtime share: regular 4.69 %, preseason 5.99 %. OT games carry +22 total points and a margin SD of 5.3 —
they are a different distribution, and v0 does not model them (`tieRule: regulation ties split 0.5/0.5`).

Two corpus facts the sim ignores, measured on 2024-25 regular season, non-OT, 30 teams × 78 games:

| Fact | Value | Meaning |
|---|---:|---|
| team points SD (per team, over its games) | 11.71 | the target per-side dispersion |
| √(Σ player points variances), appearance-weighted, absent ≠ zero | 19.02 | what an INDEPENDENT sum of the same players produces |
| ratio Var(team) / Σ Var(player) | **0.383** (median 0.387) | teammates' points are strongly **negatively** correlated (shared possessions); independence overstates team SD by 1/√0.383 = **1.62×** |
| team total minutes SD per game (non-OT) | **0.96 min** | a team plays 240 minutes; any per-run minutes draw without that constraint is an artifact |
| regulars (≥40 games, ≥24 min): per-game pts SD / minutes SD / per-minute-rate CV | 6.63 / 5.32 / 0.408 | the v0 per-player inputs are of the right order — the defect is not per-player scale |

## 2. Harness design (as-of, historical, regular season)

60 games of the 2024-25 regular season (every 16th of the 1,005 eligible games after day 30, so every
trailing-10 window exists), inputs strictly as-of tip-off: Elo folded through `dateUtc` (strict `<`),
minutes and rates from box scores strictly before it, `population: "regular"`, no injuries feed (none
existed; "unknown" is simulated as playable — exactly what the artifact records). 4,000 runs per game,
seeded per game. Four configurations of the SAME `simulateGame`:

| config | minutes draw | per-minute rate draw |
|---|---|---|
| `full` | N(μ, sd_m), clipped [0, 48] | N(r, sd_r), floored 0 |
| `minutesFixed` | pinned at μ | on |
| `ratesFixed` | on | pinned at r |
| `bothFixed` | pinned | pinned (rounding only) |

Pool-fallback rates are made explicit before pinning so `ratesFixed` really pins every player.
Sample realized: margin SD 16.63, total SD 17.90 (2 OT games in the 60).

## 3. Decomposition table

Means over the 60 games. `errSD` = SD of (sim mean − actual): the dispersion a calibrated sim should
report (it includes the model's own mean error). `cover80` = share of actuals inside the sim's p10–p90.

| config | sim margin SD | sim total SD | errSD margin | errSD total | margin bias | total bias | cover80 margin | cover80 total | sim Brier | tie mass |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `full` (v0) | **22.09** | **22.05** | 17.16 | 18.80 | +1.81 | −2.24 | **0.917** | 0.850 | 0.235 | 0.017 |
| `minutesFixed` | 18.66 | 18.58 | 17.27 | 18.73 | +1.75 | −3.00 | 0.900 | 0.800 | 0.236 | 0.020 |
| `ratesFixed` | 10.03 | 10.03 | 17.30 | 18.48 | +1.96 | −5.35 | 0.550 | 0.433 | 0.260 | 0.032 |
| `bothFixed` | 0 | 0 | 17.34 | 18.35 | +1.95 | −6.05 | 0.017 | 0.017 | 0.379 | 0.050 |
| realized (sample) | 16.63 | 17.90 | — | — | — | — | 0.80 by definition | 0.80 | Elo 0.233 | 0 |

Analytic partition of the independent-sum variance from the prepared v0 rosters (both teams, points):

| term | formula per player | SD contribution |
|---|---|---:|
| rate noise | μ²·sd_r² | **19.50** |
| minutes noise | r²·sd_m² | 10.32 |
| cross | sd_m²·sd_r² | 6.79 |
| independent total | √(sum) | 23.08 (≈ the `full` 22.09 after clipping/rounding) |

Prepared-roster facts: pool 18.6 players per side; **rescale factor mean 0.70, min 0.50 (the bound),
max 0.91**; scaled pool 241 min; default-sd substitutions 0; pool-rate substitutions 0.

## 4. Diagnosis — investigated, not assumed

1. **Minutes uncertainty (10.3 pts SD, ≈ 3.4 pts of the 22 → 18.7 drop): almost entirely an artifact.**
   Each run draws every player's minutes independently, so a team's minutes per run vary with SD ≈
   √(Σ sd_m²) ≈ 17–20 minutes, while a real team's total minutes vary by **0.96 min**. The 240-minute
   rescale is applied to the *expectation* (`prepareRoster`), never to the *draw*. Minutes uncertainty
   should redistribute minutes among players, not change how many minutes the team plays.
2. **Production conditional on minutes (19.5 pts SD): the dominant term, and its cause is independence,
   not scale.** Per-player dispersion is about right (regulars' realized per-game pts SD 6.6; a 30-minute
   player at rate CV 0.41 simulates at ≈ 6–7). The sim then sums 18.6 independent players per side. The
   corpus says a team's variance is **0.383×** the sum of its players' variances: shared possessions make
   teammates' points negatively covary. Independence therefore overstates per-side SD by 1.62×. The
   sim's per-side SD is 22.05/√2 = 15.6 vs realized 11.7–12.4 — a 1.3× excess, i.e. the 1.62× independence
   inflation partly offset by the smaller per-player spread of the rate-only draw.
   The "double-counting of game-level variance" hypothesis is **not supported**: a common game factor
   inside per-player variances would make Var(team) *exceed* Σ Var(player); the measured ratio is well
   below 1, so the missing structure is negative within-team covariance, not a duplicated common factor.
3. **Team / game environment (pace, possessions): absent, and visible as `sim total SD ≈ sim margin SD`
   (22.05 vs 22.09).** Real home and away scores correlate at ρ = 0.17 (non-OT), so real total SD (19.4)
   exceeds real margin SD (16.3) by √(1+ρ)/√(1−ρ) = 1.19×. v0 has no shared possession count, so it
   cannot produce that asymmetry; a margin-calibrated v0 would still be total-miscalibrated.
4. **Residual / structural:** rounding is negligible (`bothFixed` SD 0); tie mass 1.7 % of runs is
   impossible in the real game (OT resolves it) and is split 0.5/0.5; OT (4.7 %) is unmodelled (+22 total,
   compressed margins); garbage time is unmodelled; and the **rescale of 0.70 (min 0.50)** shows the v0
   pool is every player who appeared this season (18.6 per side), so every starter's expectation is cut by
   ≈ 30 % (a 36-minute starter simulates at 25) and production spreads across too many players. That is a
   *level* defect in the player rows more than a dispersion one, but it also spreads the rate noise across
   more independent draws.
5. **Minutes-rescale tails:** the 0.5 bound was hit on some games (raw pool > 480 minutes); at the bound
   the team no longer sums to 240 (`scaledPoolMinutes` > 240), which inflates the total mean before the
   rate draw — visible as the small total bias moving from −6.05 (`bothFixed`) to −2.24 (`full`).

**Reconstruction check.** Real per-team SD 11.7–12.4 with ρ = 0.17 gives margin ≈ 15.1–16.0 and total ≈
17.9–19.0 — the sample's 16.6 / 17.9. The sim's per-side 15.6 is what the independent rate sum (13.8) plus
the minutes artifact (7.3) plus the cross term (4.8) produce; removing the minutes artifact and imposing
the within-team covariance ratio brings the per-side value to ≈ 13.8 × √0.383 ≈ 8.5, which is now *too
low* — meaning the per-player rate spread, once teammates covary, must carry a shared game-level
component (pace/opponent) to land at 12. That is the design constraint for v1: **a shared per-game
possession/pace draw plus within-team allocation, not a scalar shrink of independent noise.**

## 5. Preregistered v1 calibration plan (no constant changes tonight)

Split, frozen now: **development = 2023-24 + 2024-25 regular season** (corpus 2024, 2025) ·
**assessment = 2025-26 regular season** (corpus 2026), touched once per candidate, after the development
work is complete and its bars are written down. Preseason is a separate population with its own split
(dev 2024 + 2025 preseason, n = 146; assessment 2026 preseason, n = 71) and is never used as
regular-season evidence. Each candidate is a versioned change (`nba-preseason-experimental-v1.x`) with
its own artifact diff; nothing is blended into v0.

| id | candidate | what it fixes (§4) | dev target |
|---|---|---|---|
| C1 | per-run team-minutes constraint: draw, then renormalise the run's minutes to 240 (OT excepted) | §4.1 minutes artifact | per-run team minutes SD ≤ 2 |
| C2 | rotation pool: top-N by expected minutes (N chosen on dev) before rescale; roster-gated once N-4 is applied | §4.4 rescale 0.70 / 0.50 bound | rescale factor in [0.9, 1.1] on ≥ 95 % of games |
| C3 | shared game factor: one possession/pace draw per game (SD fitted on dev to realized total SD) multiplying both teams' rates | §4.3 corr(H,A) | sim corr(H,A) within ±0.05 of realized |
| C4 | within-team allocation: team points allocated to players (Dirichlet/multinomial on usage) instead of independent rate draws | §4.2 covariance | Var(team)/Σ Var(player) within ±0.05 of 0.383 |
| C5 | overtime: regulation tie → OT period(s) instead of a 0.5/0.5 split | §4.4 tie mass, OT | tie mass 0; OT share within ±1.5 pp of realized |

Assessment bars (2025-26 regular season, ≥ 300 games, all decided here):

- margin **and** total p10–p90 coverage in **[0.76, 0.84]** each (80 % nominal); p25–p75 in [0.45, 0.55];
- sim margin SD within **±10 %** of the forecast-error SD on the same games; total likewise;
- sim total SD > sim margin SD with the ratio within ±0.08 of the realized ratio (1.19);
- sim winner log loss not worse than the preseason-frozen Elo by more than **0.005**, and ECE (10 bins)
  **≤ 0.05** — the house winner bar (`docs/PROGRAM_172_EXECUTION_LOG.md`);
- per-player: minutes MAE and conditional-production MAE (graded separately, as the ledger already does)
  each not worse than v0 on the same rows.
- A candidate that passes coverage by widening one term while another is still an artifact (e.g. C3 alone
  hiding §4.1) is rejected: C1 and C2 are prerequisites for judging C3–C5.

Looks log: look 1 = this diagnostic (2024-25 only, 60 games, v0 unchanged). The assessment season has
not been read by any candidate.
