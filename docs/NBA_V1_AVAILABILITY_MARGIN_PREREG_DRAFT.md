# NBA M1 — `nba-sim-v1-availability-margin` — preregistration DRAFT

Status: **DRAFT, unapproved, unarmed.** 2026-11-11, forecast-guard (engine). Founder approval is needed for **λ** and
for this preregistration before the single 2025-26 look is run. Nothing here is public, armed or in CI. The development
results below were seen by the drafter, so every bar is copied from existing approved programs (§6); none is new.

## 1. Candidate
v1 (`nba-sim-v1-coherent`) with ONE change to the expected regulation margin:

    μm' = μm(Elo, HCA)  +  λ · [ (O_h,avail − O_h,ref) − (O_a,avail − O_a,ref) ]

- `O` is v1's own pool offence (`expectedSidePoints`).
- `O_ref` is the pool without this game's absences; `O_avail` is the pool with them removed.
- Every other part of v1 is unchanged: total, pace, quarters, OT, minutes water-fill, scoring decomposition, the seven
  invariants, seeds.
- **No absence ⇒ v1 byte for byte.** This is tested in `game-sim-v1.test.mjs` (M1 tests). In the Week 10 demo, all
  9 games without a post-freeze absence came out byte-identical.

**λ = 0.1617** (SE 0.1842). The fit:
- 2023-24 (v1's fit season), regular season, at least 30 days in, n = 1010, of which 387 games had an absence in the
  pool.
- OLS with no intercept, of v1's regulation-margin residual on the availability difference, with v1's own parameters
  fixed. This is `calibrate-sim-v1.mjs`'s method extended by one regressor.
- Report: `data/internal/research/nba/reports/v1-availability-margin-fit-2024.json`. A recompute test is in
  `v1-availability-margin.test.mjs`.
- **Founder approval PENDING** (methodology-constants rule).

## 2. Availability input
- **Historical:** a **TIP-TIME PROXY**. A player in the historical roster-proxy pool counts as out when he has an
  injury-type DNP in the game's box score (a dnpReason that is not a coach's decision). This is ex-post text standing in
  for the pregame inactive list. It misses in-game injuries, which correctly count as "played". `O_ref` is the roster
  proxy itself (players who appeared in the team's last 10 games), so absences Elo's recent results already reflect are
  not counted twice.
- **Forward:** the hashed pregame injury snapshots, at two instants per game, each write-once and private:
  - the official freeze; and
  - when a new Out is captured, a post-news instant.

  `O_ref` is the pool at the freeze snapshot and `O_avail` the pool at the post-news snapshot. The difference is the
  **post-freeze** absences.

## 3. Data separation
| Use | Data | Status |
|---|---|---|
| Fit λ | 2023-24 | done (§1) |
| Development | 2024-25 | **exploratory, seen** (§4) |
| **Holdout: single look** | 2025-26 regular season, at least 30 days in, tip-time proxy | **not run.** Runs once, only after approval |
| Forward | every game after approval, post-news instant, real snapshots | confirmatory primary; n ≥ 300 |

Already-played 2026-27 games are **exploratory forever**. The 11-11 BOS@TOR replay is a demonstration and is never
evidence.

## 4. Development results — 2024-25, EXPLORATORY (n = 1005; 2000 paired simulations per arm)
Report: `data/internal/research/nba/reports/v1-availability-margin-dev-2025.json`.

| Paired difference (candidate − reference) | Mean | 95% CI (game bootstrap, B 2000, seed 20261020) |
|---|---|---|
| log loss − v1 (λ = 0) | −0.0008 | [−0.0025, +0.0010] |
| Brier − v1 (λ = 0) | −0.0003 | [−0.0011, +0.0004] |
| margin abs error − v1 (λ = 0) | +0.0064 | [−0.0243, +0.0368] |
| log loss − walk-forward Elo | −0.0071 | [−0.0126, −0.0015] |

**Reading.** The availability term shows **no detectable effect** on development data: every CI against λ = 0
includes 0. In games with an absence (n = 510), the log-loss difference is −0.0015 and the margin abs-error difference
+0.013. The gain over Elo is v1's own gain, not the term's.

## 5. Demonstration only — BOS @ TOR 401909968, 2026-11-11 (never evidence)
v1 was built from the sha-matched committed blobs: the 08:23:18Z injuries blob `86b241f5e805…` and the 18:18:20Z blob
`52fa7d48b4c4…`.
- **Paul George** was Out (stated 17:55Z). BOS pool offence fell from 110.18 to 106.62 per 240 minutes (−3.56); TOR's
  rose from 104.47 to 104.69 (+0.22).
- **Candidate shift:** λ·(0.22 − (−3.56)) = **+0.61 points to TOR's expected margin**. TOR's win chance moves from
  38.3% (v1 at 18:18, λ = 0) to **39.6%**; BOS from 61.7% to 60.4%.
- v1 at 08:23 had TOR at 38.2%. v1's total fell by 3.4 points (203.9 → 200.5), but its margin did not move.

## 6. Analysis plan for the single 2025-26 look and the forward primary
**Primary:** paired log loss, candidate − v1 (λ = 0). Game-level bootstrap, B 2000, seed 20261020 (`bootstrap.mjs`).
A direction is claimed only when the 95% interval excludes 0; lower is better.

**Secondary (reported):**
- candidate − walk-forward Elo (the official rule) log loss;
- Brier;
- ECE with 10-bin reliability;
- home bias;
- margin MAE and cov80/cov50;
- total MAE.

**Slices:** by quantile of |ΔO_h − ΔO_a|. Reported only, with no thresholds.

**Forward:** a minimum of n = 300 for the primary verdict, a single look, copied from prereg v2 (§7). Not new.

**Leakage:**
- every input is strictly before its instant;
- snapshot sha = the receipt's or the git blob's;
- mutation probes refuse a post-tip box score and an after-instant snapshot.

## 7. Engine recommendation (not a decision)
On the development evidence the term is **null**: λ is within one SE of 0, and the paired CIs straddle 0.
- **The 2025-26 holdout is a single-use asset.** Spending it on this candidate is unlikely to show anything, and it
  would then be gone for a better-motivated one.
- **Recommendation:** do **not** run the 2025-26 look for M1 as specified. Keep this draft. Treat M1 as having
  established infrastructure, not evidence:
  - the margin hook, byte-identical at 0;
  - the replay path;
  - the λ fit with its recompute test.
- **M2** should change the availability **measure**, not just λ. The ΔO measure is a minutes-weighted per-240 rate
  average; water-fill hands an absent star's minutes to teammates at their own rates, so the measured offence change is
  small (George: −3.6 per 240). The audit's gap list points at usage redistribution and replacement-level value as the
  missing pieces.
- If the founder prefers to run the look anyway, the plan above stands as written.

## 8. M2 addendum — usage redistribution and replacement value (2026-11-11, EXPLORATORY)
M2 changes the **measure**, not the coefficient. Per 240 team minutes:

  ΔO = a·(O_avail − O_ref) + b·(U_ref − U_avail)·(O_avail / U_avail)

- **Replacement value (first term).** The rotation's replacements play the vacated minutes at their own rates (v1's
  water-fill over the depth chart).
