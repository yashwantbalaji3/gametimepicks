# Getting the API-Football (API-Sports) key for World Cup stats

## Recommended path
Use **API-Football by API-Sports** (api-football.com). It's the best immediate fit for World
Cup 2026 because it covers, on a real plan: **fixtures** (FIFA World Cup = league id `1`,
season `2026`), **teams**, **lineups** (near kickoff), **player statistics** + **minutes/
appearances**, and **match statistics** (shots, shots on target, corners), with **national-
team** coverage and history to derive team strength + player role. It has **no xG** — so
`xgReady` stays false and xG-dependent confidence stays Low/limited (per our factor guide).
Its **free tier (100 requests/day)** is enough for the first bounded discovery (coverage
proof). Sportmonks is the alternative only if xG is required.

## Exact signup / key steps (for Yash)
1. Go to **https://www.api-football.com/** → click **Sign Up / Pricing**.
   (Use the **direct API-Sports dashboard** path — `dashboard.api-football.com` — not RapidAPI,
   so the auth header is `x-apisports-key` and the key name stays clean.)
2. Create an account (email + password) and verify the email.
3. Choose a plan — **start with Free** (100 req/day). That's enough for bounded discovery; you
   can upgrade later if full daily ingestion is needed.
4. Open the **dashboard** → the **API key** is shown at the top (or under "My Access" / "API
   Keys"). It's a long alphanumeric string.
5. **Copy** the key (don't paste it into chat or commit it anywhere).

## What key name we need
Standardize the repo on:
```
API_FOOTBALL_KEY
```
(The provider sometimes calls it `APISPORTS_KEY` natively — that's fine, but **add it to the
repo as `API_FOOTBALL_KEY`**, which is what our provider interface will read via `env_key`.)

## Where to add it
**GitHub Actions secret is the first requirement** (the discovery workflow runs there):
1. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `API_FOOTBALL_KEY`
3. Value: paste the API key
4. **Add secret**

Vercel is only needed later if the *app runtime/server build* must call the provider directly
(currently it doesn't — data is fetched in the workflow and committed as artifacts). If/when
that changes:
- Vercel project → **Settings → Environment Variables** → add `API_FOOTBALL_KEY` → apply to
  Production/Preview/Development → redeploy.

## How to verify (without printing the value)
```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks
gh secret list | grep API_FOOTBALL_KEY
```
Expected: the secret **name** appears. The value is never shown — that's correct.

## One safe test call (after the adapter exists)
The `api_football` adapter (`pipeline/world_cup/providers/api_football.py`) **doesn't exist
yet** — so a real call can't run today. The order is: **add the key → next Claude mission
implements the adapter + registers it → then** run bounded discovery:
```bash
gh workflow run world-cup-stats-discovery.yml -f provider=api_football -f date=2026-06-11 -f dry_run=true
```
(The workflow's inputs are `date`, `provider`, `dry_run`. Boundedness — request caps, one
call per resource, caching — is enforced inside the adapter, not via a workflow input.)

## Cost / credits warning
- Start with the **Free / lowest tier**.
- **No loops.** Keep discovery bounded — one call per resource, cached.
- First goal is **coverage proof**, not full ingestion.
- API-Football has **no xG**; team + player **basics** (minutes, shots, SOT, corners) can still
  unlock team-level projections and (gated) player props, while `xgReady` stays false.

## What to send Claude after the key is added
> I added `API_FOOTBALL_KEY` to GitHub Actions secrets. Please implement the API-Football
> adapter, run bounded discovery for today's World Cup matches, normalize fixtures/team stats/
> lineups/player stats, and only enable projections/parlays if the readiness gates pass.
