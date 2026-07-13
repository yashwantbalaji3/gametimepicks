# GitHub Actions Secrets — Turn On Daily Automation

The daily refresh / settlement / deploy workflows already exist; they **fail closed (no-op) until these repo
secrets are added**. Adding them is the single highest-leverage fix for the weekend-stale problem.

## Required secrets (Settings → Secrets and variables → Actions → New repository secret)
| secret | used by | purpose |
|---|---|---|
| `ODDS_API_KEY` | `mlb-daily.yml`, `world-cup-odds.yml`, `ufc-odds-refresh.yml`, refresh | sportsbook odds (MLB/WC/UFC moneylines) |
| `API_FOOTBALL_KEY` | `world-cup-odds.yml`, refresh | World Cup schedule + fixtures |
| `VERCEL_DEPLOY_HOOK_URL` | `daily-rebuild.yml` | trigger the production rebuild/deploy (advances the static clock) |
| `BALLDONTLIE_API_KEY` | (NBA, off-season) | optional; not needed now |

## Existing workflows this activates
- `daily-refresh.yml` (cron `0 13 * * *`) + `morning-projections.yml` — refresh the daily slate.
- `mlb-daily.yml`, `world-cup-odds.yml`, `world-cup-stats-discovery.yml` — sport ingests.
- `nightly-settle.yml` — settle supported markets overnight (paper/internal only; money-guarded).
- `daily-rebuild.yml` — Vercel deploy hook (advances the freshness clock).
- `ufc-pre-card.yml` / `ufc-post-card.yml` / `ufc-odds-refresh.yml` / `ufc-fighter-stats-refresh.yml`.

## Safety invariants the workflows already enforce
- **Never print secrets.** Fail-closed if a key is missing (the step no-ops with a `::notice::`).
- **Money-guarded:** the refresh md5-guards `portfolio.json`; the official 19-14 / $0 is never mutated.
- **Health/forensic gated** before any deploy.
- **Empty-slate safe** (this pass): the refresh skips MLB team markets + sims on a 0-game day and exits 0.

## Recommendation
Add `ODDS_API_KEY`, `API_FOOTBALL_KEY`, and `VERCEL_DEPLOY_HOOK_URL`. Then the site refreshes + (optionally)
deploys itself every morning and settles overnight — no more 2-day-stale weekends. Until then, run
`bash scripts/refresh_daily_products.sh --date <YYYY-MM-DD>` manually with the local `.env` when a real slate
is live (next full slate ≈ July-17 when MLB resumes; WC semifinals July-14/15).
