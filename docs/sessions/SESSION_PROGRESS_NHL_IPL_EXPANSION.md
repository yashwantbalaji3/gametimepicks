# Session progress — NHL + IPL sport expansion (planning PR)

> Generated 2026-05-17. Untracked. Do not commit.

## Part 1 — PR #45 merge

- Squash-merge SHA: `37e57c1` ("feat(ui): align NBA and MLB sport sections and unify Results audit (#45)")
- `feature/sport-tabs-parlays-results` branch deleted from origin.
- Production live at https://gametimepicks.yashwantbalaji.com — `/`, `/nba/`, `/results/parlays/`, `/mlb/parlays/` all HTTP 200.
- Canonical Vercel deploy: https://vercel.com/yashwantbalaji33-7164s-projects/gametime-picks/ALi7ViFhRrmtHwPfYu83hJh16om8
- Rollback: `git revert 37e57c1`

## Part 2 — branch

- New branch: `feature/sports-expansion-nhl-ipl-plan` from `main` at `37e57c1`.
- Goal: add NHL + IPL as future sport sections with the same five-tab structure as NBA and MLB. No paid API. No fabricated data. Schedule loaded honestly from free public endpoints; everything else is pending until paid odds + stats sources are wired.

## Phase 1 — current architecture audit

- `nav.tsx` lists Home / NBA / MLB / Parlay Lab / Results / Methodology / Responsible Use.
- `NbaSectionTabs` / `MlbSectionTabs` are sport-section sub-nav strips (Overview · Model Board · Power Board · Parlays · Results).
- `ResultsSportTabs` is the cross-sport audit strip on every Results page; currently Overview / NBA / MLB / Parlays.
- Data loaders: `lib/data.ts` (NBA), `lib/data-mlb.ts`, `lib/data-mlb-results.ts`, `lib/settlement-data.ts`. NBA + MLB sports have separate namespaces. New sports follow the same pattern.
- Page wrapper pattern: `/nba/board` and `/nba/parlays` re-export `/board` and `/parlay-lab` defaults so legacy URLs and sport-namespaced URLs share code. NHL/IPL will be fresh shells (no NBA-equivalent route to re-use yet).

## Phase 2 — NHL free-data findings

- **Schedule API:** `https://api-web.nhle.com/v1/schedule/<YYYY-MM-DD>` — free, no auth, requires a benign User-Agent header. Returns a 7-day gameWeek block.
- **Today (2026-05-18):** 1 playoff game — MTL @ BUF at 23:30 UTC, gameType=3 (playoffs), gameState=FUT.
- **Week ahead:** sparse playoff schedule — VGK@COL, TBD@CAR, etc. on alternating days. Only 1 game per day during conference finals.
- **Boxscore endpoint:** `https://api-web.nhle.com/v1/gamecenter/<gameId>/boxscore`. Returns `playerByGameStats.{homeTeam,awayTeam}.{forwards,defense,goalies}[]` with per-player fields:
  - Skaters: `goals`, `assists`, `points`, `plusMinus`, `pim`, `hits`, `sog`, `blockedShots`, `toi`, `shifts`, `giveaways`, `takeaways`
  - Goalies: `saves`, `shotsAgainst`, `saveShotsAgainst`, `goalsAgainst`, `toi`, `starter`
- **Verdict:** NHL settlement is fully feasible on free data. Projection inputs (last-N skater logs, goalie logs, opponent matchup) are also reachable via the same API (`/v1/player/<id>/game-log/...`, `/v1/club-schedule-season/<team>/...`).

### NHL MVP markets (ranked by feasibility)

1. **Shots on goal (`sog`)** — stable, large sample, posted on every US sportsbook as `player_shots_on_goal`.
2. **Goalie saves (`saves`)** — stable, only ~1-2 props per game (starting goalies), posted as `player_goalie_saves` or similar.
3. **Points (`points` = goals + assists)** — moderate volatility, posted as `player_points`.
4. **Assists (`assists`)** — moderate volatility.
5. **Goals (`goals`)** — high variance → Power Board only, never main board.