- **Usage redistribution (second term).** The scoring possessions the replacements do not take are absorbed by
  teammates at the remaining pool's points per possession. U = FGA + 0.44·FTA per minute.
- **The margin shift** is ΔO_home − ΔO_away.

**Fit:** OLS with no intercept, per team-game, 2023-24, on the actual regulation team points minus v1's expected team
points with the reference pools. n = 2020 team-games, 446 of them with an absence.
- **a = 0.956 (SE 0.709)** and **b = 0.805 (SE 0.731)**: plausible directions, imprecise.
- Report: `data/internal/research/nba/reports/v1-availability-usage-fit-2024.json`, with a recompute test.

**Development, 2024-25, exploratory** (n = 1005, 510 with an absence, paired seeds, game bootstrap):

| Candidate − reference | Mean | 95% CI |
|---|---|---|
| log loss − v1 (λ = 0) | −0.0005 | [−0.0032, +0.0022] |
| Brier − v1 (λ = 0) | −0.0002 | [−0.0014, +0.0009] |
| margin abs error − v1 (λ = 0) | +0.019 | [−0.027, +0.065] |
| log loss − walk-forward Elo | −0.0068 | [−0.0130, −0.0007] |

**No detectable effect**, as with M1. The gain over Elo is v1's own. The 2025-26 holdout stays unspent.

## 9. What to try next (closed 2026-11-11; no further iteration without a new hypothesis)
M1 and M2 are two honest nulls. Both used the ex-post tip-time DNP proxy and rate-based pool measures. We stop iterating
availability measures on this input. Both constant sets (λ; a, b) stay unarmed, with no founder ask.

A new attempt needs a new hypothesis, not a new coefficient. Candidates:
1. **Lineup-driven margin.** The possession engine simulates who is on the floor, so an absence changes the
   lineup-level net rating directly, instead of a team-pool rate average that water-fill dilutes.
2. **Pregame-timestamped availability.** Replace the DNP proxy with our own write-once injury captures once enough
   accumulate for a fit and a development split. This removes the proxy's in-game-injury and late-scratch noise and
   matches the forward input exactly.
3. **Star-specific effects.** Fit on-off effects for the few players whose absence moves the market, with shrinkage,
   rather than one league-wide coefficient. This needs more seasons than the corpus has, so it ranks last.

The 2025-26 holdout stays unspent until one of these shows a development signal.
