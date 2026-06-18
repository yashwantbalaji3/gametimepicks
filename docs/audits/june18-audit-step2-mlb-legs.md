# June 18 — Step 2 MLB leg audit + refinement

_Branch `june18-audit-step2-mlb-legs` off main `80897fc6` (#517). Audit time 2026-06-18 12:33 ET (16:33 UTC)._

## Replacement window
- **Matt Olson** (Lane A MLB): first pitch 23:16 UTC (7:16 PM ET) — **NOT started** → replaceable.
- **Pete Alonso** (Lane B MLB): first pitch 20:11 UTC (4:11 PM ET) — **NOT started** → replaceable.

## Phase 1 — current MLB legs audited (official MLB Stats API game logs)
| leg | odds | model | survival | risk | last-5 | last-10 | concern |
|---|---|---|---|---|---|---|---|
| Matt Olson HRR Over 1.5 | −107 | 69% | 88 | 0.35 | **3/5 (60%)** | **6/10 (60%)** | weakest recent form in the pool; HRR depends on team sequencing |
| Pete Alonso HRR Over 1.5 | +102 | 67% | 87 | 0.35 | **3/5 (60%)** | **6/10 (60%)** | same — lowest model prob, 60/60 hit rate |

Owner's instinct confirmed: Olson and Alonso were the **weakest** eligible MLB legs (lowest model prob, lowest last-5/last-10, top-end HRR volatility risk 0.35).

## Phase 2–3 — candidate audit (34 eligible MLB legs, survival ≥ 82, payout-band odds)
Top alternatives with real last-5/last-10 (vs the exact line):
| candidate | market | odds | model | surv | risk | last-5 | last-10 |
|---|---|---|---|---|---|---|---|
| **Josh Bell** HRR O1.5 | +101 | 68% | 88 | 0.35 | **4/5 (80%)** | 7/10 (70%) → re-pulled **4/5, [5,6,3,1,2]** |
| **Paul Goldschmidt** HRR O1.5 | −128 | 74% | 90 | 0.35 | **5/5 (100%)** | **9/10 (90%)** |
| Byron Buxton HRR O1.5 | −135 | 74% | 90 | 0.35 | 5/5 (100%) | 8/10 (80%) |
| Bo Bichette HRR O1.5 | −167 | 73% | 88 | 0.35 | 5/5 (100%) | 8/10 (80%) |
| **Shane Drohan** K U5.5 | −136 | 74% | **100** | **0.16** | 4/5 (80%) | **9/10 (90%)** |
| Sean Manaea K U5.5 | −158 | 83% | 88 | 0.26 | 3/5 (60%) | 7/10 (70%) |
| Shane Baz K U5.5 | −121 | 80% | 87 | 0.26 | 2/5 (40%) | 6/10 (60%) |

## Phase 4 — decision (soccer legs kept; MLB partner re-optimized)
- **Lane A: Olson → Josh Bell HRR Over 1.5 (+101).** Higher recent form (last-5 60%→**80%**, last-10 60%→70%), HIGHER payout, same survival/risk class. Projected **$609.14 → $632.24** (stays in the $600–700 band). Game bb47b4 (Twins, pre-event).
- **Lane B: Alonso → Paul Goldschmidt HRR Over 1.5 (−128).** Best recent form in the pool (last-5 60%→**100%**, last-10 60%→**90%**), model 67%→74%, survival 87→90. Projected **$652.16 → $575.08** (modest payout dip — reported tradeoff for a materially better leg). Game adfa73 (pre-event).
- New last-5 (official logs): Bell `[5,6,3,1,2]` → 4/5; Goldschmidt `[6,5,3,4,2]` → **5/5**.

### Rejected alternatives & why
- **Shane Drohan K U5.5** (safest: risk 0.16, surv 100, last-10 90%) and **Sean Manaea K U5.5** (model 83%): the pitcher strikeout-unders are structurally safer than HRR, but at −136/−158 they drop the lanes to ~$547/$527 — **below the $600 target**. Kept the lanes near band with elite-form HRR upgrades instead; documented the safety-vs-payout tradeoff here.
- **Shane Baz K U5.5**: model 80% but last-5 only 2/5 (40%) — recent form contradicts the under.
- **Buxton / Bichette HRR** (100% last-5): comparable to Goldschmidt but shorter odds → lower payout; Goldschmidt chosen (best model + last-10 + payout balance).

## Guards
- **Replaced both MLB legs only** (both pre-event). Soccer legs (Czech ML, Switzerland ML) unchanged. Lane A and Lane B remain 4 distinct, non-correlated games. Step 1 settlement + protected `public/data/bank-builder/*` untouched.
- No fabrication — odds from The Odds API; last-5/last-10 from official MLB Stats API (never invented).
- Surgical script `app/scripts/replace-step2-mlb-leg.mjs` (refuses post-first-pitch); `pipeline/attach_bank_builder_last5.py` re-run to refresh last-5.
- tsc clean · 1017 app tests · build OK · copy/secret/protected audits clean · no console errors.

## Note
Both replacements remain HRR-overs (no safer K-under keeps payout near $600 with strong recent form), but they swap the pool's **weakest** HRR legs (60/60) for its **strongest** (Bell 80/70, Goldschmidt 100/90) — a direct, data-driven answer to "are these strong enough."
