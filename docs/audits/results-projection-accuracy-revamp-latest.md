# Results Page — Projection-Accuracy Lead (revamp)

> Reframes /results to lead with leg-level model accuracy instead of parlay
> (card) hit rate. Settled-only real data; no paid credits; no projection/
> grading-math change.

## Framing issue (root cause)
The page led with parlay hit rate (~16.5% published / ~14.9% generated). Parlays
are naturally low — every leg must hit — so that understated the model. The
cleaner read is the **leg-level projection hit rate** (the model's individual
leaned pick vs the line), which is above 50% in both sports.

## Data source
`lifetime_summary.json` (already computed, settled-only): `results/` = NBA,
`mlb/results/` = MLB. Each row in the matching `settled_leans.jsonl` is one
leaned pick with a graded result; pushes/voids excluded from `decisive`. Cross-
checked W/L against the raw leans in the audit.

## Actual numbers (settled 2026-05-15/16 → 2026-06-05)
| | hit rate | wins / decisive |
|---|---|---|
| **Overall projection** | **50.6%** | 4,292 / 8,483 |
| **MLB projection** | **50.1%** | 2,949 / 5,884 |
| **NBA projection** | **51.7%** | 1,343 / 2,599 |
| Parlay — Published cards (lifetime) | 16.5% | 21 / 127 |
| Parlay — Generated pool (lifetime) | 14.9% | 100 / 669 |

Both sports clear 50% → green positive state + "clearing 50% in both MLB and NBA."

## Changes
- New `ProjectionAccuracySummary` component (Overall / MLB / NBA cards, >50%
  positive state, "not enough settled data" fallback, honesty footnote).
- `results/page.tsx`: renders it as the **lead**, above the parlay `ResultsHero`;
  added a "Parlay card performance · higher variance" framing + the "every leg
  must hit" explanation. Two-record (Published / Generated) + by-sport-mix +
  settled-slate detail UX all preserved.
- New `audit-results-projection-accuracy` (existence, cross-check vs leans,
  push/void exclusion, no-pregame, parlay metric retained, projection-leads-page).

## Validation
- app **718/718**, tsc clean, build ✓; audit **PASS**
- browser QA: Results leads with Model Projection Accuracy (3 cards) then parlay
  performance; Home Top Pick/Bank Builder intact; Parlay Lab 4 sections + leg
  modal metadata intact; **0 console errors; 0 overflow at 375px** on Results /
  Home / Parlay Lab.

## Preserved / honesty
Two-record parlay UX, by-sport mix, settled-slate detail, pregame chip, MLB-only
handling, no stale dates, no banned/V2 copy, V2 internal. No fabricated numbers;
parlay metrics kept visible and clearly labeled.

*Read-only data re-use + UI/validation. No paid API, no projection/grading change.*
