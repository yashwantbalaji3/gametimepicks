# Data Providers Roadmap

Living document. Evaluates free / low-cost data providers we can layer on
top of the current pipeline. Created 2026-05-26 (PR #104).

**Honest scope**: nothing on this list is integrated yet beyond what's
already in `pipeline/`. This doc is a triage list, not a feature
announcement. Do not commit a paid integration without an explicit
ENV var, allowlist update, and PR review.

---

## What we use today

| Need | Provider | How |
|---|---|---|
| NBA schedule + box scores | ESPN free `site.api.espn.com/sports/basketball/nba` + nba_api (free public) | `pipeline.settle_results`, `pipeline.attach_recent10` |
| MLB schedule + box scores | MLB Stats API (`statsapi.mlb.com`, free) | `pipeline.mlb.settle_mlb_results`, `pipeline.mlb.generate_mlb_board` |
| NBA + MLB player-prop odds | The Odds API (`the-odds-api.com`) — paid free tier 500 credits/month | `pipeline.providers.odds_api_provider`, `pipeline.mlb.mlb_odds` |
| IPL schedule | ESPN free cricket scoreboard (league 8048) | `pipeline.cricket.fetch_ipl_board` |
| IPL match-winner + totals odds | The Odds API `cricket_ipl` sport key | `pipeline.cricket.fetch_ipl_board` (when `ODDS_API_KEY` present) |

Everything else (player headshots, team logos) is computed from
deterministic URL patterns on ESPN / NBA CDN / MLB CDN — no API call.

---

## Why the production IPL board is currently `oddsStatus: pending`

Diagnosis (this PR):

1. The cricket fetch script (`pipeline.cricket.fetch_ipl_board`) was
   added in PR #103 but **never wired into any GitHub Actions
   workflow**. It only ran locally on my laptop without an API key, so
   `oddsStatus: "pending"` was written and shipped.
2. The workflow `git add` allowlist in
   `.github/workflows/morning-projections.yml` did not include
   `app/public/data/cricket/boards/`, so even if a cron run produced
   the file, the changes would not be committed.

**Fix in this PR**:
- `scripts/automation_projections.sh` now calls
  `pipeline.cricket.fetch_ipl_board --date $TARGET_DATE` as a
  non-fatal step.
- `morning-projections.yml` allowlist extended to include
  `app/public/data/cricket/boards/`.
- The `ODDS_API_KEY` env var is already exposed to the script in the
  workflow.
- Next morning cron run (or any manual workflow dispatch) will produce
  a populated `oddsStatus: "ok"` board.

**Provider supports the call** (per the-odds-api.com docs):
- Sport key: `cricket_ipl` (active during IPL season)
- Markets: `h2h`, `totals`
- Cost: ~2 credits per slate (1 market × 2 regions on average), well
  inside the 500/month free tier.

---

## Candidate providers (triage)

### P0 — already in use

| Provider | Coverage | Free tier | Notes |
|---|---|---|---|
| **The Odds API** | NBA, MLB, NHL, NFL, MLS, EPL, ATP, cricket_ipl, cricket_t20 + many more | 500 credits/month free | h2h + totals + spreads + props (NBA/MLB) ✓ |
| **MLB Stats API** | MLB box scores, schedules, lineups | Free, unlimited | Pre-game lineups arrive ~2 hrs before first pitch. |
| **ESPN free `/sports/...`** | All major US + cricket scoreboards | Free, unrate-limited (light) | Schedule + status + box-score abstracts. |
| **nba_api** (Python) | NBA box scores, player game logs | Free public NBA Stats endpoints | Used for recent10 + settlement. Rate-limited but tolerable. |

### P1 — worth a follow-up evaluation

| Provider | Why look | Free tier | Use case |
|---|---|---|---|
| **TheRundown.io** | h2h+totals for niche leagues + line history | 200 req/mo free | Backup if The Odds API drops a market we need; line-movement history would unlock a "line moved against you" UI |
| **SportsDataIO** | Real-time scores + stats for NBA/MLB/NHL/NFL | Free trial only | Live tracking story (see live-tracking section below). Paid for prod. |
| **API-Sports** | Cricket fixtures + live scores | Free 100 req/day | IPL fallback if ESPN cricket scoreboard goes flaky. |
| **CricAPI / CricketData** | Cricket scores + commentary | Free tier ~100 req/day | IPL ball-by-ball; useful for a live cricket overlay later. |
| **Sportmonks Cricket** | Deep cricket data (lineups, pitch, weather) | Paid only after trial | Would unlock real cricket projections beyond market-based. Out of budget for now. |
| **Cricsheet** | Historical ball-by-ball CSV/JSON dumps | Free, no API | Backtest / calibration data — not live. |

### Avoid (for now)

| Provider | Why avoid |
|---|---|
| **DraftKings / FanDuel scraping** | Violates ToS, breaks frequently, no robots.txt allowance for odds endpoints. Use The Odds API instead — they license the data. |
| **Direct sportsbook API access** | All major US books only sell via paid licensees (Sportradar, Genius Sports). Out of budget. |
| **Generic web-scraping tools (ScrapingBee, etc.)** | Same ToS risk + adds infrastructure cost. |

---

## Live tracking provider story

(See `docs/LIVE_TRACKING_DESIGN.md` for the full design.)

The cheapest live tracking path uses **what we already have**:

- **NBA**: ESPN summary endpoint + nba_api game-by-game stats (both
  free, both already used in settlement).
- **MLB**: MLB Stats API `liveGameStatus` + `boxscore` endpoints
  (free, already used in settlement).
- **Polling cadence**: 5-10 min via a GitHub Actions cron during
  the active game window (e.g. `*/5 18-3 * * *` UTC = 1 PM ET to
  11 PM ET).

What we'd need a new provider for, **eventually**:

- Real-time PBP-driven projections (sub-minute updates) — only Sportradar
  / Genius Sports have that and they're not free.
- Cricket live ball-by-ball — CricAPI / Sportmonks (~$10/mo) if we
  ever want a live IPL overlay.

For the MVP, **no new provider is needed**.
