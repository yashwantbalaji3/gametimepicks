# NBA Finals Game 4 (June 10) — Readiness Audit

_Generated 2026-06-09 (late). Honest, fail-closed status. No fake data._

## Verdict
**Projections + Suggested Parlays cannot be generated honestly for June 10.** Real
schedule and real odds are available, but **player recent-form / game-log stats are
unavailable from CI** — the same paid/IP-blocked wall, **confirmed current** by today's
generation run. NBA stays correctly fail-closed (no public picks).

## Checklist
| Item | Status | Evidence |
|---|---|---|
| Game 4 schedule | ✅ real | June 10, 8:30 PM ET — San Antonio Spurs @ New York Knicks (Knicks lead 2–1; SA won Game 3 115–111 on June 8) |
| Game odds (h2h/spread/total) | ✅ available | `ODDS_API_KEY` present; run logs: `has_odds_key=True`, "NBA events: 1 × 3 = 3 credits" |
| Player props odds | ⚠️ provider-dependent | fetched via Odds API when markets exist; not the blocker |
| Player recent-form / game logs | ❌ **unavailable** | see "Blocker" below |
| Projections generated | ❌ no | fail-closed (no real player stats) |
| Suggested Parlays generated | ❌ no | fail-closed (no projections) |
| Fake data used | ❌ never | — |

## Blocker (live evidence — run 27219900939, 2026-06-09 16:17 UTC)
```
pipeline.fetch_nba_data WARNING [roster SA] nba_api failed after 25.0s:
    stats.nba.com ... Read timed out
pipeline.fetch_nba_data WARNING [roster SA] espn_scoreboard failed:
    espn.fetch_team_roster — not supported by this provider
(same for NY)
wrote players.json (84 bytes)        # essentially empty → no players → no projections
ENABLE_BALLDONTLIE_FALLBACK: false
```
- **nba_api (stats.nba.com)** is IP-blocked / times out from GitHub Actions runners.
- **ESPN** provides scoreboard/schedule but **not team rosters or player game logs**.
- **BallDontLie** free-tier key (`BALLDONTLIE_API_KEY`) exists but **`/stats` + season
  averages require a paid tier** (prior probes: HTTP 401); the fallback is intentionally
  **disabled** because the free tier can't supply recent-form. So enabling it does not help.
- Net: rosters/recent-form can't be resolved → `players.json` is empty → projections
  and parlays are skipped (fail-soft completes, commits no NBA picks).

## What would unblock it (requires user decision — not done tonight)
1. **BallDontLie GOAT/ALL-STAR (paid)** — wire as primary stats provider; flip
   `ENABLE_BALLDONTLIE_FALLBACK=true` + `NBA_DATA_PROVIDER=balldontlie`. *Paid, needs approval.*
2. **SportsDataIO NBA (paid)** — player game logs via a CI-reachable API. *Paid, needs approval.*
3. **A CI-reachable nba_api egress** (residential/proxy) — infra change to avoid the
   stats.nba.com block. *Infra, not a code fix.*
No paid provider was activated and no fake stats were created.

## Why not publish "odds/schedule only"
The NBA board already fetches odds and fails closed on picks (current, correct
behavior). Force-publishing an odds-only NBA "slate" for June 10 would require a live
`morning-projections` dispatch; the scheduled cron already ran today, so a manual
dispatch risks double-generation. No change is needed for honesty — NBA already shows
the real game with no fabricated picks.

## Rollback
None needed (no code/data changed). If a paid stats provider is later approved, wire it,
flip the provider flags, and re-run `morning-projections` for `target_date=2026-06-10`.
