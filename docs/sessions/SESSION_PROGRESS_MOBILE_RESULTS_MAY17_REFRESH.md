# Mobile + Results UX + May 17 refresh — progress log

**Branch:** `feature/mobile-results-may17-refresh`
**Base:** `main` @ `fc427d2`

## Phase 1 data freshness audit

- **NBA `/board?date=2026-05-17`** — 1 game CLE @ DET, **72 leans intact** (42 High / 7 Med / 20 Low / 3 insufficient_data). No phantom MIN/SAS. dataMode Live. No regen needed.
- **MLB May 16** — was 14 Final + 1 Live. Now **15 Final**. Settlement updated to **complete** (was partial).
- **MLB May 17** — 15 games scheduled, all in Preview state with probable pitchers (Eovaldi, Wheeler, Skenes, Gausman, Flaherty, Mikolas, Bello, etc.). Free MLB-StatsAPI schedule available.

## Phase 2 MLB May 16 finalization
Re-ran free settlement. Before/after:

| Metric | Before | After |
|---|---|---|
| finalGames | 14 | 15 |
| finalGamesSettled | 13 | 14 |
| pendingGames | 1 | 0 |
| partial | true | **false** |
| decisive | 250 | 272 |
| W–L–P | 133–117–0 | **144–128–0** |
| hit rate | 53.2% | **52.94%** |
| unavailable | 20 | 22 |

The remaining game's 22 new graded rows landed without overwriting the prior 250 (idempotent by lean.id).

## Phase 3 May 17 plan
- **NBA** — no regen (board still current with valid Game 7 projections).
- **MLB** — schedule-only board for May 17 generated free (15 events, 0 leans, `pendingReason=floor_guard`). Paid odds fetch (45–60 credits) NOT run. UI will show "lines pending" honestly.

## Constraints
- No paid Odds API
- No workflow / package changes
- Free MLB Stats API only for schedule + boxscores
- NBA May 15 Results / historical boards untouched
- File intentionally untracked
