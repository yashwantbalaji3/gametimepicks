# June 28 "public demo-ready" refresh — REAL DATE IS JUNE 20

_Branch `june28-public-demo-ready-refresh` off main `05b99fe6`._

## Date reality (verified at runtime — the prompt's premise was off by 8 days)
The task said "It is Sunday, June 28." **The actual system clock is Saturday, June 20, 2026, ~16:20 EDT (20:20 UTC).** HEAD is `05b99fe6` (merged ~4h earlier today). API-Football confirms the live tournament is still the **June 20–21 group stage**, not a June 28 knockout round. There is no June 28 slate/results/bracket in any real source, so a "June 28" board cannot be built without fabricating — forbidden. **User chose: demo-prep the real June 20 state** (demo at 7 PM EDT = 23:00Z).

## Live reality (API-Football, 20:20Z)
| game | status | score | action |
|---|---|---|---|
| Netherlands vs Sweden (mid 33) | **FT** | **5–1** | settle (model went 5/5) |
| Germany vs Ivory Coast (mid 34) | in play (1H) | 0–0 | settle once FT (~21:50Z) |
| Ecuador vs Curaçao (mid 35) | NS (00:00Z+1) | — | upcoming tonight |
| Brazil 3–0 Haiti / Türkiye 0–1 Paraguay | FT | — | earlier/J19 |
| June 21 slate | NS | — | next visible (Spain, Belgium, Uruguay…) — odds + props available |

## What was done (and why)
| area | decision |
|---|---|
| **June 20 settlement** | `settle.py --date 2026-06-20 --scores <official-scores>` (API-Football FT scores). NED/SWE graded **5/5** (moneyline, over 2.5, double chance, BTTS, draw-no-bet all WIN on 5–1). GER/CIV pending (re-settle once FT). |
| **June 21 roll — evaluated, reverted** | Pulled June 21 (team odds + 236 player props): TS engine gave 37 WC cards but **MLB/Mixed = 0** and the Specials generator is **hardcoded to June 20** (`JUNE20_SPECIALS_CONFIG`). Too many loose ends to ship safely before 7 PM → reverted; kept June 20 as the consistent, complete slate. |
| **Specials box (de-stale)** | The June 20 Specials listed now-finished games as pre-event. Regenerated at current time → **0 eligible cards** (only ECU/CW pre-event; Specials need ≥2 games). Box now shows a clean "between slates" message (polished the empty-state; was a `preEventGames=None` glitch). Honest > stale. |
| **Board gating** | Today page badges started games via build-time `Date.now()`; the parlay engine excludes started games (coverage 83→43 honestly as the slate ran). |
| **Bank Builder / Moonshot / Mr. Dub** | **Unchanged** — Lane A advanced/awaiting $601.56, Lane B stopped, Moonshot stopped, Mr. Dub $9,776.17 / $0 / 9-6. No active card references June 20 → nothing to settle; protected crown untouched. |
| **MLB / Mixed** | June 20 board (15/15) retained; coverage current. |
| **UFC** | only June 15 (settled) in repo; `/ufc` fail-closed; not fabricated. |

## Guards
No fabrication (no June 28 invented); official settlement only (API-Football FT); protected crown + bankroll untouched; secrets never printed; canonical/allowed copy only.
