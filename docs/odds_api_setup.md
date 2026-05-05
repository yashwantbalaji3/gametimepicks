# Odds API setup — operator walkthrough

This is the safe, step-by-step way to add a free The Odds API key to
GametimePicks. Phase 7B-3 added diagnostics so you can validate the wiring
**without burning paid credits** before doing a real run.

The app works fine without a key — the schedule renders, the
"Props unavailable — odds provider not configured" banner appears, and zero
prop cards show. Adding a key is purely opt-in for real player props.

## TL;DR (the safe path)

```bash
# 1. Get a free key (no card)
open https://the-odds-api.com/

# 2. Add to .env
echo 'ODDS_API_KEY=YOUR-KEY-HERE' >> .env

# 3. Verify the key works (FREE — costs 0 credits)
python -m pipeline.check_odds_key

# 4. Dry-run the pipeline (FREE — calls /events only, skips /odds)
ODDS_DRY_RUN=true bash scripts/run_pipeline.sh
python -m pipeline.diagnose

# 5. When happy, real run (uses credits)
bash scripts/run_pipeline.sh
python -m pipeline.diagnose
```

---

## Step 1 — Get a free key

1. Go to <https://the-odds-api.com/>.
2. Click "Get a free API key".
3. Sign up with email — **no credit card required**.
4. Free tier: **500 credits per month**, automatic monthly reset.
5. Copy the key from the dashboard.

The key string looks like a 32-char hex blob, e.g. `abc1...def2`.

## Step 2 — Add to `.env`

```bash
# In your project root (~/Downloads/gametimepicks)
echo 'ODDS_API_KEY=YOUR-ACTUAL-KEY-HERE' >> .env
```

**Security:**

- `.env` is already in `.gitignore`. Confirm with `git status` — it should
  NOT show up as a tracked file.
- Never paste the key in chat, in commits, in screenshots, or anywhere
  public. Treat it like a password.
- If you ever leak it, regenerate it on the dashboard and update `.env`.

## Step 3 — Validate the key (FREE)

```bash
python -m pipeline.check_odds_key
```

This calls `/v4/sports/?apiKey=...` which The Odds API documents as
costing **0 credits**. The script:

- Confirms the key is set
- Confirms the key is valid (HTTP 200)
- Confirms NBA is in the supported sports list
- Reports your remaining quota
- Forecasts how many credits a real pipeline run will cost at your
  current `ODDS_BOOKMAKERS` / `ODDS_MARKETS` / `ODDS_REGIONS` /
  `ODDS_MAX_EVENTS_PER_RUN` settings
- **Never prints the key itself** — only a `abc1...def2 (32 chars)` mask

If the key is invalid you'll see an HTTP 401 and a friendly hint to
regenerate it. If the API is rate-limiting or down, you'll see HTTP 429 /
HTTP 5xx with a wait-and-retry hint.

If the key is unset, the script prints help text and exits cleanly. No
network call is made.

## Step 4 — Dry-run the pipeline (FREE)

```bash
ODDS_DRY_RUN=true bash scripts/run_pipeline.sh
```

`ODDS_DRY_RUN=true` makes the pipeline:

1. Resolve the schedule normally (manual override → nba_api → ESPN)
2. Call `/v4/sports/basketball_nba/events?...` for each date — **FREE,
   per the API docs**. This confirms your key works against NBA and tells
   us how many events The Odds API has for the slate.
3. **Skip** `/v4/sports/basketball_nba/events/{id}/odds?...` — the paid
   per-event call. Zero credits are burned on /odds.
4. Set `oddsProviderStatus = "dry_run"` on the board.
5. The UI renders the schedule and a "Dry-run mode — odds fetches skipped
   to preserve credits" banner.

Inspect the result:

```bash
python -m pipeline.diagnose
```

You should see:

- `oddsProviderStatus: dry_run`
- `events matched to slate: <N>` — should match your slate's game count if
  The Odds API has lines for those teams
