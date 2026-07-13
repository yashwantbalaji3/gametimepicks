# Product Structure Audit — why it feels tangled (2026-07-13)

Blunt read of the primary routes, mapped to the intended three pillars (Simulations · Flagship Picks ·
Results/Trust). Confusion score 1 (clear) → 5 (tangled). Money untouched (md5 `affe6b21`).

## The core problem in one sentence
There is no explicit **pillar layer** — Simulations, Flagship Picks, and Results are all present but interleaved
across ~10 overlapping top-level routes, so the same job (see a game read, build a card, check results) has 2-3
front doors and no obvious "start here."

## Route → pillar map + confusion
| route | current job | belongs to | overlaps with | confusion | action |
|---|---|---|---|---|---|
| `/` | flagship landing (sim-first hero + 4 product cards + slate + trust) | **entry** | — | 2 | keep; sharpen to 3 pillars |
| `/simulate` | simulation lobby (all sports) | **Simulations (hub)** | `/games` (identical), `/today` | 3 | make it the true hub (+ coverage matrix — done) |
| `/games` | = `/simulate` (now redirects) | Simulations | `/simulate` | 1 | ✅ redirect fixed |
| `/today` | daily board (slate + products + no-play) | **entry/Today** | `/`, `/picks`, `/simulate` | 4 | scope to "today's slate status", not a 2nd home |
| `/picks` | suggested-card lobby (Parlay Lab) | **Flagship Picks (hub)** | `/build`, `/projections`, `/bank-builder` | 4 | make it the Flagship Products hub (BB + Moonshot + advanced) |
| `/build` | custom card builder | Flagship (secondary) | `/picks` | 3 | label "Advanced Builder", demote from primary |
| `/bank-builder` | BB ladder product | **Flagship Picks** | `/picks`, `/mr-dub` | 2 | keep; link from /picks hub |
| `/moonshot` | longshot product | **Flagship Picks** | `/picks` | 2 | keep; link from /picks hub |
| `/mlb` | MLB hub (tabs) | **Sport Center** | `/mlb/board`, `/mlb/power`, `/simulate`, `/projections` | 4 | reframe as "MLB Simulation Center" |
| `/mlb/board` `/mlb/power` | MLB sub-boards | Sport Center | `/mlb` | 3 | keep as tabs of the MLB center |
| `/world-cup` | WC command center | **Sport Center** | `/simulate`, `/games/world-cup/*` | 3 | reframe as "World Cup Simulation Center" |
| `/ufc` | UFC hub (experimental) | **Sport Center** | `/simulate`, `/sports` | 3 | reframe "UFC Simulation Center (experimental)" |
| `/sports` | sport directory | **Sport Center index** | individual sport pages; orphaned (0 links) | 4 | link it as the Sport Centers index OR fold into /simulate hub |
| `/projections` | NBA+MLB straight-bets grid | Simulations? | `/mlb`, `/simulate` | 5 | **most tangled** — NBA-centric, off-season, unlinked; fold into sport centers or retire |
| `/results` | parlay-first track record | **Results/Trust** | `/mr-dub`, `/mlb/results`, legacy `results/` | 4 | make the single Results Center (money + paper + model + pending) |
| `/mr-dub` | official money/bankroll | **Results/Trust** | `/results`, `/bank-builder` | 3 | keep as the money/trust page; cross-link |
| `/methodology` | how it works | **Results/Trust** | `/learn`, `/market-guide` | 2 | keep; add the coverage matrix here too |
| `/parlays` `/parlay-lab` `/nba/parlays` | → `/picks` | alias | — | 1 | ✅ redirects fixed |

## The tangles (ranked)
1. **Three "front doors" for the daily read:** `/` vs `/today` vs `/simulate` — all show slate/products. (score 4)
2. **Two "pick" hubs:** `/picks` vs `/projections` vs `/build`, plus `/bank-builder` + `/moonshot` floating. (4-5)
3. **Sport pages aren't clearly "simulation centers":** `/mlb`, `/world-cup`, `/ufc` read as generic hubs, not
   the deep per-sport sim experience the founder wants. (4)
4. **`/projections` is the worst offender** — NBA-first, off-season, unlinked, frozen-clock "today" nit. (5)
5. **`/sports` is a good directory that nothing links to** (orphaned). (4)
6. **Results is split** across `/results` (canonical), `/mr-dub`, `/mlb/results`, and a vestigial legacy tracker. (4)

## What's already clean (don't touch)
Alias redirects fixed; internal routes 404; UFC `-internal-` off public; liveness banners honest; money locked.
Off-season/retired routes (NBA/NHL/IPL/homer-nukes/trends) are honestly labelled GRAY.

**Bottom line:** the product is *not* fundamentally broken — it's **under-organized**. The fix is a thin **pillar
layer** (Simulations / Flagship Picks / Results-Trust) over the existing routes, not a rebuild. See
`PRODUCT_ARCHITECTURE_TARGET_STATE.md`.
