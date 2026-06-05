# UI/UX Comprehensive Review (2026-06-05 evening)

> Browser QA (local dev, post-#283 reclass) at 375px + 1280px + SSR content scan.
> No UI code changed this pass — review + verification only. No bugs requiring an
> immediate fix were found.

## Routes reviewed (all HTTP 200, substantial content)
`/` · `/projections/` · `/parlay-lab/` · `/results/` · `/events/` · `/methodology/` · `/about/`

## Checks
| check | result |
|-------|--------|
| Horizontal overflow @ 1280 | none (home, projections, parlay-lab, results, …) |
| Horizontal overflow @ 375 | none |
| Console errors | **none** across home/projections/parlay-lab/results |
| Banned public copy (safe/lock/guaranteed/risk-free/better-hit-rate) | none (SSR scan + rendered) |
| Public V2/new-model/shadow/edge copy | none |
| Stale May 25/26 data leak | none |
| Empty/placeholder pages | none (all routes render real content) |

## Parlay Lab (post-reclass, live behavior)
- 4 sport pills: **ALL · 🏀 NBA · ⚾ MLB · 🔀 MIXED**.
- **MLB tab: 7 conservative Low/Med cards** (no plus-money, no weak-form legs).
- **NBA tab: 0 cards** with honest empty state ("No qualifying … cards after sport, variety, and volume filters. Sections are not padded.").
- **Mixed tab: 5 cards.** (NBA legs in Mixed Medium/High still show stale recent-form in the modal — board-data caveat, resolved next slate by #282.)
- #274 count labels ("generated combinations" / "published cards" / "curated subset") live.

## Results
- Two-record UX live: "Published cards · lifetime" vs "Generated pool · lifetime".
- "Published cards by risk" / "by sport mix" / "Settled published cards"; Mixed note corrected.

## Known cosmetic caveat (not a code bug)
NBA recent-form modal shows stale regular-season games on June 5 because the board predates #282. Fixed automatically on the next fresh slate. Optional follow-up: empty-state copy could mention "form" (e.g. "after form, price, and variety filters") — a small app/src change deferred (needs its own browser QA).

## Verdict
No overflow, no console errors, no banned/leaky copy, honest empty states. No immediate UI fix required. Product is in good shape post-reclass.

*Review only. No UI code changed.*
