# June 19 — Balanced risk-bucket generation (Low / Medium / High / Longshot)

_Branch `balanced-risk-bucket-generation` off main `fc474495`. Audit at 2026-06-19 20:13 UTC (Morocco 22:00Z, Brazil 00:30Z, Turkey 03:00Z pre-event; USA started → gated out)._

## Imbalance audit (before)
| scope | low | medium | high | longshot | desired target | cause of imbalance | planned fix |
|---|---|---|---|---|---|---|---|
| World Cup single-game | 0 | 11 | 0 | 0 | 1/1/1/1 per game | generator builds only 2-leg same-game cards (→ Medium) | same-game High/Longshot stacks (follow-up) |
| World Cup multi-game | 0 | 10 | 5 | 0 | 4/4/4/4 | builds only `spec.minLegs` legs → clusters Medium; team-only legs rarely > +600 | **leg-count spread 2→6** |
| MLB | 0 | 8 | 7 | 5 | 4/4/4/4 | same — only minLegs-count combos | **leg-count spread 2→6** |
| Mixed | 0 | 10 | 5 | 5 | 4/4/4/4 | same | **leg-count spread 2→6** |
| Moonshot | 0 | 0 | 0 | 1 | 0/0/0/1 | separate lane | unchanged |
| Core Bank Builder | 0 | 2 | 0 | 0 | 0/2/0/0 | active lanes | unchanged |

## Root cause
Cards are re-bucketed by **combined odds** (`ui-loader.rebucketByCombinedOdds`), but `generateDailyParlays`/`generateMixedParlays` only build combos at the level's `minLegs` (Low 2, Medium 2, High 3, Longshot 4). 2-leg favorite combos price into Medium, so Medium dominates and Longshot (needs > +600) is rarely reached from team-only legs.

**Validated fix (prototype):** generating a **leg-count spread (2,3,4,5,6)** and re-bucketing by combined odds fills the buckets:
- MLB 546 legs → medium 6 / high 8 / **longshot 26**
- World Cup 128 legs → medium 9 / high 7 / **longshot 16** (Longshot now fills from 5-6 leg team combos)
- Low stays 0 — no 2-leg combo prices into -200..+100 after the -500 guard (honest, not forced).

## Generator inventory
| generator | file | current archetypes | missing | diagnostics? | edit? |
|---|---|---|---|---|---|
| daily (cross-game) | `parlays/daily-parlays.ts` `generateDailyParlays` | minLegs combos per level | leg-count spread → High/Longshot | per-level notes | **yes** |
| mixed | `parlays/daily-parlays.ts` `generateMixedParlays` | greedy minLegs cross-sport | leg-count spread | per-level notes | **yes** |
| single-game | `parlays/same-game.ts` | 2-leg same-game | High/Longshot stacks | groups | follow-up |
| re-bucket + caps | `parlays/ui-loader.ts` | re-bucket by combined odds | per-bucket display cap | oddsBandDiagnostics | **yes (cap)** |
| targets/matrix | `parlays/coverage-matrix.ts`, `risk-taxonomy.ts` | scope×risk targets | RISK_BUCKET_TARGETS + balancedGeneration | card-factory + coverage | **yes** |

## Plan
1. `RISK_BUCKET_TARGETS` config (Low/Med/High/Longshot per scope) — shared.
2. Refactor the daily + mixed generators to build a **deduplicated leg-count spread (2→6)**, bucket each card by its combined odds, **cap each bucket at the target** (no Medium flood).
3. `balancedGeneration` diagnostics (targets / attempted / filled / underfilled reasons / extras).
4. Caps surfaced in the coverage matrix (suggested-display counts).
5. Low Risk stays honest (real reason if empty). Same-game High/Longshot documented as a follow-up.

## Guards
No fabrication; no forced bad cards; no leg < -500 / no -1000; pre-event only; active Lane A/B + Moonshot + Mr. Dub untouched; protected `public/data/bank-builder/*` untouched; canonical/allowed copy only.