## Phase 3 — IPL free-data findings

- **Schedule API:** ESPN cricket scoreboard for league 8048 (IPL): `https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard?dates=YYYYMMDD` — free, no auth, needs a benign UA.
- **Today (2026-05-18):** 1 scheduled match — CSK v SRH at 14:00 UTC, status=Scheduled.
- **Team-level data:** linescores per innings (runs, wickets, overs, isBatting) and overall result are available.
- **Per-player batting/bowling stats:** **NOT in the free ESPN endpoints we probed.** `rosters[].roster[].stats` came back empty. `leaders` returns `team` + `linescores` only. `squads` was empty.
- **Per-player stats sourcing options for later:**
  - SportRadar Cricket / RapidAPI cricket — paid, but possibly cheap.
  - Cricbuzz / CricInfo HTML scraping — fragile, anti-bot.
  - Some ESPN summary endpoints expose `boxscore.players` for cricket but inconsistently across matches.
- **Verdict:** IPL gets a schedule-only shell on this PR. Projection / model board / results / parlays stay honestly "stats provider research pending" until a stable per-player source is approved.

### IPL MVP markets (deferred — not on this PR)

1. **Batter runs** — needs per-batsman score from a stable source.
2. **Bowler wickets** — needs per-bowler figures.
3. **Batter fours**
4. **Batter sixes** — high variance → Power Board only.
5. **Total team runs** — actually feasible on linescores, but team-level not player-prop.

## Phase 4 — paid-market + credit audit (no calls made)

Searched `pipeline/` and `app/src/` for existing sport keys:

- `pipeline/providers/odds_api_provider.py` → `SPORT_KEY = "basketball_nba"`
- `pipeline/mlb/mlb_odds.py` → `SPORT_KEY = "baseball_mlb"`
- No NHL or cricket plumbing today. New providers needed when paid odds are approved.

The Odds API publicly supports (per their docs, not verified by call):
- `icehockey_nhl` with player markets like `player_shots_on_goal`, `player_points`, `player_goalie_saves`.
- `cricket_ipl` and several T20 leagues, but PLAYER prop markets on US-licensed bookmakers are limited. Match-winner / total runs are widely posted; individual batsman/bowler props less so.

### Credit estimate (no calls; pure math)

Cost formula: `events × markets × regions` per cached event lookup.

- **NHL minimum MVP (shots_on_goal + goalie_saves):** 1 event × 2 markets × 1 region = **2 credits/day** on conference-finals-only days. On regular-season-like 10-game slates: 1 × 2 × 10 = **20 credits/day**. Tractable.
- **IPL minimum MVP (batter_runs + bowler_wickets):** 1 event × 2 markets × 1 region = **2 credits/day** — IF those markets are actually quoted. Currently uncertain.

### Recommendations

- **Floor:** 350 credits (unchanged).
- **Per-run cap:** 75 (unchanged).
- **Approval needed:** explicit user OK for each first paid run of each sport.
- **Current balance:** ~368 credits (last confirmed in the prior session handoff).

## Phase 5 — product architecture proposal

### Routes

```
/nhl                    NHL Overview hub
/nhl/board              Model Board (pending odds + projections)
/nhl/power              Power Board placeholder (Goals + shot-volume Watch)
/nhl/parlays            Parlay Lab placeholder
/nhl/results            Results placeholder
/ipl                    IPL Overview hub
/ipl/board              Model Board (pending stats provider)
/ipl/power              Power Board placeholder (Sixes / boundary Watch)
/ipl/parlays            Parlay Lab placeholder
/ipl/results            Results placeholder
```

### Section tab labels (mirror NBA/MLB exactly)

`Overview · Model Board · Power Board · Parlays · Results`

