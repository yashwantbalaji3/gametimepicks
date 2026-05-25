# Data source roadmap

Goal: improve projection quality with free, reliable public data
sources. Anything paid or scraping-heavy belongs in a separate
later phase.

Status legend:
- ✅ already used
- 🟡 partly used / scaffold exists
- 🔴 not used yet
- ⚪ deliberately not used (cost or instability)

## Already integrated

| Source | What it adds | Notes |
|---|---|---|
| The Odds API | Bookmaker lines + player props | Paid (api credits). NBA + MLB only today. Cap at 2 events/run, dry-run by default. 116 credits remaining at this PR's open. |
| nba_api (NBA Stats) | Player game logs, rosters, schedule | Free, reliable. Cached aggressively. Occasional read-timeouts handled with retries. |
| ESPN scoreboard | NBA schedule fallback | Free public endpoint. |
| MLB Stats API | MLB schedule, probable pitchers, season + recent stats | Free, well-documented, stable. |

## Recommended next integrations (free)

### 1. MLB confirmed lineups · 🔴 not yet · **highest impact**

Source: MLB Stats API `schedule?gamePk=...&hydrate=lineups`
released ~3 hours before first pitch.

What it adds:
- Eliminates props for players who are not in the lineup.
- Confirms platoon decisions (L/R vs. starting pitcher).

Difficulty: low. Single REST call per game, parse `lineups.away.0..8`
and `lineups.home.0..8`.

Expected value: huge — current pipeline silently leaves projections
on benched players, which is the single biggest source of dead
slips for MLB batter_hits.

Priority: **P0**

### 2. MLB park factors · 🔴 not yet

Source: Baseball Savant or any open dataset of historical park
factors (we can ship a static JSON per park, refreshed annually).

What it adds:
- Multiplier on total bases / hits projections per ballpark.
- Coors Field ≠ Petco Park.

Difficulty: trivial — static JSON checked into the repo.

Expected value: medium for total_bases, small for hits.

Priority: **P1**

### 3. NBA injury / inactives report · 🔴 not yet

Source: ESPN injury endpoint (`site.api.espn.com/.../athletes/.../injuries`)
or NBA.com player gamelog "did not play" flags (already available
through nba_api, just not wired up).

What it adds:
- Auto-suppress players ruled out for tonight.
- Downgrade questionable players to lower confidence tiers.

Difficulty: medium. The data is available; the integration needs
a careful "as of when" timestamp so we don't act on stale flags.

Expected value: high. Same logic as MLB lineups — projections on
inactive players are 0% hit rate.

Priority: **P0**

### 4. MLB weather · 🟡 partially considered

Source: NOAA public forecast API (free, no key) for the ballpark
coordinates. Or open-meteo.

What it adds:
- Wind direction + speed affects total_bases (with > out > against).
- Temperature affects ball flight to a smaller degree.
- Indoor stadiums are weather-immune (already known from park
  metadata).

Difficulty: medium. Need to map MLB venueId → coordinates and
join with the forecast.

Expected value: medium for total_bases, small for hits.

Priority: **P2** (after lineups + park factors).

### 5. NBA pace + opponent defensive rating · 🔴 not yet

Source: nba_api `team_estimated_metrics` endpoint or basketball
reference (caveats: scraping ToS).

What it adds:
- Pace adjusts every player projection.
- Opponent defensive rating per position adjusts projection per
  player type.

Difficulty: medium-high. nba_api has the data but it's per-season
average; we'd want rolling.

Expected value: medium. Audit suggests REB is doing well already;
this would help PTS more.

Priority: **P2**.

### 6. MLB bullpen fatigue · 🔴 not yet

Source: MLB Stats API team transactions + recent pitcher game logs.

What it adds:
- Days-since-usage × pitch count for relief pitchers; flag
  overworked bullpens that may extend a starter (affecting their
  strikeout / hit projection).

Difficulty: medium. Pitcher-by-pitcher join.

Expected value: small but consistent. Strikeout market is our
worst cohort (43.6% audit) — anything to improve it is worth
trying.

Priority: **P3**.

## Deliberately not pursued

| Source | Reason |
|---|---|
| Twitter / X for breaking news | Unstable, API access paid, easy to fake. |
| Live betting feeds | Paid; out of scope. |
| FanGraphs / Baseball Savant pulls | ToS / rate limits make this fragile. Static parquet pulls per season are fine if licensed. |
| Public scraping of bookmaker movement | Brittle, ethically grey. Stick to the Odds API. |

## Implementation order (suggested)

1. **MLB lineups** — biggest immediate win, low risk.
2. **NBA injury report** — same magnitude, slightly trickier
   "as of when".
3. **MLB park factors** — static JSON, ship as a default-on
   feature flag so we can A/B it via the optimizer's `marketWeight`.
4. **MLB weather** — only after #3 lands so we know the join
   shape per venue.
5. **NBA pace + opponent rating** — major model work; do not
   touch until the audit shows the simpler fixes are in place.
6. **MLB bullpen fatigue** — most expensive integration, smallest
   audit impact. Defer.
