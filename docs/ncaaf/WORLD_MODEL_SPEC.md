# NCAAF-003 — World model specification and diagnostics registration (v1)

Registered 2026-10-09 **before any world was simulated for a real game.** PRIVATE_RESEARCH. Code:
`app/src/lib/sports/ncaaf/{game-worlds,overtime}.mjs` (`ncaaf-worlds@1`).

## 1. What a world is

One world is one complete college-football game between the two listed teams:

1. **Inputs (as of slate day D):** the frozen score champion **C2** (λ 2, half-life 240 d; NCAAF-002 freeze
   `a51670819b`) gives each team's expected regulation-plus-OT-inclusive points μ_h, μ_a and the score
   correlation ρ. The **score bank** holds the (μ, regulation points) pairs of every earlier FBS–FBS team-game
   (OT games enter with their regulation score from `overtime-periods.json`; quarantined OT games are
   excluded). The **OT distribution** is the empirical per-team-period points by period type, as of D,
   2021 regime (`overtime.mjs`).
2. **Joint draw:** (z_h, z_a) ~ standard bivariate normal with correlation ρ (Gaussian copula).
3. **Marginals:** each team's regulation score = the Φ(z) quantile of the regulation scores of the K = 400 bank
   entries whose μ is nearest that team's μ. Scores therefore take only values real teams have scored, at
   empirical frequencies (key numbers come from data, not rounding).
4. **Overtime:** if regulation is tied, play periods 1, 2, 3+ with both teams drawing points from that period
   type's distribution until a period ends unequal. Values are restricted to the 2021 rules: OT1 {0,3,6,7,8},
   OT2 {0,3,6,8}, OT3+ {0,2}.
5. **Derived quantities**, all from that world: final scores, margin = home − away, total, winner (no ties),
   OT periods.

N = 10,000 worlds per event, seed = low 32 bits of `fnv1a64("ncaaf-worlds@1|20261009|<eventId>")`. The receipt
stores exact counts (home wins, OT worlds), the margin, total and OT-period histograms, percentiles, means and
inputs. Every probability is a count over N.

**Known simplifications (named, not hidden):**
- μ comes from a model fitted on *final* scores (OT included), while the bank maps μ to *regulation* scores.
  The bias is small: OT games are about 4% of games and OT adds ~7–10 points split across both teams. It is
  measured by the diagnostics (mean total vs actual).
- OT possessions are drawn independently for both teams and ignore strength and the second team's knowledge
  of the first team's result.
- The bank conditions on μ only, not on σ (C2's σ is pooled anyway).
- Worlds are produced for FBS–FBS games only; anything else is refused (`NOT_IN_POPULATION`). Seasons before
  2021 are refused (OT rules not encoded).

## 2. Consistency with the winner champion

NCAAF-002 selected **C1 (Elo)** for P(home win) and **C2** for scores. The worlds' P(home) = home-win worlds / N
is a C2-based quantity and **will differ from C1's**. Per protocol §6 this is reported, never patched:
diagnostics give the distribution of |P_world − P_C1| and both models' log loss. A downstream surface may show
only one P(home) per game, with its source named. Choosing which is an NCAAF-004/007 decision.

## 3. Diagnostics (registered now)

**Windows:** *development diagnostics* 2022–2023 (FBS–FBS). *Holdout diagnostics* 2024–2025 run **once**, after
`experiments/003-freeze.json` (engine version, K, N, seed, C2 spec, file hashes) is committed. 2021 is skipped
because the OT2/OT3+ distributions under the 2021 regime reach their 20-observation minimum only late in 2021.

**Per game:** world P(home), world margin and total histograms, OT worlds, actual result.

**Metrics:**
- Winner: log loss, Brier, ECE of the world P(home), with C2-analytic and C1 P(home) alongside on the same games.
- Margin and total: exact discrete CRPS from the world histogram; 80% coverage of [p10, p90]
  (inclusive); mean bias.
- **Structure vs actual** (predicted = mean over games of world frequency; actual = observed frequency; both
  with game counts): OT rate; |margin| = 3, 7, 10, 14 and ≤ 7 ("one score"); totals in each 7-point band; home
  score among the 10 most common values; |margin| ≥ 28.
- Refusal counts by reason.

**Gate 003 → 004 (structural):**
- (S1) 0 incoherent worlds; the engine throws on any violation.
- (S2) Byte-identical receipts on re-run, with a hash of all receipts.
- (S3) Every refusal counted with a reason.
- (S4) Diagnostics reported honestly against actuals, including failures.

There is **no accuracy bar** at this gate. Accuracy bars belong to model qualification (forward evidence +
founder decision).

## 4. Amendments

_None._
