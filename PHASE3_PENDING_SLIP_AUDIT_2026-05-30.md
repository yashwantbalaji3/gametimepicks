# Phase 3 — Pending Parlay Slip Audit (2026-05-30)

Branch: `fix/results-clear-pending-slips`

## Goal
Aggressively audit every pending/unresolved optimizer parlay slip and clear
**only those that can be honestly resolved from official data**. No manual
outcomes, no fabricated stats, no forcing no-shows into win/loss.

## Method
1. Enumerated every distinct `unresolved` leg across the public optimizer-graded
   files (May 25, 27, 28, 29).
2. For each, fetched the **official MLB Stats API boxscore** for the player's
   game and read the batting line (AB / PA / H / R / RBI / TB).
3. Classified each leg: *gradable* (player appeared, official stat exists) vs
   *honest no-show* (player did not appear — no batting line, or AB=0 & PA=0).
4. Fixed the one gradable case via the **official settlement path** only.

## Pending count: before → after
| Date | Before | After | Δ |
|------|--------|-------|---|
| 2026-05-25 | 12 | 12 | 0 |
| 2026-05-27 | 2 | **1** | **−1** |
| 2026-05-28 | 3 | 3 | 0 |
| 2026-05-29 | 8 | 8 | 0 |
| **Lifetime (optimizer)** | **25** | **24** | **−1** |

May 27 also moved 9W → **10W** (the cleared slip was a win).

## What was fixed
**Juan Soto — May 27 `batter_hits_runs_rbis` Over 1.5.** Soto played
(gamePk 823626, NYM vs CIN: 3 AB, 4 PA, **H2 / R1 / RBI1 → H+R+RBI = 4 > 1.5 =
Over win**). His H+R+RBI leg sat `unresolved` in **7 optimizer slips** because
**May 27 was settled before H+R+RBI grader support landed** (that support
arrived 2026-05-29 in `fix/public-risk-pending-audit`). May 27 still had **zero**
H+R+RBI settled rows while May 28/29 had full coverage.

Fix = re-run the **official** settler for May 27 only:
```
pipeline.mlb.settle_mlb_results --date 2026-05-27   # official boxscore re-fetch
pipeline.mlb.export_mlb_results                     # publish validation → public
pipeline.grade_optimizer --all                      # re-grade optimizer
```
This added **230** official `batter_hits_runs_rbis` settled rows for May 27
(set-level diff confirmed: **+230 HRR rows, 0 existing rows changed**, no other
date touched, no May 25/26 leak). Soto's 7 legs now grade `win 4.0`; 6 of those
slips were already losses on other legs (unchanged status, now honest at the leg
level); 1 (`opt_2026-05-27_star_power_80a258b988d2`) flipped **pending → win**.

## What remains pending — and why (all verified no-shows)
Every remaining pending leg = a player who **did not appear** (official boxscore
has no batting line, or AB=0 & PA=0). These are left **honestly pending** per the
documented settler policy — they are NOT forced to a result.

| Date | Player | Market | Boxscore | Reason |
|------|--------|--------|----------|--------|
| 05-25 | Juan Soto | batter_hits | no line | DNP |
| 05-25 | Keibert Ruiz | batter_hits | no line | DNP |
| 05-25 | Jake Bauers | batter_hits | no line | DNP |
| 05-25 | Gavin Sheets | batter_hits | no line | DNP |
| 05-27 | Jazz Chisholm Jr. | batter_hits | no line | DNP |
| 05-27 | Caleb Durbin | batter_hits | no line | DNP |
| 05-28 | Eli White | batter_hits_runs_rbis | AB0 / PA0 | no plate appearance |
| 05-29 | Nick Castellanos | batter_hits | no line | DNP |
| 05-29 | Bryan Torres | batter_hits / HRR | no line | DNP |
| 05-29 | Sterlin Thompson | batter_hits | AB0 / PA0 | no plate appearance |
| 05-29 | Ha-Seong Kim | batter_hits / total_bases | no line | DNP |

(The May 25 unresolved legs use the always-supported `batter_hits` market, so
they were never a grader gap — those players genuinely did not play.)

## Regression guard added
`pipeline/grade_parlays_test.py`:
- `test_mlb_settled_lookup_normalization` — added a `batter_hits_runs_rbis`
  row (Over 1.5, actual 4, Win) so the normalization path is covered for HRR.
- `test_mlb_hrr_optimizer_leg_resolves` — new test reproducing the Soto case:
  an optimizer HRR leg with a matching settled row must grade `win`, not
  `unresolved`, and the all-win slip must not linger as `pending`.

## Honesty confirmation
- **No manual outcomes.** The only result change came from re-running the
  official MLB Stats API settler; every row was computed programmatically.
- **No fabrication.** No invented stats, odds, schedules, or hit rates.
- **No no-show coercion.** Every genuine no-show remains pending.
- **No May 25/26 leak.** May 25 was not re-settled; set-level diff confirms only
  May 27 HRR rows were added.

## Known, intended side effect
The public single-prop MLB `lifetime_summary.json` deepened by the 230 newly
graded May 27 HRR props (decisive 2655 → 2885; hitRate 0.5058 → 0.5029). This is
an honest coverage improvement for an in-era date, not a new date or a frozen
date being altered.
