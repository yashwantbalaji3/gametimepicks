# Generation-Curation Before/After — June 5 (in-memory simulation)

> Deterministic simulation: re-ran the proposed `generate_public_risk_sections`
> (target 4→6 + market-concentration penalty) on June 5's **already-generated
> legPool** in memory. **No paid regeneration, no `app/public/data` write.**
> Displayed counts use the real #278 `selectPublishedSections` logic.

## publicRiskSections (the generated/graded set)
| sport | CURRENT (target 4) | PROPOSED (target 6) |
|-------|-------------------:|--------------------:|
| MLB | 16 | **24** |
| NBA | 4 | **6** |
| Mixed (multi) | 16 | **24** |

## Projected DISPLAYED cards (#278 selectPublishedSections)
| view | CURRENT | PROPOSED |
|------|--------:|---------:|
| **All** | 17 | **19** |
| MLB | 6 | **7** |
| NBA | 4 | **5** |
| Mixed | 7 | 7 |

`All ⊇ children` holds in both.

## Diversity metrics (MLB bucket)
| metric | CURRENT | PROPOSED |
|--------|--------:|---------:|
| distinct players | 10 | 12 |
| distinct markets | 3 | 3 |
| top-player uses | Donovan Walton ×13 | Donovan Walton ×19 |
| top-market uses | batter_hits_runs_rbis ×47 | batter_hits_runs_rbis ×71 |

## Honest finding — June 5 is supply-concentrated, not code-limited
The proposed curation makes the **generated/graded** buckets materially deeper
(MLB 16→24, Mixed 16→24, NBA 4→6), but the **displayed** MLB only rises 6→7. The
display-layer diversity caps (#278: maxPlayer 3, maxMarket 6) correctly refuse to
publish many near-identical cards, because June 5's *eligible, high-quality* MLB
supply is dominated by one market (`batter_hits_runs_rbis`) and a few players
(Walton). **Tested:** even raising the market penalty to 0.20 leaves displayed
MLB at 7 — there simply aren't 10–15 *diverse, comparably-scored* MLB combos on
this slate. Forcing more would mean publishing lower-edge cards purely for
variety, which we do NOT do (quality stays primary; no padding).

## Answers
- **Can MLB reach 10–15 honestly on June 5?** No — its high-quality supply is
  market-concentrated. The change raises the *ceiling*; the slate doesn't fill it.
- **Can Mixed reach ~10 honestly?** Not on June 5 (shared single NBA game +
  concentration cap it at 7); deeper psr helps but the slate limits it.
- **Is NBA supply-limited?** Yes — 1 Finals game, 17 players. Honest small count.
- **Does the change help?** Yes, where supply allows: All 17→19 on June 5, and on
  a slate with naturally diverse high-quality supply the target-6 + market penalty
  surface more distinct markets/players (validated by the new optimizer unit tests
  with even supply). It is a **future-slate** improvement; it does not retroactively
  change June 5 production (no regeneration).

## Tradeoffs
- Deeper buckets → more graded published cards (more Results signal over time).
- Slightly more total slots can mean more same-player exposure in the *generated*
  set on concentrated slates (Walton 13→19 in psr) — but the **display** caps
  still bound what users see (Walton ≤3 cards), so the public surface stays
  diverse. No quality bar lowered; no fabricated/padded slips.

*Simulation only. No generated data written. No projection/scoring/grading change.*
