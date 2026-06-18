# June 18 — Build engine migration + World Cup game pages

_Branch `june18-build-engine-worldcup-game-pages` off main `2583e717` (#519). Review at 13:28 ET._

## Current-state review
| surface | current source | issue | target source | planned fix |
|---|---|---|---|---|
| `/build` | `buildWcLegs(WC proj/player) + buildOptimizerLegs(getSuggestedParlaysForDate)` (legacy) | not the engine `eligibleLegs`; MLB legs from optimizer slips, not the gated engine pool | engine `loadTodaySlate().eligibleLegs` | new `buildEngineLegs` adapter → repoint `/build` |
| `/today`, `/picks`, `/parlays` | engine `loadTodaySlate` → `ParlaysExplorer` | none (unified in #519) | — | keep |
| `/world-cup` | tabbed hub (curated picks + proj + props + cards) | none; **links to `/games/world-cup/<slug>`** already | — | keep |
| game-detail route | **`/games/[sport]/[gameId]` EXISTS** (`getGameDetail`); `urlSport(world_cup)→"world-cup"` so `/games/world-cup/<slug>` already resolves with team projections + player props + suggested cards + market availability | suggested cards use the 2 native WC cards (not engine game-specific) | `lib/game-detail.ts` | verify renders; links already present from `/world-cup` + `/today` + curated-picks |
| eligible-leg loader | engine `eligibleLegs` (ParlayLegDisplay: odds/model/edge/survival/risk/identity/last5) | — | — | source for Build |
| WC player props | `world-cup/player-projections` → game-detail + WC hub + engine eligible legs | visible on hub + game page | — | also surface in Build via engine |
| visual identity | `ParlaysExplorer.LegIdentity`, `legAvatar`, `FlagBadge`, `PlayerAvatar`, `TeamLogo` | — | — | reuse |

**Key finding:** the standalone World Cup game pages **already exist and are linked** — `/games/world-cup/<slug>` (e.g. `canada-vs-qatar-2026-06-18`) resolves via `/games/[sport]/[gameId]` + `getGameDetail`, rendering team projections, player props, suggested cards, and market availability; `/world-cup`, `/today`, and the curated-picks component all deep-link to it. So the genuine remaining gap is the **`/build` data source** (still legacy).

## Game plan
| # | task | files | outcome | risk | now |
|---|---|---|---|---|---|
| 1 | `buildEngineLegs(eligible)` adapter: engine `ParlayLegDisplay` → `BuildLeg` | `lib/build-legs.ts` | Build sources the gated engine pool (WC team + WC player + MLB, current/leakage-safe) | low | ✅ |
| 2 | Repoint `/build` to `loadTodaySlate().eligibleLegs` via the adapter | `app/build/page.tsx` | no stale/legacy; engine legs with visuals + filters + slip builder | low | ✅ |
| 3 | Adapter tests (MLB / WC team / WC player normalization; fallback) | `*.test.mjs` | regression-safe | low | ✅ |
| 4 | Verify WC game pages render (team proj + player props + cards) + links | — | confirm existing route works | low | ✅ |
| 5 | tests / build / QA / PR / deploy | — | shipped | low | ✅ |
| 6 | engine game-specific cards on game pages; full Build UI rebuild (tabs) | — | **deferred** — game pages already render cards; BuildExperience already has sport/market/risk/game/search filters + slip builder |

**Non-negotiables:** no fabrication; Bank Builder Step 2 (Czech ML + Josh Bell; Switzerland ML + Goldschmidt) + protected `public/data/bank-builder/*` untouched; no BB step generated/settled.
