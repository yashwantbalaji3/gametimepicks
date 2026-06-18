# June 18 — Unify parlay surfaces on the engine + WC player projections + visuals

_Branch `june18-full-parlay-player-projection-ui-fix` off main `24b89558` (#518). Review at 13:08 ET._

## Current-state review
| surface | current data source | visible problem | stale problem | visuals problem | planned fix |
|---|---|---|---|---|---|
| `/parlays` | **engine** `loadTodaySlate` → `ParlaysExplorer` (WC 20 + Mixed 20 + by-risk + same-game) | none (canonical) | none | has flags/logos/portraits | keep; add per-leg drawers |
| `/today` suggested cards | **legacy** `normalize` (`loadWorldCupSuggestedParlays` 2 WC + `loadDailyMixedCards` + optimizer slips) → `TodaysParlays` | only ~2 WC cards, not the engine's 20; no Mixed-by-risk | optimizer slips can be stale | `SuggestedCard` has portraits but card set is thin | render the engine `ParlaysExplorer` |
| `/picks` | **legacy** `getSuggestedParlaysForDate` + `loadWorldCupParlays` → `PicksExperience` | "no World Cup cards" (native 0–2 only); split from engine | legacy slips | mixed | render the engine `ParlaysExplorer` |
| `/parlay-lab` | redirect → `/picks` | inherits `/picks` problem | — | — | fixed once `/picks` is engine-backed |
| `/build` | `buildWcLegs(loadWorldCupProjections/PlayerProjections)` + optimizer legs | already shows WC team+player legs | check no stale | has visuals | verify current; no rebuild |
| `/world-cup` | tabbed hub: curated picks + team proj + player props + cards | per-game content exists but behind tabs | gated correctly | flags/portraits present | keep (per-game lives here) |
| UFC on `/today` | `ufc/*-latest.json` (event 2026-06-15, **status=final**) | a **settled-UFC summary block** still renders on Today | YES — settled 3 days ago | — | remove settled-UFC block + active chip from Today (→ `/results`) |
| visual identity | `ParlaysExplorer.LegIdentity` (portrait/flag/logo/fallback); BB `legAvatar` | inconsistent across legacy surfaces | — | legacy `SuggestedCard` differs | unify by routing Today/Picks through `ParlaysExplorer` |
| WC player props | `world-cup/player-projections|player-markets` → curated-picks + WC hub | visible on hub; engine surfaces them as eligible legs (WORLD_CUP player markets) | — | portraits/flags via identity maps | surfaced through the engine explorer's WC tab + legs view + hub |

**Root cause of the split:** two parallel card systems — the legacy `normalize`/`data-parlays` layer (Today, Picks, Build) vs the methodology **engine** (`loadTodaySlate`, `/parlays`). The engine has the rich WC (20) + Mixed (20) + by-risk + same-game cards; the legacy layer has only the 2 native WC cards. UFC settled 06-15 still renders a summary on Today.

## Game plan
| # | task | files | outcome | risk | now |
|---|---|---|---|---|---|
| 1 | Route `/picks` through the engine `ParlaysExplorer` | `app/picks/page.tsx` | Picks shows WC 20 + Mixed 20 + by-risk + visuals | low | ✅ |
| 2 | Route `/today` suggested cards through `ParlaysExplorer` | `app/today/page.tsx` | Today shows engine WC + Mixed cards w/ visuals | low | ✅ |
| 3 | Remove settled-UFC block + active chip from Today | `app/today/page.tsx` | no stale UFC on Today; UFC lives in `/results` | low | ✅ |
| 4 | Add expandable per-leg drawers to `ParlaysExplorer` LegRow | `parlays-explorer.tsx` | every card leg expands → model/implied/edge/factors/settlement (+ last-5 if present) | med | ✅ |
| 5 | Tests (canonical engine cards on Today/Picks; UFC excluded; drawers; visuals) | `*.test.mjs` | regression-safe | low | ✅ |
| 6 | Build/QA/PR/deploy | — | shipped | low | ✅ |
| 7 | Standalone `/games/world-cup/[slug]` route | — | per-game deep link | high | **deferred** (per-game content already on the tabbed `/world-cup` hub) |

**Non-negotiables honored:** no fabrication; Bank Builder Step 2 (Czech ML + Josh Bell; Switzerland ML + Goldschmidt) preserved; protected `public/data/bank-builder/*` untouched; no new BB step generated/settled.
