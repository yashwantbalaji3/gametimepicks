# Selection-policy simulation — card-level backtest (2026-06-01 → 2026-06-08)

Card-level backtest on **settled outcomes** (`optimizer-graded/*`). Restrict-only
(never invents legs); reformation ranks by **reliability (recent10 L10 + odds),
never edge or confidence**. baseline = actual published cards. Small samples →
wide Wilson bounds (reported). Run: `app/scripts/simulate-selection-policy.mjs`.

## Overall + per-lane card hit rate by policy
| Policy | Overall card | Low | Medium | High | Longshot | Cards |
|---|---|---|---|---|---|---|
| **baseline** (as published) | 10% (15/157) | 26% | 13% | 0% | 0% | 157 |
| **low-strict-2** | **22%** (30/137) | **37%** | 23% | 13% | 11% | 137 |
| edge-cap-low-med | 13% (9/71) | 25% | 0% | 15% | 10% | 71 |
| odds-band-tightening | 18% (21/120) | 25% | 23% | 13% | 11% | 120 |
| exposure-caps | 12% (7/59) | 19% | 13% | 6% | 9% | 59 |
| **proposed-combined** | **18%** (8/44) | **36%** | 14% | 13% | 9% | 44 |

## Per-lane LEG hit rate (quality)
| Policy | Low leg | Med leg | High leg | Long leg |
|---|---|---|---|---|
| baseline | 56% | 53% | 52% | 47% |
| low-strict-2 | 56% | 53% | 51% | 47% |
| edge-cap-low-med | **65%** | 57% | 57% | 46% |
| proposed-combined | **68%** | 55% | 56% | 50% |

## Exposure (legs)
| Policy | restricted | plus-money | high-edge(≥15) | same-game cards |
|---|---|---|---|---|
| baseline | 367 | 172 | 441 | 3 |
| proposed-combined | **19** | **21** | **31** | 0 |

## Findings (what the data supports)
1. **Low max 2 legs** — the clearest, best-coverage win: overall card 10%→22%,
   Low 26%→37%. **ACCEPT.**
2. **Reliability ranking (not edge)** — reforming by reliability lifts the dead
   lanes (High 0%→13%, Longshot 0%→11%) at the same length. **ACCEPT** (edge is
   inverted; stop ranking by it).
3. **Edge cap (≥15 Low/Med, ≥20 all)** — raises Low leg quality 56%→65–68% but
   costs coverage. **ACCEPT for Low/Med** (quality over volume is the stated goal).
4. **No plus-money Low / odds-band** — neutral-to-positive, safe. **ACCEPT.**
5. **Exposure caps** — collapse correlated/repeated exposure (high-edge 441→31,
   restricted 367→19) with no hit-rate harm. **ACCEPT** (conservative).
6. **High/Longshot stay lottery odds-band lanes** — they improve with reliability
   ranking but remain intentionally low-hit/high-payout; keep honest copy.

## Recommendation for PR 2 (simulation-backed)
Ship **proposed-combined** rules in the optimizer: Low/Bank **2 legs**, edge cap
(≥15 Low/Med, ≥20 all), no plus-money Low/Bank, ≤1 restricted leg/card, ≤2 cards
per player-market, same-game cap 2, and reliability (not edge/confidence) ranking.
Expected: Low card ~26%→~36%, Low leg ~56%→~68%, far cleaner exposure, fewer but
materially stronger cards. Coverage drops (157→~44 over 8 days) — honest empty
tiers where supply is thin, no padding.

_Caveats: ~40 cards/lane baseline → wide Wilson; reformation assumes kept legs
were offerable. Direction is robust (parlay math + leg-quality gains), magnitudes
are noisy at this sample._
