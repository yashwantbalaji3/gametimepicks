# Session progress — next-week schedules + model learning

> Generated 2026-05-17. Untracked. Do not commit.

## Part 1 — PR #47 merge

- Squash SHA: `9bac786` ("feat(model): cross-sport projection audit and guardrail improvements (#47)")
- Production live: `/`, `/results/`, `/nba/results/`, `/mlb/results/` all 200, lessons card present ("R5 anomaly", "20pp", "Model lessons" copy verified on the live page).
- Vercel deploy: https://vercel.com/yashwantbalaji33-7164s-projects/gametime-picks/EdqWmAy5XxRzSguBMCZcVC7mnJE1
- Rollback: `git revert 9bac786`

## Phase 0 — branch

- Branch: `feature/next-week-schedules-model-learning` from `main` at `9bac786`.
- Window: **2026-05-17 through 2026-05-24** inclusive (8 dates).
- No paid API in this PR.

## Phase 2 — next-week schedules refreshed from free public APIs

Wrote real schedule JSON for every date in the window. No fabrication.

### MLB · MLB Stats API (free)

| Date | Games |
|---|---|
| 2026-05-17 | 15 (already had a board shell from this morning; refreshed with live game statuses) |
| 2026-05-18 | 14 |
| 2026-05-19 | 15 |
| 2026-05-20 | 15 |
| 2026-05-21 | 7 |
| 2026-05-22 | 15 |
| 2026-05-23 | 15 |
| 2026-05-24 | 15 |

For each MLB date, wrote both `app/public/data/mlb/schedule/<date>.json` AND a schedule-only `app/public/data/mlb/boards/<date>.json` (leans=[], propsAvailable=false, pendingReason="odds_not_fetched"). The board shell is the format the existing `/mlb/board` reader already expects, so all 8 dates now resolve cleanly.

The existing May 16 board (live MLB leans) was deliberately preserved — the script's `has_live_leans` check skips overwriting any board file where `leans.length > 0`.

### NHL · api-web.nhle.com (free)

| Date | Games |
|---|---|
| 2026-05-17 | 0 (off-day) |
| 2026-05-18 | 1 (MTL @ BUF — playoff) |
| 2026-05-19 | 0 (off-day) |
| 2026-05-20 | 1 (VGK @ COL) |
| 2026-05-21 | 1 (TBD @ CAR) |
| 2026-05-22 | 1 |
| 2026-05-23 | 1 |
| 2026-05-24 | 1 |

All written to `app/public/data/nhl/schedule/<date>.json`.

### IPL · ESPN cricket league 8048 (free)

| Date | Matches |
|---|---|
| 2026-05-17 | 2 |
| 2026-05-18 | 1 (CSK v SRH) |
| 2026-05-19 | 1 |
| 2026-05-20 | 1 |
| 2026-05-21 | 1 |
| 2026-05-22 | 1 |
| 2026-05-23 | 1 |
| 2026-05-24 | 2 |

All written to `app/public/data/ipl/schedule/<date>.json`.

### NBA

Left untouched. Existing May 17 board (CLE @ DET Game 7, 72 leans) preserved. NBA Finals/Conference Finals schedule beyond May 17 is sparse and the existing `/board` page handles "no games today" gracefully via the active-slate selector.

## Phase 3 — paid odds + credit audit (no calls)

- Existing sport keys plumbed in pipeline:
  - `basketball_nba` — `pipeline/providers/odds_api_provider.py`
  - `baseball_mlb` — `pipeline/mlb/mlb_odds.py`
  - No NHL or cricket plumbing.
- The Odds API supports `icehockey_nhl` (player_shots_on_goal, player_points, player_goalie_saves) and `cricket_ipl` (markets vary by US bookmaker coverage; player props uncertain). Estimates below assume `regions=us`.

### MLB next-week paid estimate

- 14–15 events/day × 3 markets (pitcher_strikeouts, batter_hits, batter_total_bases) × 1 region = ~45 credits/day pre-cache. Existing 24-hour cache reduces day-after re-runs to near zero.
- **Recommendation:** approve one paid run for tomorrow (2026-05-18) at the same cap as PR #44: per-run cap 75, post-run credit floor 350. Estimated 40-50 credits.

