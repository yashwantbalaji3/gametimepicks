# NBA stats provider — upgrade plan (no billing action taken)

## Current blocker
NBA projections/parlays cannot publish because no provider returns NBA player
**game logs** from CI:
- **nba_api** (stats.nba.com): IP-blocked from GitHub Actions runners.
- **BallDontLie**: player-ID resolver works (free `/players?search=`), but the
  game-log endpoint **`/nba/v1/stats` is paid-tier (ALL-STAR/GOAT)** — the
  configured free-tier key returns `401 Unauthorized`.
- **SportsDataIO**: supported in code, but `SPORTSDATA_API_KEY` is not configured.
- **ESPN**: no player-game-log endpoint.

## Already fixed (code-complete, waiting on data access)
- BallDontLie provider **enabled flag** wired into CI (`ENABLE_BALLDONTLIE_FALLBACK`,
  overridable, default off — #318/#320).
- **Free-tier player-ID resolver** (`/players?search=` + offline nba_api static
  list, exact normalized match, cached — #319). Resolution is proven working in CI
  (nba_api ids → BallDontLie ids).
- `BALLDONTLIE_API_KEY` passed to the workflow (#317).

## Fastest unlock (a billing decision — NOT taken here)
Upgrade the BallDontLie key to a tier that includes `/stats` (ALL-STAR or GOAT).
No code change is required after the upgrade.

### Exact steps after the key is upgraded
```bash
gh variable set ENABLE_BALLDONTLIE_FALLBACK --body true
gh variable set NBA_DATA_PROVIDER --body balldontlie
gh workflow run morning-projections.yml -f projections_date=<date> -f dry_run=false -f skip_mlb=true
```
### Validation
- NBA board gets real `modelProjection` + `recent10Count>=5`.
- NBA legPool > 0; NBA Suggested Parlays publish through the normal gates
  (PTS/REB; AST only if elite L10/L5>=80%; Low/Bank only with strong fresh form).
- The learned-policy overlay + restricted gates still apply; NBA never publishes
  on odds-only data.

## Fail-closed guarantee
Until a stats provider returns game logs, NBA stays absent from projections +
parlays. No odds-only "projections", no fabricated form. The learned selection
policy cannot enable NBA (NBA markets are absent from the MLB artifact, and the
`nbaRequiresRealStatsProvider` hard guard is recorded).
