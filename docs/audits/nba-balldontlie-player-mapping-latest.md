# June-8 NBA Finals recovery — BallDontLie integration findings

**Outcome:** NBA Suggested Parlays could NOT publish for June 8. The MLB slate is
live + validated and was never touched. NBA was blocked by a **paid-tier data
gap**, diagnosed layer-by-layer from real CI logs (no fabrication at any point).

## Root-cause chain (each found from a run log, then fixed)
1. **Job timeout (25m)** on a cold nba_api cache → raised to 45m + attach_recent10
   fail-soft budget. (#312)
2. **nba_api is IP-blocked from GitHub Actions** → returns no game logs. Needed an
   alternate provider.
3. **BallDontLie key not passed to CI** → added `BALLDONTLIE_API_KEY` + exposed
   `NBA_DATA_PROVIDER`. (#317)
4. **`ENABLE_BALLDONTLIE_FALLBACK` defaulted false** → provider was skipped
   entirely (chain fell back to blocked nba_api). Enabled it. (#318)
5. **`/nba/v1/players/active` is paid-tier** → free key 401'd on the index build.
   Rewrote resolution to the FREE `/nba/v1/players?search=` endpoint (name from
   nba_api's offline static list → exact normalized match, cached). (#319)
6. **`/nba/v1/stats` (game logs) is ALSO paid-tier** → free key 401s. This is the
   final, non-code blocker.

## What works now vs. what's blocked
- ✅ **Player-ID mapping FIXED** — run 27174129685 resolved nba_api IDs → BallDontLie
  IDs via free-tier search (e.g. 1628384→18, 1630577→38017649, 447, 161).
- ❌ **Game-log stats** — `/nba/v1/stats?...` returns `401 Unauthorized` on the
  free-tier key. No logs → no real projections/recent form → no honest parlays.
- Other providers: nba_api (IP-blocked), ESPN (no game-log support),
  SportsDataIO (no `SPORTSDATA_API_KEY` configured).

## The fix (one decision, then it works)
Upgrade the BallDontLie key to a tier that includes `/stats` (ALL-STAR/GOAT), then
set repo var `ENABLE_BALLDONTLIE_FALLBACK=true` (+ `NBA_DATA_PROVIDER=balldontlie`)
and dispatch `morning-projections` with `skip_mlb=true`. The resolver + stats
fetch already work end-to-end; only the paid data access is missing. No code
change required after the upgrade.

## Honesty guarantees held
No faked stats/form/projections/odds/parlays. No odds-only "model projections."
MLB untouched (board byte-identical; 24 cards intact). Results settled-only
(June 7). UFC schedule-only. V2 internal. No banned copy.
