# June 19 — World Cup + Parlay Lab suggested-card coverage completion

_Branch `june19-worldcup-parlaylab-completion` off main `11c69b22`. Audit at 2026-06-19 19:22 UTC (USA 19:00Z has started → excluded; Morocco 22:00Z, Brazil 00:30Z, Turkey 03:00Z pre-event)._

## A. Current data inventory
| dataset | path | date | games | eligible | cards (risk L/M/H/Lo) | stale? | notes |
|---|---|---|---|---|---|---|---|
| WC projections | `world-cup/projections/latest.json` | 06-19 | 4 (3 pre-event) | 128 WC legs | — | no | USA started, gated out |
| WC player props | `world-cup/player-projections/latest.json` | 06-19 | 192 props | odds-backed | — | no | `parlayEligible:false` (lineups), market-implied |
| WC single-game | engine `gameSpecific` | 06-19 | — | — | 0/11/0/0 | no | only Medium today |
| WC multi-game | `suggestedBySportRisk.WORLD_CUP` | 06-19 | — | 128 | 0/10/5/0 | no | Longshot 0 |
| MLB board/cards | `mlb/boards/2026-06-19.json` | 06-19 | 14 | 546 | 0/8/7/5 | no | Low empty |
| Mixed | `mixedByRisk` | 06-19 | — | — | 0/10/5/5 | no | Low empty |
| Moonshot | `moonshot-lane/active.json` | 06-19 | 3 | — | Longshot 1 | no | separate lane |
| Bank Builder active | `dual-bank-builder-active.json` | 06-19 | — | — | Lane A +204 (Med), Lane B +111 (Med) | no | protected `bank-builder/*` untouched |
| Diagnostics | `parlays/card-factory-diagnostics.json` | 06-19 | — | — | 4 scopes, no totals | no | needs Moonshot/BB rows + totals |

## B. Risk matrix current → final
| scope | Low | Medium | High | Longshot | total |
|---|---|---|---|---|---|
| World Cup Games | 0 | 11 | 0 | 0 | 11 |
| World Cup Multi-Game | 0 | 10 | 5 | 0 | 15 |
| MLB | 0 | 8 | 7 | 5 | 20 |
| Mixed Sport | 0 | 10 | 5 | 5 | 20 |
| **Moonshot** (new row) | 0 | 0 | 0 | 1 | 1 |
| **Core Bank Builder** (new row) | 0 | 2 | 0 | 0 | 2 |
| **risk totals** | **0** | **41** | **17** | **11** | **69** |

## D. Product gap list
| priority | gap | surface | cause | fix | success |
|---|---|---|---|---|---|
| P0 | matrix lacks Moonshot + Bank Builder rows + totals | `/picks` `/parlays` | old 3-row grid | new `coverage-matrix.ts` (6 scopes + row/risk/grand totals) | matrix shows 6 rows + totals footer |
| P0 | empty buckets had no totals-level reason | matrix | — | per-cell `topReasons` + summary | every empty cell explains itself |
| P1 | Low Risk empty everywhere | all scopes | 2+-leg parlays price > +100 after dropping < -500 filler | **honest empty** (NOT forced) + reason | Low row shows real reason, no fabricated cards |
| P1 | active cards could double-count | matrix | — | Moonshot/BB in OWN rows only | not counted in generic WC/MLB/Mixed |
| P2 | WC single-game High/Longshot empty | game pages | same-game odds rarely reach +300/+600 in 2 legs | diagnostic reason | reason shown, not forced |

## Decisions
- **Do NOT force cards to fill a bucket** (per directive). Low Risk is structurally empty (a 2+-leg parlay rarely prices into -200..+100 after the -500 leg guard) — shown as an honest empty with a real reason, not padded with bad cards.
- **Active-card policy:** Moonshot + Core Bank Builder cards appear in their **own matrix rows only**, never inside the generic WC/MLB/Mixed suggestion counts → no double-count. Documented in the matrix summary.
- **Coverage model:** new `src/lib/parlays/coverage-matrix.ts` extends the card-factory diagnostics with Moonshot + Bank Builder scopes + row/risk/grand totals. Pure + tested.

## Guards
No fabrication (counts come from real generated cards); no forced bad cards; stale UFC/started games excluded; protected `public/data/bank-builder/*` untouched; canonical risk labels; no banned copy.