### Power Board meaning per sport

| Sport | Power Board scope |
|---|---|
| NBA | usage spikes / minutes volatility / rotation watch |
| MLB | home-run watch |
| NHL | Goals watch + shot-volume volatility + goalie pressure |
| IPL | Sixes watch + boundary power + high-variance batting |

Power Boards never feed the overall hit rate. Confidence framing is "watch tier" / "power profile", never standard High/Medium/Low.

### Shared components

- Add `NhlSectionTabs` and `IplSectionTabs` (sibling components to existing NBA/MLB section tabs).
- Reuse `NeonStatPanel`, `NeonCornerBracket`, `BrandMark`, `Footer`, `Nav` directly.
- `ResultsSportTabs` extended to Overview / NBA / MLB / NHL / IPL / Parlays. NHL + IPL marked `pending` until settled rows exist.

### Data layout

```
app/public/data/nhl/schedule/<YYYY-MM-DD>.json
app/public/data/nhl/boards/<YYYY-MM-DD>.json     (later)
app/public/data/nhl/results/...                  (later)
app/public/data/ipl/schedule/<YYYY-MM-DD>.json
app/public/data/ipl/boards/<YYYY-MM-DD>.json     (later)
app/public/data/ipl/results/...                  (later)
```

Schedule JSONs for 2026-05-18 have been written from real free endpoints. Boards/results stay missing until projections + odds are wired.

### What this PR ships

- 5 NHL routes + 5 IPL routes (Overview + 4 placeholder children each).
- Real schedule data for 2026-05-18 on both sports.
- `NhlSectionTabs` + `IplSectionTabs` components.
- `ResultsSportTabs` extended with NHL + IPL (pending).
- Nav extended with NHL + IPL entries.
- No model board content. No projections. No results data. No fake parlay candidates.

### What this PR explicitly does NOT ship

- Paid odds wiring for NHL or IPL.
- NHL pipeline (`pipeline/nhl/*`).
- IPL stats provider research is incomplete — no `pipeline/ipl/*`.
- Multi-sport parlay generation.
- Candidate-slip snapshot persistence (still the standing blocker).

## Phase 8 — parlay architecture notes (forward-looking)

Unified `ParlayLeg` shape must support all four sports:

```ts
interface ParlayLeg {
  sport: "NBA" | "MLB" | "NHL" | "IPL";
  date: string;
  gameId: string;          // NBA: NBA gameId; MLB: gamePk; NHL: NHL game id; IPL: ESPN event id
  playerId: number | string | null;
  playerName: string;
  team: string;
  opponent: string;
  market: string;          // sport-specific market key
  side: "Over" | "Under";
  line: number;
  odds: number;
  bookmaker: string;
  projection: number | null;
  edgePct: number | null;
  confidence: string;
  riskFlags: string[];
}
```

Snapshot persistence requirements unchanged from prior PR:

- Save daily candidate slips per sport to `app/public/data/parlays/<sport>/<date>.json` BEFORE first game.
- Grade after settlement.
- Multi-sport blends require all single-sport snapshots first.

This PR adds no parlay code — only documents the schema extension.

## Open questions for the operator

1. **IPL per-player stats source** — is paid stats access (Cricbuzz/SportRadar/RapidAPI) approved for research, or stay on free-only until a clean source surfaces?
2. **NHL paid odds approval** — when ready, the first paid Odds API call (shots_on_goal + goalie_saves for tomorrow's MTL@BUF) would be ~2-4 credits. Approve?
3. **Section nav order** — should top nav be Home / NBA / MLB / NHL / IPL / Parlay Lab / Results / Methodology / Responsible Use, or should the "Parlay Lab" item retire in favor of per-sport Parlay tabs only?
4. **Power Board priority** — NBA Power Board still has no real signals. Should NHL Power Board ship a similar honest "warming up" shell, or wait for actual high-variance market data?
