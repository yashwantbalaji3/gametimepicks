# June 18 — Step 2 settlement + dual-lane lifecycle + Mr. Dub ledger

_Branch `june18-step2-settlement-mrdub-lifecycle` off main `5d62bdfb` (#521). ~14:23 ET (18:23 UTC)._

## Current state
| area | source | state | risk | action |
|---|---|---|---|---|
| active artifact | `methodology/launch/dual-bank-builder-active.json` | ladder, Step 2 pending | non-protected | settle Step 2 + lifecycle |
| protected history | `public/data/bank-builder/*` (crown `public-ledger-latest.json`: 5 entries $100→$10,376.17) | immutable | must not mutate | READ to seed Mr. Dub |
| Step 2 legs | Lane A Czech ML + Josh Bell; Lane B Switzerland ML + Goldschmidt | — | — | grade officially |
| WC settlement | ESPN `soccer/fifa.world` (API-Football has no 2026 finals) | working | — | grade ML on 90-min FT |
| MLB settlement | MLB Stats API box score | working | — | grade HRR; DNP→void |
| same-game parlayId | `same-game.ts` via `assembleParlay` (`date:risk:same_game:index:sport`) | **omits gameId → collides** | React-key/leak | include gameId in id |
| public Bank Builder | `bank-builder-preview-panel` | shows both lanes | — | hide stopped lanes |
| Mr. Dub | none | — | — | new `mr-dub/` data + `/mr-dub` page |

## Official settlement (verified)
| lane | leg | event | start | status | official | result |
|---|---|---|---|---|---|---|
| A | Czech Republic ML | Czechia–South Africa | 16:00Z | **FT (post)** | **Czechia 1–1 South Africa** | **LOSS** (draw loses the moneyline) |
| A | Josh Bell HRR O1.5 | Twins@Rangers | 18:35Z | **Live/Warmup (started)** | — | void / no-action (lane already decided; leg not pre-event for replacement) |
| B | Switzerland ML | Switzerland–Bosnia | 19:00Z | pre | — | **pending** |
| B | Goldschmidt HRR O1.5 | WSox@Yankees | 23:05Z | pre | — | **pending** |

- **Lane A:** Czech ML lost; the other leg (Bell) is already in warmup/Live → **no pre-start replacement possible** → Lane A Step 2 = LOST → lane **stopped** → hidden from public Bank Builder → logged in Mr. Dub → **restart a fresh $100 Lane A** from the current pre-event pool.
- **Lane B:** both legs pre-event → lane stays **active/pending** (no change).

## Lifecycle plan
| case | public Bank Builder | Mr. Dub | mutation | tests |
|---|---|---|---|---|
| both legs win | lane advances | win event, bankroll↑ | active artifact | grade=won |
| one loss, other started (Lane A today) | hide stopped lane; show fresh restart | lane_stopped −$184.03 + lane_restarted $100 | active artifact only | Czech draw=loss; stopped hidden |
| one leg pending (Lane B today) | show active lane | open exposure | none yet | pending stays public |
| completed target | success showcase | completed_success | — | crown import |

## Plan
1. Same-game `parlayId` includes `gameId` (engine source); matcher keeps defensive prefix.
2. Settlement script grades Step 2 → writes results + `laneStatus` (Lane A `stopped`, Lane B `active`) into the active artifact (non-protected).
3. Restart fresh $100 Lane A (Step 1) from the current pre-event eligible pool; queue if none qualifies.
4. Public Bank Builder hides `stopped` lanes; shows active Lane B + restarted Lane A + the completed crown.
5. New `app/public/data/mr-dub/{ledger,portfolio,daily-summary}.json` seeded from the protected crown (5 steps) + June 17 Step 1 (won) + June 18 Step 2 (Lane A stopped, Lane B pending).
6. New `/mr-dub` page (hero, bankroll timeline, active cards, daily ledger, full ledger, exposure) — paper-only copy. Link from Bank Builder.

**Non-negotiables:** official sources only; protected `public/data/bank-builder/*` never mutated; no banned copy; "stopped/restarted/continues", never "failed" on the public marketing surface.
