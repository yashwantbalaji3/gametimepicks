# Odds API Activation Guide (Operator)

This doc walks through how to enable real player props (model leans) on the public site. **Public users never see this file or these commands.**

## When you'd want to enable this

The public site is currently in `ScheduleLiveOddsUnavailable` mode for today/tomorrow — the schedule loaded but no model leans are published. This is because the pipeline didn't fetch player props from The Odds API. The fix is to enable the paid odds fetch, which costs API credits but unlocks the model board.

**Before turning this on, decide:**

1. How many credits do you have? Check at https://the-odds-api.com/account
2. How aggressive do you want to refresh? Each per-event odds fetch is ~1 credit per game. Two NBA games × twice a day = ~120 credits/month — well under the 500/month free-tier limit. Eight games × six refreshes/day = ~1440 credits/month — over the limit.
3. Are you ready for real leans to publish? Once on, the live site will show concrete model picks. Make sure the model is in a state you're proud of.

## Step 1 — Get an API key

1. Sign up at https://the-odds-api.com (free tier: 500 requests/month)
2. Copy your API key from the dashboard
3. Store it as a Vercel environment variable AND as a GitHub Actions secret:

```bash
# Vercel (for builds):
#   Settings → Environment Variables → ODDS_API_KEY = <your key>
# Apply to: Production, Preview, Development

# GitHub Actions (for the auto-refresh workflow):
#   Settings → Secrets and variables → Actions → New repository secret
#   Name: ODDS_API_KEY
#   Value: <your key>
```

## Step 2 — Enable refresh in the workflow

Edit `.github/workflows/auto-refresh.yml` and change the repository variable:

```bash
# Settings → Secrets and variables → Actions → Variables tab
ENABLE_ODDS_REFRESH=true        # default: false
ODDS_DRY_RUN=false              # default: true (dry-run is the safe default)
ODDS_MAX_EVENTS_PER_RUN=12      # already configured; tune as needed
ODDS_CACHE_TTL_MINUTES=120      # already configured
ODDS_MIN_CREDITS_REMAINING=50   # workflow will skip if you fall below this
```

The workflow's "Optional — paid Odds API refresh" step is currently a no-op placeholder. **You'll need to replace it** with the actual fetch invocation:

```yaml
      - name: Optional — paid Odds API refresh
        if: env.ENABLE_ODDS_REFRESH == 'true'
        env:
          ODDS_API_KEY: ${{ secrets.ODDS_API_KEY }}
        run: |
          python -m pipeline.fetch_odds \
            --max-events ${{ env.ODDS_MAX_EVENTS_PER_RUN }} \
            --cache-ttl ${{ env.ODDS_CACHE_TTL_MINUTES }} \
            --min-credits ${{ env.ODDS_MIN_CREDITS_REMAINING }} \
            ${{ env.ODDS_DRY_RUN == 'true' && '--dry-run' || '' }}
```

(If `pipeline/fetch_odds.py` doesn't exist yet, that's a separate Phase 17 ticket.)

## Step 3 — Test locally first

Before turning it on in CI, prove it works on your Mac:

```bash
# Set the key just for this shell
export ODDS_API_KEY="<your key>"

# Dry-run first — no credits used, but confirms the URL/headers work
ODDS_DRY_RUN=true python -m pipeline.fetch_odds --max-events 2

# If dry-run looks right, real fetch:
ODDS_DRY_RUN=false python -m pipeline.fetch_odds --max-events 2

# Verify it added leans to today's board
python -m pipeline.inspect_trends
```

If the inspection shows leans for today, regenerate the daily board:

```bash
python -m pipeline.generate_daily_board --date $(TZ=America/New_York date '+%Y-%m-%d')
```

Then build the site locally to confirm the public board is populated:

```bash
cd app && npm run build && npm run start
```

Visit `http://localhost:3000/board` — should now show real model leans for today.

## Step 4 — Cadence recommendation

For an educational analytics site at the free tier (500 credits/month):

| Trigger | Cadence | Cost |
|---|---|---|
| Schedule + recent10 refresh | Every 2 hr (FREE — nba_api) | 0 credits |
| Odds API refresh (props) | Once per day, 30 min before tipoff | ~10 credits/run × 30 days = 300 credits |
| Manual trigger | As needed | ~10 credits |

Leaves ~190 credits/month buffer. If you upgrade to a paid Odds API tier (5000 requests/month for $30), you can run hourly refreshes during the NBA window without worry.

## Step 5 — Monitoring credit usage

The Odds API response headers include:

- `x-requests-remaining` — credits left this billing cycle
- `x-requests-last` — credits this single request consumed

The auto-refresh workflow logs these. If `ODDS_MIN_CREDITS_REMAINING` is set, the workflow will refuse to make paid calls when credits drop below that threshold — your safety net against running dry mid-month.

## Step 6 — Rollback

If something goes wrong (e.g. credit burn, malformed leans, model produced bad picks), turn it off without code changes:

```
GitHub → Settings → Variables → ENABLE_ODDS_REFRESH = false
```

The workflow will go back to free-only mode on the next cron tick.

## What NEVER to do

- **Don't commit your `ODDS_API_KEY`** to the repo. Even in a private repo, secrets belong in GitHub Actions secrets / Vercel env vars only.
- **Don't disable `ODDS_MIN_CREDITS_REMAINING`** unless you have a paid plan with effectively unlimited credits.
- **Don't fetch on every page load.** This is a static site — odds get fetched once per refresh cycle and baked into the build. Per-request fetching would burn credits in seconds.
- **Don't scrape sportsbook websites.** The Odds API is the licensed source. Anything else is a TOS violation.
