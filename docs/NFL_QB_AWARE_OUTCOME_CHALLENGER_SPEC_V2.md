# NFL QB-aware game-outcome challenger — validation specification v2 (for founder approval)

Status: proposed for freeze, 2026-11-11, forecast-guard (engine). This revises draft v1 (sha256
8cf6b543fe57401f02247990fc1485858e43fbf865568cd622e160161a96f82d) per the founder's points A–D (~18:50Z). Option B is
approved for development and evaluation only, **not promotion**. **No confirmatory evaluation runs before this file's
sha256 is approved.**

## 1. Candidate
**`qb-projected-passing-drive-tilt-v1`.** In Simulation V2 each offense's drive-result tilt is θ = θ₀ + κ·Δ:

| Term | Definition |
|---|---|
| θ₀ | Today's tilt, anchored to the official forecast's implied team points |
| Δ | The identified starter's projected mean passing yards, minus `leagueStarterProjection`'s for the same club and season, divided by league yards per drive |
| The starter's projection | The board's tier (a) row, or the frozen fallback (challenger spec v1, sha256 0f7e8c6b9cdec328a06d1a64b8d99016726e98bf86718a13b4786f2eb01944a5) |
| κ | One coefficient, fitted on development data only (§3) |

QB, receivers, rushers, TDs and the score come from the same runs. The per-run conservation contract applies, with 0
failures required.

### Why this design, independently of the rejected `qb-absent-elo-shift-v1`
That candidate shifted a rating on a binary "primary QB absent" flag. It stays rejected and is not retuned or renamed.
This candidate differs in four ways:
1. **A continuous signal for every game.** The magnitude of the starter's projected passing relative to a
   league-average starter, not a binary flag.
2. **It enters through drive outcomes**, so passing, scoring and player lines move together.
3. **It is defined for every starter category** (established, promoted, traded, rookie/low-history, emergency, and
   scenario alternatives), not only absences.
4. **It reuses no rejected parameter.** κ is a new single coefficient. The ceiling study is used only as an external
   **upper bound on plausible effect size** (§4).

## 2. Inputs and data classification
**Inputs: pregame and timestamped only.** Each is stamped strictly before kickoff:
- starter identity: depth-chart capture plus injury and roster captures;
- the starter's projection: the receipt of record;
- the official anchors: `nflOfficialOfRecord`.

The scorer refuses any game with an input stamped at or after kickoff.

**Classification (point A):**

| Data | Use | Why |
|---|---|---|
| REG 2018–2024, leading passer as starter (hindsight identity) | **Development only**: fit κ | Hindsight identity is never evidence of operational performance |
| REG 2025 | **Reclassified as development** | 2025 games informed method selection: the fallback challenger's re-examined history spans 2018–2025. Its depth-chart captures are timestamped (the 2026-09-25 refusal lists 2025 as stamped), but because it informed tuning it is not confirmatory |
| REG 2026 weeks 1–10 | **Development** | Seen in exploratory work (hold-out reports, the Week 10 demo) |
| **Every REG and postseason game from 2026 Week 11 onward, after approval** | **Confirmatory, forward only** | Unused: no game after 2026-11-11 has been scored by any QB method or by this candidate |

## 3. Development fit (not evidence)
κ is fitted by walk-forward minimisation of margin MAE on 2018–2025, with each season's κ fitted on earlier seasons. It
is frozen as the 2018–2025 fit at approval. Development results are reported separately and never pooled with
confirmatory results.

## 4. Thresholds — proposed by the engine session, with justification
**Effect-size anchor.** The committed `team-availability-ceiling-evaluation.json` gives an upper bound. Even a perfect
QB-availability oracle improved incumbent margin MAE (10.2–10.8 per season, n ≈ 285 per season) by only about 0.15–0.32
points, and win log loss by about 0.01 in aggregate, with one season going the wrong way. A pregame QB term should do no
better overall. Its effect concentrates in games with a non-established starter: about 5 games a week, roughly 35% of
games.

**Realistic forward n.** 2026 Weeks 11–18 plus the postseason is about 141 games, about 45 of them with a non-established
starter. All of 2027 is about 285 games, about 100 of them stratum games.

**Power.** Assumed sd of the per-game paired margin-MAE difference: about 2.0 points across all games, about 4.0 in the
stratum. The minimum detectable effect at 80% power, two-sided α = 0.05, is about 2.8·sd/√n:

| Data | All games | Stratum |
|---|---|---|
| 2026 only | 0.47 points | 1.7 points |
| 2026 + 2027 | 0.28 points | 0.95 points |

A superiority claim on all games is therefore **not powered this season** and is not made the primary test.

