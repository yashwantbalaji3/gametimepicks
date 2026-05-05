# Odds API Setup — Operator Guide

> **TL;DR**
> 1. Get a free API key at https://the-odds-api.com/ (no credit card)
> 2. Add `ODDS_API_KEY=...` to your `.env`
> 3. Re-run `bash scripts/run_pipeline.sh`
> 4. The board upgrades from "props unavailable" to real prop cards
>
> Your 500 credits/month deplete at roughly **18 credits per pipeline run**
> with the default settings — so plan for ~25 pipeline runs/month before
> the quota resets on the 1st.

---

## Why The Odds API

GametimePicks uses [The Odds API](https://the-odds-api.com/) (the-odds-api.com)
for player-prop lines and odds. Reasons:

- **Truly free tier**: 500 credits per calendar month, no credit card to sign
  up, no time-limited trial. Free forever.
- **NBA player props supported**: points, rebounds, assists are available on
  the free tier (they consume more credits than h2h, but they work).
- **No scraping involved**: this is a legitimate API, not a workaround. We
  never scrape DraftKings, FanDuel, ESPN, etc.
- **Standardized response shape**: works for many sports without special
  cases.

This is the **only** odds provider GametimePicks supports. There are no
plans to add paid providers — if a market or feature isn't free, we don't
build it.

---

## Step 1 — Get a free key

1. Go to <https://the-odds-api.com/>
2. Click "Get API Key" or sign up directly at the manage portal
3. You'll get an email with your key — it looks like a 32-character hex
   string
4. **Do not commit your key to git.** The `.gitignore` already excludes
   `.env`, but be careful with screenshots, README copies, etc.

The free tier:
- 500 credits per calendar month, resets on the 1st
- No request rate limits beyond the monthly cap
- All NBA, MLB, NFL, NHL, NCAAB, EPL, etc. supported

---

## Step 2 — Add the key locally

Copy `.env.example` to `.env` if you haven't already, then edit:

```bash
ODDS_API_KEY=paste_your_32_char_hex_key_here
ODDS_PROVIDER=the_odds_api
ODDS_DATA_MODE=auto

# Tuning (defaults are conservative — keep them unless you have a reason)
ODDS_BOOKMAKERS=draftkings,fanduel
ODDS_MARKETS=player_points,player_rebounds,player_assists
ODDS_REGIONS=us
ODDS_MAX_EVENTS_PER_RUN=6
ODDS_CACHE_TTL_MINUTES=60
```

Restart your terminal (or `source .env`) so the pipeline sees the new
variables.

---

## Step 3 — Re-run the pipeline

```bash
bash scripts/run_pipeline.sh
```

You should see something like this in the log:

```
gtp.board INFO   schedule: 2 games, source=nba_api, status=ok, raw=2, manual=False
gtp.board INFO   mode: ScheduleLiveOddsUnavailable
gtp.board INFO   odds: ok_with_props events_raw=14 matched=2 props=18 cache=miss
gtp.board INFO === Done. todayMode=Live. 4 days, 2 games, 18 leans ===
```

The key indicators:
- `odds: ok_with_props` — fetch worked and returned props
- `todayMode=Live` — the board upgraded from `ScheduleLiveOddsUnavailable`
  to the full live mode

If you instead see `odds: ODDS_API_KEY not set` or `odds: failed`, see the
[Troubleshooting](#troubleshooting) section below.

---

## How credits are consumed

The Odds API charges you per request based on how much data you ask for:

| Endpoint | Cost |
|---|---|
| `GET /v4/sports/basketball_nba/events` | **0 credits** (FREE) |
| `GET /v4/sports/basketball_nba/events/{id}/odds` | **markets × regions** credits |

GametimePicks calls `events` first to find the slate's matching games (for
free), then calls `events/{id}/odds` only for events that match your
schedule. Each per-event call costs:

```
markets (3) × regions (1) = 3 credits per event
```

With `ODDS_MAX_EVENTS_PER_RUN=6`, that's **18 credits per pipeline run**.
Multiplied by 27 runs, that's the full 500-credit free tier.

The `x-requests-remaining` header from each response is recorded into
`board.json` as `oddsQuotaRemaining`, so you can monitor depletion:

```bash
jq '.oddsQuotaRemaining' app/public/data/board.json
```

---

## How to avoid burning credits

The biggest credit waste is re-fetching the same data multiple times. The
defaults are tuned to make this hard:

1. **`ODDS_CACHE_TTL_MINUTES=60`** — once fetched, props are cached on disk
   under `pipeline/cache/` for an hour. Re-running the pipeline within
   that hour is free.
2. **`ODDS_MAX_EVENTS_PER_RUN=6`** — caps the per-run credit cost at
   `6 × markets × regions`. Even on busy slates with 12+ NBA games, you
   won't accidentally drain your quota.
3. **Markets list narrow** — every added market multiplies the per-event
   cost. If you only care about `player_points`, set
   `ODDS_MARKETS=player_points` to cut credits by 3×.
4. **Schedule matching** — the pipeline only fetches odds for events that
   match your local slate. If your schedule has 2 games and the API has
   14 events, you only pay for 2 events of odds (6 credits), not 14
   (42 credits).

If you're developing actively, you can crank the cache TTL even higher
(e.g. `ODDS_CACHE_TTL_MINUTES=240` for 4 hours) and clear the cache by
hand when you actually want fresh odds:

```bash
rm pipeline/cache/odds_api_*.json
```

---

## What happens when no key is configured

If `ODDS_API_KEY` is empty:

- The pipeline still builds the schedule and slate normally
- `dataMode` stays as `ScheduleLiveOddsUnavailable` (or whatever the
  schedule resolved to)
- `oddsProviderStatus = "not_configured"`
- The board renders the "Props unavailable — odds provider not configured"
  banner with a link to this page
- **No fake props, no fabricated odds, no demo cards** are mixed in

This is intentional. The site is honest about what it has.

---

## What happens when the key fails

- `oddsProviderStatus = "failed"`
- `oddsFailureReason` is populated (e.g. "401 invalid api key", "429 rate
  limited / quota exhausted", "timeout")
- The board renders "Odds provider unavailable" with the failure reason
- **No fake props are substituted**

Common failure modes:
- **401 invalid api key** — typo in `.env`, or you mixed up the key with
  a different service's key
- **429 quota exhausted** — you're at 0 credits remaining; the quota
  resets on the 1st of the month, or you can upgrade tiers (we don't
  recommend it for this project)
- **timeout** — transient network issue, just re-run

---

## Supported markets in this phase

Phase 7B-2 supports three markets out of the box:

| Market key | Display | Credit cost (with regions=us) |
|---|---|---|
| `player_points` | Points | 1 credit per event |
| `player_rebounds` | Rebounds | 1 credit per event |
| `player_assists` | Assists | 1 credit per event |

The Odds API has more available (`player_threes`, `player_steals`,
`player_blocks`, `player_turnovers`, `player_points_rebounds_assists`,
etc.) — you can add them to `ODDS_MARKETS` and the pipeline will request
them. Each added market multiplies your per-event cost. The model only
scores PTS/REB/AST today; other markets show up as "insufficient_data /
no_play" cards (still no fake projections).

---

## Why no fake odds, ever

If the Odds API returns nothing, the pipeline shows that explicitly. We
never:

- invent prop lines
- generate fake odds
- substitute demo cards into a real-mode slate
- claim a model lean when we have no real prop to score against

This is the central design rule from Phase 6 onward and applies just as
strictly in Phase 7B-2 as it did before. The "Props unavailable" /
"Odds provider unavailable" / "No props returned" states all exist
specifically to make this possible.

---

## Troubleshooting

**"props: not_configured" but I added the key**
- Check that `.env` is in the project root, not `app/.env` or
  `pipeline/.env`
- Restart your terminal after editing `.env` (or `source .env`)
- Verify with `echo $ODDS_API_KEY` — it should print your key

**"props: failed" with 401**
- Your key is wrong. Re-copy it from your email or the
  [account portal](https://the-odds-api.com/account)

**"props: failed" with 429**
- Your monthly quota is exhausted. `jq '.oddsQuotaRemaining'
  app/public/data/board.json` will show 0. Wait for the 1st, or accept
  fewer pipeline runs.

**"props: ok_no_props"**
- The fetch succeeded, but no props were available. Common causes:
  - It's an early playoff date with TBD opponents — sportsbooks haven't
    listed lines yet
  - The bookmakers in your `ODDS_BOOKMAKERS` list aren't carrying that
    matchup
  - The matchup was cancelled or postponed
- Re-run closer to tipoff (within ~12-24 hours)

**The board still says "Props unavailable" after I push**
- Vercel deployments need a re-trigger after env changes. Push a commit
  (any commit) or hit "Redeploy" in the Vercel dashboard
- Vercel needs `ODDS_API_KEY` set under Project Settings → Environment
  Variables, not just in your local `.env`. Add it there as well, then
  redeploy.
