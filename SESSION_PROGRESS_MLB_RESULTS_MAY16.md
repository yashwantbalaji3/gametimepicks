# MLB Results — May 16 settlement (progress log)

**Branch:** `feature/mlb-results-settlement-may16`
**Base:** `main` @ `4197846`
**Started:** 2026-05-16

## MLB May 16 finality audit (free MLB-StatsAPI probe)

| State | Count | Detail |
|---|---|---|
| **Final** | 6 | gamePks 824278 (TOR@DET), 823060 (KC@STL), 824359 (AZ@COL), 822737 (BAL@WSH), 823382 (PHI@PIT), 822981 (MIA@TB) |
| **In Progress** | 7 | CIN@CLE, TEX@HOU, CHC@CWS, MIL@MIN, SD@SEA, BOS@ATL, NYY@NYM |
| **Pre-Game** | 2 | LAD@LAA, SF@ATH |
| **Total** | 15 | — |

## Settlement input

PR #42's regen (cache pull AFTER games started) dropped to 183 leans across 8 in-progress / pregame events — **0 of the 6 Final games had leans on disk before this PR**. Restored from `04fe441` (PR #41 merge) which had:
- 327 leans across 15 events
- New id format with line suffix (`{gameId}-{player}-{market}-{line}`)
- `playerId` / `playerTeamAbbr` / `opponentAbbr` populated
- No `reasonBullets` (added in PR #42); UI fallback parses from legacy `reason` string

Restored files:
- `app/public/data/mlb/boards/2026-05-16.json` (327 leans, the published audit input)
- `app/public/data/mlb/schedule/2026-05-16.json`
- `app/public/data/mlb/power/2026-05-16.json`

This is the data users have seen since PR #41 merged. No fabrication — just restoring what the books pulled away.

## Eligible for settlement
- 144 leans on the 6 Final games
- By market: 12 pitcher_strikeouts (1 insufficient), 80 batter_hits (10 insufficient), 52 batter_total_bases (4 insufficient)
- Decisive candidates (proj + edge + conf != insufficient): **129**

## Constraints (standing)
- No paid Odds API
- No workflow triggers
- No package changes
- No fabricated results
- Free MLB-StatsAPI for boxscore data
- Pending games stay pending
- NBA Results / boards unchanged
- File intentionally untracked