### Primary test: co-primary, intersection-union (both must hold; no α split needed)
| | Requirement |
|---|---|
| **P1 — no harm overall** | All games: the upper bound of the 95% CI of (candidate − official) margin MAE is **< +0.10 points**. That is 1% of MAE, and a third of the oracle's best gain. |
| **P2 — benefit where it should exist** | Stratum games: the upper bound of the 95% CI of (candidate − official) margin MAE is **< 0**, and the point estimate is **≤ −0.50 points**. That is about 5% of stratum MAE, within the oracle-scaled range for those games. |

### Minimum effective n for any decision
At least 120 games in all, and at least 40 stratum games. Below that the result is **NEEDS MORE EVIDENCE**, whatever the
estimates.

### Secondary metrics (Holm-adjusted at α = 0.05; reported, and gating as stated)
| Metric | Requirement |
|---|---|
| Total MAE | Non-inferiority: upper CI < +0.15 |
| **Win probability** | Log loss: upper CI of (candidate − official) < +0.005. Brier: upper CI < +0.002. Calibration: ECE (10 equal-mass bins) ≤ official ECE + 0.01. In the stratum: log-loss point estimate ≤ 0 |
| Margin 80% interval coverage | Within **0.75–0.85**. That is ±1.5 binomial SE at n ≈ 140, tighter than P300's 0.72–0.88 because margin intervals are well-sampled |
| Total 80% interval coverage | Within 0.75–0.85 |

### Win probability (point B)
Win% is evaluated with proper scoring rules (log loss, Brier), calibration, and a paired comparison against the official
model, under its own bars above. The design is not a reuse of the ceiling test: the ceiling is cited only as an effect
bound.

What the evidence can and cannot justify:
- A forward n of about 141 detects a log-loss difference of about 0.012 at 80% power (assumed per-game sd of the paired
  difference about 0.05). That is above the oracle's aggregate −0.01, so this season can at best show **non-inferiority**
  of win%.
- Meeting the bars would justify **displaying the candidate's win% as a labelled challenger** beside the official one. It
  would **not** justify **replacing** the official win%.
- Replacement would need the win head to clear non-inferiority in **each of two consecutive seasons** (2026 forward and
  2027) and stratum log-loss superiority (upper CI < 0) on the pooled forward set. This mirrors the ceiling's
  every-season lesson.

### Category-specific evaluation (descriptive, not gating)
Margin MAE, bias and coverage are reported per starter category (tier a, b, d′, promoted, traded, emergency) and per
week. A category with n < 15 is listed, never summarised as a direction.

### Starter-change sensitivity (gating)
For every game with scenario receipts (alternative starters), the margin shift between scenarios must have the sign
implied by Δ in ≥ 90% of pairs. The candidate must respond to who starts, in the right direction.

### CI method and looks
- Paired cluster bootstrap over season-weeks, 10,000 resamples, percentile intervals; seed 20260915 (the P300 prereg).
- **One interim look** at n = 120 total, with O'Brien–Fleming spending: interim α = 0.005, final α = 0.048.
- No other peeking. Results between looks are not computed.

### Operational reliability minimums (gating)
- A receipt of record before kickoff for ≥ 98% of games.
- Starter-identification accuracy ≥ 95%: the identified starter took the team's first offensive snap. Games where he did
  not are kept in the analysis and reported.
- 0 coherence failures.
- A byte-identical re-run on a 5% random audit of receipts.

### Outcome states
| State | Meaning |
|---|---|
| **ELIGIBLE FOR PROMOTION PROGRAM** | P1, P2, minimum n, the gating secondaries, sensitivity and reliability all hold. Eligible for a separately preregistered promotion program only. |
| **NEEDS MORE EVIDENCE** | Minimum n not met, or any CI straddles its bar. Continue forward into 2027 under the same frozen spec. |
| **REJECTED** | P1's lower CI > +0.10 (harm), or P2's lower CI > 0 in the stratum, or a reliability minimum fails. |

## 5. Freeze record (confirmed at approval)
| Item | Value |
|---|---|
| Candidate id | `qb-projected-passing-drive-tilt-v1` |
| Engine | `nfl-drive-sim-v2` 2.0.0-shadow; receipt schema `simulation-receipt@2.2` |
| Starter projection | `app/src/lib/sports/nfl/qb-starter-projection.mjs` and the fallback challenger spec v1 (sha above) at the approval commit |
| Input schemas | player board (`integrity.qbStarter`), `gtp.nfl.qb-fallback@1`, forecast receipts `nfl-regular-season-public-v1`, depth-chart captures `nfl-depth-chart-qb-snapshots` |
| κ | Fitted on 2018–2025 development data; value and fit script sha recorded in the approval commit |
| Forward sample | Unused: no game after 2026-11-11 scored by this candidate or any QB projection method |
| Spec | This file's sha256, as approved |
