# NFL QB-aware game-outcome challenger — validation specification v3 (methodological addendum folded in)

Status: proposed for freeze, 2026-11-11, forecast-guard (engine). The founder held approval of v2 (sha256
36f1f2fba9f0c3943809d3af462aca0268ccc7c3aa0f4e25dad18e63a2b42ce6) pending seven methodological answers. Several of v2's
numbers do not survive those answers, so this is **v3**. v1 (8cf6b543…) and v2 stay unchanged in the repo. Everything
in v2 not restated here carries over unchanged: the candidate definition (§1), inputs and data classification (§2), the
development fit (§3), the freeze record (§5), and the invariants. **No confirmatory evaluation, and no public or flag
change, before this file's sha256 is approved.**

Every number below comes from the committed history, computed walk-forward over REG and postseason games 2018–2025
(`scripts/research/nfl/backtest-qb-starter-tier-b.mjs` tables, the starter-projection library). The computation is
reproduced by the analysis script in the approval commit.

## 1. Expected stratum size, and the minimum
**Definition used for the count.** A game is in the stratum when either team's starter is non-established (§2), counted
over Weeks 11–18 plus the postseason in each past season:

| Season | Games | Games with ≥ 1 non-established starter |
|---|---|---|
| 2018 | 119 | 26 |
| 2019 | 119 | 15 |
| 2020 | 122 | 28 |
| 2021 | 135 | 32 |
| 2022 | 134 | 33 |
| 2023 | 135 | 38 |
| 2024 | 133 | 39 |
| 2025 | 136 | 32 |

**Remaining 2026 (Weeks 11–18 plus postseason):** about 135 games, and **about 35 stratum games** (17-game-era range
32–39; full range 15–39). A **full 2027 season**: about 285 games, and about 68 stratum games (24% of games).

**Minimum (replaces v2's 40):** a decision needs **≥ 60 stratum games and ≥ 250 games in all**, pooled across the
forward sample. Why 60: with the stratum's paired-difference sd (≈ 2.1 points, §4), n = 60 gives a standard error of
0.27. The stratum bar (point estimate ≤ −0.50 **and** upper CI < 0) then has about 70% power at a true −1.0, and below
60 the bar is mostly noise. **2026 alone cannot reach it**, so the 2026 season-end look (§5) can never declare
eligibility. It can only stop for harm or continue.

## 2. Prospective definition of "non-established starter" (no hindsight)
A team's starter is **non-established** for a game when, **in the simulation receipt of record** (the last receipt
written before kickoff), that team's recorded starting-QB decision (`inputSnapshotIds.starters.<team>`, copied from the
player board's `integrity.qbStarter`) is any of:
- a tier other than `A_CLUB_HISTORY`: tier (b), (d′), promoted backup or emergency;
- not confirmed (an alternative-starter scenario case).

Inputs, each stamped strictly before kickoff and checked by the scorer:
- the depth-chart capture (`acquiredAt` before kickoff, at most 3 days old at the board build);
- the injury and roster captures (eligibility@1, at most 6 h old at the board build);
- the week's share-level forecast file (`generatedAt` before the week's first kickoff), which supplies the club share
  against the 0.75 floor.

**Cutoff: the receipt of record.** Classification is read from that receipt and never recomputed after kickoff. A game
whose receipt of record is missing is excluded and counted against operational reliability.

## 3. Confidence interval for the paired margin-error difference
**Unit of analysis.** Per game, d = |candidate margin error| − |official margin error|. These differences are
non-normal: bounded by the candidate's shift, skewed and heavy-tailed.

**Primary: a game-level BCa bootstrap, stratified by season-week.** Games are resampled with replacement within each
week, keeping each week's size. That gives 10,000 resamples, seed 20260915, with BCa intervals (bias and acceleration
from the jackknife).

Why this method:
- **BCa** corrects the skew and bias of absolute-error differences, which percentile intervals miss.
- **Game-level units:** pairing removes the shared outcome shock, because both models are scored on the same game.
  What remains is each model's own error, weakly correlated across games.
- **Not a week-cluster bootstrap:** 2026 contributes only about 12 week clusters (8 regular-season weeks and 4 playoff
  rounds). Cluster intervals with that few clusters are anti-conservative; the repo's few-cluster lesson applies.
- **Week strata** keep any week-level structure in the resamples.

**Sensitivity.** A season-week cluster percentile bootstrap is also computed. **The decision uses the more conservative
of the two intervals**, the one whose relevant bound is further from passing.

## 4. Achievable non-inferiority margin (replaces v2's +0.10)
**Paired-difference sd.** The candidate's per-game margin shift has an RMS of about 1.95 points even at full
pass-through (κ = 1; the starter's projected passing value converted at the league's 0.0625 points per yard, both
teams). It is about 1.9 points among established-starter games and 2.1 in the stratum, so the QB term moves almost
every game: the official model is QB-blind. When the error is much larger than the shift, d ≈ ±shift, so sd(d) ≈ 1.95
is an **upper bound** (κ < 1 shrinks it).

**Power at a true difference of 0**, one-sided α = 0.025, margin M:

| n | SE | Power at M = 0.10 | M for 80% power |
|---|---|---|---|
| 135 (2026) | 0.168 | **≈ 9%** — not achievable | 2.80 × SE = 0.47 |
| ≈ 420 (2026 + 2027) | 0.095 | — | 0.27 |

**Adopted margins:**
- **2026 season-end look: M = 0.50 points.** Used only as a harm screen. Failing it means REJECTED; passing it means
  continue. It never makes the candidate eligible.