### NBA next-week paid estimate

- Conference Finals are 1-2 events/day. Markets PTS/REB/AST × 1 region = ~6 credits per event = 6-12 credits/day.
- Conservative. Approvable without floor pressure once the operator decides Game 7 follow-up coverage.

### NHL next-week paid estimate

- Conference Finals: 1 event/day on most days (see schedule above). Markets `player_shots_on_goal` + `player_goalie_saves` × 1 region = ~2 credits/event = **~2 credits/day** for first paid run.
- Sustainable on current quota.

### IPL paid feasibility

- The Odds API does list `cricket_ipl` but **US bookmaker coverage of player props (`batter_runs`, `bowler_wickets`) is uncertain.** A safe-mode test would be a free `/sports` endpoint poll to confirm market keys before any paid event call. NOT run in this session — needs explicit approval.

### Current credit balance

- Estimated remaining (per the most recent paid-spend log in the May handoffs): **~368 credits**. No paid call has been made in this PR or the prior PR.
- Floor: 350 credits remaining minimum (operator-defined).
- Per-run cap: 75 credits.

### Approval prompts for future paid runs

Standing format:
```
Sport: <NBA|MLB|NHL>
Date:  YYYY-MM-DD
Markets: <list>
Events: <count>  (estimated)
Regions: us
Pre-run credit estimate: <events × markets × regions>
Pre-run remaining credits: <current>
Post-run remaining (worst case): <current - estimate>
Floor:  350
Cap:    75
```

Each paid run prints both pre- and post- credit balances.

## Phase 4 — UI: pending / coming-soon states

New shared component: `app/src/components/upcoming-slate-strip.tsx` — compact "next-7-days" tile grid. Each tile shows:

- Day label (e.g. `Sun · May 17`).
- Game count (or `—` when zero).
- Teaser (single matchup if one game, count + first matchup if multiple, "No games scheduled" / "No matches scheduled" if zero).
- Status pill: `projections live` (green), `lines pending` (gold), `off-day` (faint).

Mounted on:

- `/mlb` overview — pulls dates from `getMlbAvailableScheduleDates()`. Links to `/mlb/board?date=<date>`.
- `/nhl` overview — pulls dates from `getAvailableNhlScheduleDates()`. Links to `/nhl/board?date=<date>`.
- `/ipl` overview — pulls dates from `getAvailableIplScheduleDates()`. Links to `/ipl/board?date=<date>`.

NBA is unchanged (the existing `/board` already has the slate-tabs strip + active-slate selector).

Future `?date=<date>` parsing in the board pages is left for a follow-up PR — currently each board lands on the active date and the strip provides discoverability.

## Phase 5 — model learning from settled results

The full audit from PR #47's progress log still holds. No new code changes in this PR — single-slate data does not justify further math tweaks. The learning notes are:

- **NBA May 15 (n=145 decisive, 55.2%):** R5 anomaly leans hit 50.0% (clean leans 56.5%). R5 cap is doing its job.
- **MLB May 16 (n=272 decisive, 52.9%):** 20-25pp edge bucket hit 22.2% on n=9 — MLB R5 cap tightened to 20pp in PR #47.
- **Markets needing more sample:** pitcher_strikeouts (n=23), MLB total_bases Medium (n=14). Both flagged for future tuning when more slates settle.
- **Edge buckets to watch (NBA):** 5-10pp underperformed (35.3% on n=34). NOT encoded yet — single slate is not enough.

The "Model lessons" card on `/results`, `/nba/results`, `/mlb/results` already surfaces these as honest user-facing copy.

## Phase 6 — dependency-model roadmap (no UI yet)

Documented for the next PR; not in this one to keep scope tight.

### Currently available data