- `props parsed: 0`
- `events fetched (paid /odds): 0` — confirms no paid calls were made
- `credits remaining: <X>` — should be the same as before (dry-run is
  reported in the header but the /events endpoint itself doesn't count)

If `events matched to slate` is lower than `events`, that's because The
Odds API has more games on the date than your slate (e.g. they list
preseason or international too). The pipeline only fetches odds for events
matching your slate's `homeTeamFull` / `awayTeamFull`.

## Step 5 — Real run (uses credits)

When the dry-run looks right, do a real run:

```bash
# Either remove ODDS_DRY_RUN from .env, or:
ODDS_DRY_RUN=false bash scripts/run_pipeline.sh
```

This time the pipeline calls `/odds` for each matched event, costing
`markets × regions` credits per event. With the defaults (3 markets × 1
region = 3 credits per event, capped at 6 events per run = 18 credits),
that's well under the free 500/month even running 5 times a day.

After the run:

```bash
python -m pipeline.diagnose
```

Look for one of three healthy outcomes:

| Status | Meaning |
|---|---|
| `ok_with_props` | Real props were fetched and scored. UI shows real prop cards. `dataMode = Live`. |
| `ok_no_props` | API responded fine but returned 0 player props for this slate. Common for early playoff dates with TBD opponents. UI shows "No player props returned for this slate". `dataMode = ScheduleLiveOddsUnavailable`. |
| `failed` | Network/auth error. UI shows "Odds provider unavailable" with the error detail. `dataMode = ScheduleLiveOddsUnavailable`. |

In all three cases, **zero fake data** is generated.

## Step 6 — Inspect the cache (free)

```bash
python -m pipeline.cache_inspect
```

Shows every file in `pipeline/cache/`, its size, age, and how it'd be
classified. Two kinds today:

- `odds_api_*.json` — cached responses from The Odds API (TTL =
  `ODDS_CACHE_TTL_MINUTES`, default 60 min)
- `espn_*.json` — cached responses from the ESPN scoreboard fallback
  (TTL = 30 min, hard-coded)

Within the cache TTL, re-running the pipeline costs **0 credits**. The
cache key includes date + markets + bookmakers + regions, so changing any
of those triggers a fresh fetch.

To force fresh fetches:

```bash
python -m pipeline.cache_inspect --clear
# or just odds caches:
python -m pipeline.cache_inspect --clear --kind odds_api
```

## Step 7 — Avoiding credit drain

Free tier is 500 credits/month. To stay safe:

- **Don't run the pipeline in a tight loop.** Re-running within the
  cache TTL is free, but if you change config and clear the cache,
  every run hits the network.
- **Keep `ODDS_MAX_EVENTS_PER_RUN` small** during development. Default
  is 6 — if your slate has 12 games, only the first 6 are fetched.
- **Keep `ODDS_BOOKMAKERS` short.** Each extra book doesn't cost more
  credits (you pay per market × region) but it does inflate response
  size and pick a winning book downstream.
- **Use `ODDS_DRY_RUN=true` whenever you're testing wiring**, not real
  prop generation.
- **Bump `ODDS_CACHE_TTL_MINUTES` to 120-240** during development if
  you re-run a lot.
- **Watch the `credits remaining` line in `python -m pipeline.diagnose`**
  after each real run. If it drops faster than you expect, something
  in your config (more markets, more regions, more events) changed.

## Step 8 — Interpreting the badge

The data-source badge at the top of the board shows the odds row:

| Badge text | Meaning |
|---|---|
| `odds: the_odds_api · 482 credits left` | Real props flowing |
| `odds: no props returned` | API responded, slate had 0 props |
| `odds: fetch failed` | Network/auth error — see banner for detail |
| `odds: dry run` | `ODDS_DRY_RUN=true` is set |
| `odds: not configured` | `ODDS_API_KEY` not set |

`credits left` is only shown when the API returned a quota header (i.e.
after a successful call).

## Troubleshooting

### "Key is invalid (HTTP 401)"

- Did you copy the whole key from the dashboard?
- Did you wait ~1 minute after signing up?
- Try regenerating the key at <https://the-odds-api.com/account/>.

### "Pipeline shows ok_no_props but I know there are games tonight"

- That's a real situation: sportsbooks often don't post player-prop lines
  until a few hours before tipoff, especially for playoff games or games
  with TBD opponents. Re-run the pipeline closer to tipoff.

### "I want to test without using any credits but `/events` is still
counting against my quota"

- It shouldn't — The Odds API documents `/sports/{sport}/events` as not
  consuming credits. The `x-requests-remaining` header value won't drop
  on /events calls. If it does, that's a provider-side bug; report it to
  The Odds API support.

### "I want to inspect the raw API response"

```bash
python -m pipeline.cache_inspect --show <key>
```

The cache files contain the full provider response. `key` can be the
full filename minus `.json`, or the part after the `odds_api_` /
`espn_` prefix.

### "I want to remove the key entirely"

```bash
# Remove the line from .env, then:
unset ODDS_API_KEY
bash scripts/run_pipeline.sh
```

The board returns to the no-key state automatically. No code changes
needed.

## What this setup does NOT do

- Does not scrape DraftKings, FanDuel, ESPN HTML, or any sportsbook site
- Does not reverse-engineer mobile APIs
- Does not require any paid plan
- Does not call any provider other than The Odds API for odds
- Does not auto-post to social platforms
- Does not generate fake odds, fake props, or fake leans under any
  circumstance

If anything in the pipeline ever produces output that violates one of
those, that's a bug — report it.