- **Final, pooled 2026 + 2027: M = 0.30 points.** 0.30 is about 2.9% of the incumbent's 10.2–10.8 margin MAE. It is
  inside the size of the oracle's best gain (0.15–0.32), and within the spread between official model rungs in the
  committed team-ladder evaluation (10.62–10.79 MAE). A loss of this size would be as large as the benefit the best
  possible availability information delivered, so a larger margin could hide real harm.
- **Stratum co-primary (unchanged from v2):** point estimate ≤ −0.50 and upper CI < 0, with n ≥ 60.

## 5. Looks, alpha spending, and who may look
Exactly **two** scheduled analyses; no other computation of any outcome metric:
1. **L1** at the end of the 2026 postseason, after the Super Bowl final is committed. Information fraction t ≈ 135/420 ≈
   0.32.
2. **L2 (final)** at the end of the 2027 postseason.

**Spending.** Lan–DeMets with an O'Brien–Fleming boundary, one-sided total α = 0.025 per co-primary hypothesis:
- L1 efficacy α = 1 − Φ(1.96/√0.32) ≈ **0.0003**. In practice there is no efficacy stop at L1, and it cannot declare
  eligibility anyway (§1).
- L2 final α ≈ **0.0249**.

The two co-primary tests form an intersection–union test: each at its own α, no split needed. Secondaries are Holm-
adjusted at α = 0.05 at L2 only, and descriptive at L1.

**Harm and futility at L1** (non-binding for efficacy; binding for harm). **REJECTED** if either:
- the lower bound of the 95% CI of the overall paired margin difference is > +0.50; or
- the stratum point estimate is > +0.50 (n ≥ 20).

**Who looks.**
- The scheduled grading job computes metrics **only** on the L1 and L2 dates. The scorer refuses on any other date (a
  code gate, like the QB-props approval gate), and writes a sealed report.
- The weekly forward ledger records only receipt ids, predictions and outcomes, never a metric.
- The engine session and PD read the report when it is written. **No unplanned look.** Any ad hoc computation of a
  forward outcome metric voids that look and requires a re-registration.

## 6. Win-probability decision rules (apply even when margin and total pass)
Paired per-game log loss and Brier differences (candidate − official), with the same BCa method. Calibration is ECE over
10 equal-mass bins. Win non-inferiority margins, sized like §4 from an assumed per-game paired log-loss sd of about 0.05:
- **log loss: +0.012 at L1, +0.007 at L2** (≈ 1.1% of an incumbent log loss near 0.63);
- **Brier: +0.004 at L1, +0.002 at L2**.

| Condition | Outcome |
|---|---|
| Overall log loss **lower** CI > 0 (significantly worse) | **REJECTED, whole candidate.** One coherent simulation produces both win% and margin, so a significantly worse win head means the QB term mis-shapes the outcome distribution. |
| Stratum log-loss point estimate > +0.02 at L2 (n ≥ 60) | **REJECTED, whole candidate**, for the same reason. |
| ECE > official ECE + 0.03 | **REJECTED, whole candidate.** |
| Log loss or Brier upper CI ≥ its margin, or ECE > official + 0.01, with none of the above | **NEEDS MORE EVIDENCE for win%.** The candidate's win% is never displayed. Margin and total eligibility may still proceed if their own bars pass. |
| All of: log loss and Brier non-inferior, ECE ≤ official + 0.01, stratum log-loss point ≤ 0 | Win% eligible for **labelled display beside the official win% only**. Replacing the official win% is out of scope for this specification (v2 §4: two consecutive seasons). |

## 7. Season-end reporting when n is insufficient
At **L1 (end of 2026)** n is insufficient by design (§1). What happens:
- **Published internally:** the sealed L1 report goes to the founder. It contains n overall and in the stratum, the harm
  screen result, and descriptive metrics with CIs, each labelled "interim, not a decision". Its sha256 is recorded in the
  ledger.
- **Published publicly:** **no numbers.** Only a methodology note that a QB-aware challenger is under forward evaluation,
  with its status (CONTINUING or REJECTED). The challenger's outputs stay private (D2).

**Carried into 2027:**
- every 2026 forward game, with its receipt of record and outcome, unchanged;
- κ, the code sha and the input schemas, frozen;
- no refit.

The 2027 games append to the same ledger, and L2 analyses the pooled sample under this spec.

**If the method must change in the offseason** (a code, data-schema or κ change), the changed method is a **new
candidate version** with its own forward sample from its approval date. 2026 data is never pooled with a changed
method. **If L2 still lacks the minimum** (fewer than 60 stratum games or fewer than 250 games), the result is NEEDS MORE
EVIDENCE, and continuation into 2028 needs a fresh founder approval. There is no automatic extension.

## Summary of changes from v2
| Item | v2 | v3 |
|---|---|---|
| Stratum minimum n | 40 | **60 pooled**; all games ≥ 250 |
| Overall non-inferiority margin | +0.10 | **+0.50 at L1 (harm screen), +0.30 at L2 (decision)** |
| CI | season-week cluster bootstrap, percentile | **game-level BCa stratified by week, with a week-cluster sensitivity; the more conservative governs** |
| Interim | at n = 120 | **L1 at the end of 2026 and L2 at the end of 2027; Lan–DeMets O'Brien–Fleming** |
| Win rules | non-inferiority bars | **explicit rejection and needs-more-evidence rules**; the win margins at L1 and L2 |
| Season-end | — | **sealed internal report, no public numbers, carry-forward and no-refit rules** |