- NBA leans: `recent10` (per-market list), `riskFlags`, `_guardrail`, `_originalConfidence`, `contextTag` (new in PR #47), `confidence`, `edgePct`, `homeAway`, `team`, `opponent`.
- MLB leans: `recentSeries`, `samples`, `confidence`, `edgePct`, `playerRole`, `playerTeamAbbr`, `opponentAbbr`, `contextTag` (new in PR #47).

### Not yet ingested (NBA)

- Usage rate · touches · time of possession.
- On/off splits.
- Lineup combinations.
- Player tracking distance/speed.
- Injury feed (manual overrides exist; live feed does not).
- Teammate market list (we know teammates exist via roster but not their projection delta against the player).

### Not yet ingested (MLB)

- Batter-vs-pitcher handedness splits.
- Park factor + weather.
- Batting order (probable pitcher is wired; lineup is not).
- Bullpen availability.

### Not yet ingested (NHL · all blocked on first paid run)

- Line combinations / power-play units.
- Goalie confirmed starter (free api-web.nhle.com exposes probable goalie via daily report — could wire later).

### Not yet ingested (IPL · blocked on per-player stats provider)

- Per-batsman recent innings.
- Per-bowler recent figures.
- Venue / pitch conditions (some free data exists via Cricbuzz HTML; fragile).

### Staged implementation (in priority order)

1. **Same-team correlation warning** in Parlay Lab — already partially live for same-game; same-team usage competition not yet flagged.
2. **Rebound-competition tags** for same-team big-men in Parlay Lab.
3. **Assist-scoring dependency tag** (NBA): when an Over scorer prop and an Over assist prop on the same team appear in the same candidate slip, surface a "ball-share" warning.
4. **Pitcher / batter direct correlation tag** (MLB): opposing pitcher K Over + opposing batter Hits Over should correlate negatively; warn in builder.
5. **Usage / minutes model** (NBA): requires usage-rate ingestion — design only in this PR.
6. **Injury / news feed**: manual override already exists; live feed needs provider decision.

Strictly: **no fake dependency adjustment is applied to projections.** All work above is plan-only until inputs are wired.

## Phase 7 — NHL projection groundwork

Free api-web.nhle.com supports:
- Schedule → already used.
- Per-player game logs at `/v1/player/<id>/game-log/<season>/<gameType>`.
- Boxscore per game gives `sog`, `saves`, `shotsAgainst`, `goals`, `points`, etc.

**Verdict:** NHL projection prototype is feasible on free data EXCEPT for sportsbook lines (paid Odds API). Without lines the projection cannot be expressed as a model lean — it would be a stat forecast preview, which we explicitly do NOT publish to avoid being confused for a betting pick.

This PR keeps `/nhl/board` as the honest pending shell. NHL projection prototype belongs in a follow-up PR that:
1. Adds `pipeline/nhl/nhl_stats.py` (player log loader).
2. Runs one approved paid Odds API call for `player_shots_on_goal` + `player_goalie_saves` (~2 credits).
3. Builds the first NHL `boards/<date>.json` with real leans.

## Phase 8 — IPL projection groundwork

ESPN free endpoints expose team-level innings but not per-player batter / bowler scorecards. Confirmed in PR #46 + PR #47 progress logs. Same conclusion: IPL projections are **blocked on a paid stats provider decision** (Cricbuzz / SportRadar / RapidAPI cricket).

Until then `/ipl/board` says "stats provider research pending" and the new UpcomingSlateStrip on `/ipl` makes the full week of matches visible as `lines pending`.

## Phase 9 — moneyline / game-total feasibility

Same conclusion as the prior PR:

- NBA / MLB game totals require a team-level offense/defense model that does not exist. Aggregating player projections is biased (role players absent from props).
- Moneyline requires team strength + situational adjustments (rest, travel, B2B, bullpen, weather).
- NHL / IPL: schedule-only today.

**No game-line shells added.** Adding empty UI for moneyline / total would muddle the projection-focused board pages.

## Phase 10 — mobile/end-to-end polish

Manual verification at 390px on key routes (recorded in Phase 11 below). Existing routes were already mobile-clean from PR #46/#47; the new `UpcomingSlateStrip` uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` so it reflows cleanly at 390px.

## Out of scope (next PR candidates)

1. NHL first paid Odds API run (~2 credits) → NHL Model Board live.
2. IPL per-player stats provider decision.
3. `/mlb/board?date=<date>`, `/nhl/board?date=<date>`, `/ipl/board?date=<date>` parsing so UpcomingSlateStrip tiles deep-link properly.
4. Dependency-model implementation (same-team correlation warnings → usage model).
5. Candidate-slip snapshot persistence (still the standing parlay blocker).
