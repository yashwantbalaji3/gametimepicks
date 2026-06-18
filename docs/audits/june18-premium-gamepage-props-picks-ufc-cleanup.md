# June 18 — Premium game pages · soccer model picks · UFC stale cleanup · Picks risk coverage

_Branch `june18-premium-gamepage-props-picks-ufc-cleanup` off main `ea7e221d` (#525). Audit at 17:01 ET (21:01 UTC)._

## Current-state review
| surface | current source | current issue | desired behavior | files/modules |
|---|---|---|---|---|
| `/games/world-cup/[slug]` | `game-detail-page.tsx` ← `game-detail.ts` | Overview-first; everything in 5 tabs; flat | Premium card: hero + **model spotlight** before tabs; suggested parlays prominent | `components/game/game-detail-page.tsx`, `lib/game-detail.ts` |
| player props tab | `PlayerPropsExplorer` ← fixture-filtered `playerProps` | Default "Top picks" ranks by `edgePct` = **0 for all WC props** → meaningless order; reads like raw inventory | Default = **model-ranked picks** (by market-implied likelihood when edge=0); full board secondary | `components/ui/player-props-explorer.tsx`, new `lib/world-cup/player-model-picks.ts` |
| team projections tab | `ProjectionCard` grid | readable but plain | keep; surface top pick in spotlight | `components/ui/projection-card.tsx` |
| suggested parlays tab | `getGameSpecificCardsForGame()` by risk | buried as tab 4 | move up / spotlight; honest scoped empties | `lib/world-cup/game-specific-cards.ts` |
| `/world-cup` | hub | ok | unchanged | `app/world-cup/page.tsx` |
| `/picks` | `ParlaysExplorer` ← `loadTodaySlate()` | per-risk empties exist but **no at-a-glance sport×risk coverage**; default sport=WC | add **counts-by-sport×risk** matrix; keep scoped empties; ensure Mixed+WC visible | `components/parlays/parlays-explorer.tsx` |
| `/parlays` | redirect → same explorer | same as picks | same | same |
| `/today` | `today/page.tsx` | UFC already gated off active (`ufcSettled` → "Off today") | keep; confirm not active | `app/today/page.tsx` |
| `/games` | `games/page.tsx` | UFC row already hidden when `ufcDone` | keep | `app/games/page.tsx` |
| `/ufc` | `ufc/page.tsx` | **shows stale fight card / projections as active** even though event settled | when stale/settled → **"Next slate loading soon · previous event settled"** + Results CTA; hide stale active tabs | `app/ufc/page.tsx` |
| `/build` | `build-experience.tsx` | ok (UFC filter shows 0 legs when settled) | unchanged | `components/build-experience.tsx` |
| active sports loader | `ufcSettled` = `results-settled-latest.json status==="final"` | correct | reuse same signal on `/ufc` | `app/today/page.tsx` |
| UFC loader | `ufc/page.tsx` loadJSONUfc | no staleness gate on the page itself | add stale gate | `app/ufc/page.tsx` |
| soccer player-prop data | `world-cup/player-projections/2026-06-18.json` | **only 2 markets**: anytime goalscorer (48) + shots on target (48); edge 0, market-implied | model-rank; market tabs data-driven; honest note; pipeline extensible | data + `pipeline/world_cup/build_player_props.py` |
| risk grouping | `loadTodaySlate` → `suggestedBySportRisk`, `mixedByRisk` | works; empties scoped per risk | add coverage matrix | `lib/parlays/ui-loader.ts` (read-only), `parlays-explorer.tsx` |

## Execution plan
| priority | task | files/modules | public outcome | risk | execute now? |
|---|---|---|---|---|---|
| 1 | New `worldCupPlayerModelPicks` selector (rank by edge→market-implied likelihood→confidence; dedupe sides; limited-data flag) | `lib/world-cup/player-model-picks.ts` (+test) | model picks, not inventory | low | yes |
| 2 | Game page: **model spotlight** (top team pick, top player model pick, best lower-variance card, best higher-return card) above tabs; reorder so suggested parlays + model picks lead | `game-detail-page.tsx` | premium, model-driven | low | yes |
| 3 | Player-props tab: default **Top model picks** with limited-data note; full inventory secondary; market tabs data-driven | `player-props-explorer.tsx` | model-first, honest | low | yes |
| 4 | Honest market note + pipeline extensibility (add `player_assists`,`player_shots` to request list — auto-appear only if the feed returns them; no fabrication) | `game-detail-page.tsx`, `pipeline/world_cup/build_player_props.py` | clear, future-proof | low | yes |
| 5 | UFC `/ufc` stale state | `ufc/page.tsx` | no stale active card; "next slate loading soon" + Results | low | yes |
| 6 | Picks **counts-by-sport×risk** matrix + scoped empties + ensure Mixed/WC visible | `parlays-explorer.tsx` | clear risk coverage | low | yes |

## Phase 1 — Game-page diagnosis (answers)
- **Component:** `GameDetailPage` (`components/game/game-detail-page.tsx`); route `app/games/[sport]/[gameId]/page.tsx`.
- **Default view:** "Overview" tab (top team projection + caveats). Suggested parlays are tab 4 (buried).
- **Tabs SSR/static:** all tabs server-render into the DOM; `SportShell` toggles visibility client-side. Pages are statically generated per slug.
- **Player props source:** `world-cup/player-projections/latest.json` → `loadWorldCupPlayerProjections()` → `normalizeWcPlayerProps()` → fixture-filtered in `game-detail.ts` (matchId or team-name join).
- **Markets in current data:** ONLY `player_goal_scorer_anytime` + `player_shots_on_target`. **Assists/cards/fouls/tackles/saves/passes are NOT in the data** (pipeline requests only the two; The Odds API exposes `player_assists`/`player_shots` but the pipeline never requested them).
- **Why "NOT POSTED"-style labels:** lineups not posted pre-kickoff → `lineupStatus: "not_posted"`; props stay projection-based, `parlayEligible:false`, `dataQuality:"limited"`. Real odds exist; the label is about lineup confirmation, not missing odds.
- **Model-recommended vs raw inventory:** every WC prop has `edgePct:0` (market-implied only, no independent model). The default "Top picks" sorts by edge → no real order. Model-rank by market-implied likelihood (de-vigged price) + confidence instead.
- **Suggested parlays join:** `getGameSpecificCardsForGame({matchId, homeTeam, awayTeam})` filters engine cards whose legs belong to the fixture (matchId or normalized team-name).
- **Why it feels flat:** the strongest signals (top pick, best card) are buried inside tabs; no spotlight; player props read as a 96-row inventory rather than a short ranked pick list.

## Guards
- No fabrication of odds/props/markets/photos/stats/results. No banned public copy. Protected `public/data/bank-builder/*` untouched. Active Bank Builder legs untouched.
