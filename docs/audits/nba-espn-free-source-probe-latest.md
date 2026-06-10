# NBA ESPN Free-Source Probe — Game 4 Recovery

_2026-06-10. Live `curl` probes of ESPN's public JSON API. Real results._

## Verdict: ✅ ESPN provides enough for recent-form projections (free, CI-safe)
ESPN's public JSON (`site.api.espn.com` + `site.web.api.espn.com`) returns **rosters and
per-game player logs including the current playoffs** — exactly the recent-form data
`stats.nba.com` was blocking. It is reachable without auth and works from any IP (unlike
`stats.nba.com`, which IP-blocks GitHub Actions).

## Endpoints probed (all 200 OK)
| Endpoint | Returns | Usable |
|---|---|---|
| `/nba/scoreboard?dates=20260610` | Game 4: NY (18) vs SA (24), 8:30 PM ET, scheduled | schedule ✅ |
| `/nba/teams` | all 30 team id↔abbr (NY=18, SA=24, GS=9 …) | id map ✅ |
| `/nba/teams/{id}/roster` | 18 athletes/team w/ id, name, position, status | rosters ✅ |
| `/common/v3/.../athletes/{id}/gamelog` | per-game logs, **Postseason + Regular**, labels MIN/REB/AST/PTS… | **game logs ✅** |

## Real recovered data (sanity check — Jalen Brunson, ESPN id 3934672)
Last 6 games parsed newest-first:
```
2026-06-09 vs SA  PTS 32  REB 5  AST 5   (Finals Game 3)
2026-06-06 @  SA  PTS 20  REB 5  AST 6   (Finals Game 2)
2026-06-04 @  SA  PTS 30  REB 3  AST 2   (Finals Game 1)
2026-05-26 @  CLE PTS 15  REB 2  AST 5
2026-05-24 @  CLE PTS 30  REB 3  AST 6
2026-05-22 vs CLE PTS 19  REB 3  AST 14
```
recent PTS 26.5 · REB 3.6 · AST 6.5 — real, sensible, pre-game (no Game 4 data).

## Classification
- schedule: ✅  · roster: ✅  · box scores: (not implemented; not needed) · **player game logs: ✅**
- **Enough for projections: YES** — Tier A recent-form (PTS/REB/AST) via game logs.

## Why this works where the old path failed
The prior CI failure was `espn.fetch_team_roster — not supported by this provider`: the
`EspnProvider` simply **never implemented** roster/gamelog (only `fetch_schedule`). ESPN
itself was always reachable. This PR implements those two methods (stdlib-safe via
`requests`, which reaches ESPN fine in CI).
