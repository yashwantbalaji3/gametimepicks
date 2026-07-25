# July-13+ Daily Automation Status (2026-07-12)

> ## ⚠️ SUPERSEDED — this snapshot is out of date (checked 2026-07-24)
>
> Everything below described the state **before the repo secrets were added**. It is kept for history only.
> Do not use it to decide whether automation is running — it will tell you "dormant" when the pipeline has in
> fact been publishing daily for weeks.
>
> **Verified live as of 2026-07-24**, by bot commit history on `main`:
> `morning-projections.yml`, `mlb-daily-production.yml`, `mlb-pregame-capture.yml` (8 runs/day) and
> `nightly-settle.yml` all run on schedule. `gtp-mlb-production-bot` has committed a slate every day.
>
> Genuinely dormant: `daily-lifecycle.yml` (needs `ENABLE_AUTONOMOUS_DEPLOY`), `daily-rebuild.yml` (needs
> `VERCEL_DEPLOY_HOOK_URL`), `mlb-daily.yml` (superseded by `mlb-daily-production.yml`).
>
> **Current source of truth: `docs/MLB_DAILY_PIPELINE.md`.**

## Historical status as of 2026-07-12: DORMANT (fail-closed), pipeline is now empty-slate-safe
The daily workflows exist but **no-op until the repo secrets are added** (they never run, so nothing is
half-done or fabricated). The refresh they call is now hardened so a 0-game MLB day (All-Star break) does not
crash it (Pass 1) and the public UI degrades honestly on a no-games day (Pass 2).

| workflow | trigger | state | needs |
|---|---|---|---|
| `daily-refresh.yml` | cron `0 13 * * *` | dormant | `ODDS_API_KEY`, `API_FOOTBALL_KEY` |
| `morning-projections.yml` | cron | dormant | same |
| `mlb-daily.yml` / `world-cup-odds.yml` | cron | dormant | `ODDS_API_KEY` (+ `API_FOOTBALL_KEY` for WC) |
| `nightly-settle.yml` | cron | dormant | official-gated; no key needed to no-op |
| `daily-rebuild.yml` | cron | dormant | `VERCEL_DEPLOY_HOOK_URL` (advances the static clock) |
| `ufc-*` (pre/post-card, odds, stats) | schedule | dormant | `ODDS_API_KEY` |

## Required secrets (exact names)
```
ODDS_API_KEY           # MLB / WC / UFC sportsbook odds
API_FOOTBALL_KEY       # World Cup schedule + fixtures
VERCEL_DEPLOY_HOOK_URL # production rebuild/deploy (advances the freshness clock)
```
`BALLDONTLIE_API_KEY` is optional (NBA off-season).

## Required automation behavior (already enforced by the scripts)
- **0 MLB games → no crash.** The refresh computes the board game count and skips team markets + sims on an
  empty board, printing an honest All-Star-break note and exiting 0 (`refresh-empty-slate-guard.test.mjs`).
- **No finals → nightly settle no-ops** (official-gated; never marks pending as loss).
- **Missing secret → fail closed** (step no-ops with a `::notice::`; secrets never printed).
- **Money md5 guard** enforced on every refresh (`portfolio.json` = `affe6b21…`); **health/forensic gate**
  before any deploy.

## Why the site currently shows July-12 as "no games today"
Real ET date is 2026-07-12. Newest committed slate is July-11 (QFs). MLB is between the first half and the
All-Star break; WC is between the quarterfinals and the semifinals (Jul 14/15). So there genuinely are no games
today — the site now says exactly that (see the liveness banner) instead of presenting July-11 as live. A full
slate returns when MLB resumes (~July-17); WC semifinals are July 14 & 15.

## Recommendation
Add the three secrets. Until then, run `bash scripts/refresh_daily_products.sh --date <YYYY-MM-DD>` manually
with the local `.env` when a real slate is live. The site will not go stale-as-live in the meantime — the
liveness banner keeps every current page honest against the real ET clock.
