# Platform Vendor & API Inventory — Program 084–087 (2026-07-31)

Canonical inventory of every external provider/service the platform references. **A provider is
listed ACTIVE only where a current workflow, runtime route, or artifact generator actually calls
it.** Secret NAMES are cited; values were never read or printed. Billing evidence states are
honest: `UNKNOWN` is never treated as zero — see `CURRENT_COST_BASELINE.md`.

## 1. Paid / metered providers

| Provider | Category | Purpose | Sport | Code location | Called from | Status | Billing evidence |
|---|---|---|---|---|---|---|---|
| **The Odds API** (`api.the-odds-api.com/v4`) | Sportsbook odds + player props (credit-metered) | Board odds, player props, team markets, pregame market snapshots | MLB today (NBA/UFC/WC/EPL/IPL code paths exist) | `pipeline/providers/odds_api_provider.py`, `pipeline/mlb/mlb_odds.py`, `app/scripts/ingest-mlb-slate.mjs`, `app/scripts/ingest-mlb-team-markets.mjs`, capture scripts | `morning-projections` (1×/day), `mlb-daily-production` (1–2×/day); a dozen dormant dispatch-only workflows | **ACTIVE_PRODUCTION** — the only paid API wired end-to-end | Credit ledger in generated boards: 19,982 → 10,300 during July (~9,700 credits). Quota consistent with the public **20K/mo ($30/mo)** tier — plan/invoice needs founder confirmation |
| **API-Football** (`v3.football.api-sports.io`, key `API_FOOTBALL_KEY`) | Soccer fixtures/results/lineups | World Cup settlement + lineups (WC retired); EPL results candidate | Soccer | `pipeline/world_cup/providers/api_football.py`, `pipeline/fetch_official_soccer.py`, `scripts/settle_soccer_day.sh` | `nightly-settle`, `daily-lifecycle` (key passed; WC steps no-op post-closeout); WC workflows dispatch-only | **LEGACY / event-scoped** — no scheduled paid usage since WC closeout | **UNKNOWN plan** (free tier vs paid) — founder evidence needed |
| **balldontlie** (`api.balldontlie.io`, key `BALLDONTLIE_API_KEY`) | NBA stats API | NBA fallback provider | NBA | `pipeline/providers/balldontlie_provider.py` | Key passed by `daily-lifecycle`/`morning-projections`, but `ENABLE_BALLDONTLIE_FALLBACK` defaults **false** (`pipeline/config.py:99`) | **CONFIGURED_UNUSED** | **UNKNOWN plan** — founder evidence needed |

## 2. Free external data sources (no key)

| Provider | Purpose | Sport | Code location | Called from | Status |
|---|---|---|---|---|---|
| **MLB StatsAPI** (`statsapi.mlb.com`) | Schedule, identity (gamePk), linescores, official settlement | MLB | `pipeline/mlb/mlb_stats.py`, `pipeline/mlb/settle_mlb_results.py`, ~32 `app/scripts/*` capture/join scripts | `mlb-pregame-capture` (7–8×/day), `mlb-daily-production`, `nightly-settle`, `mlb-research-integration` | **ACTIVE — highest-volume source, $0** |
| **ESPN site APIs** (`site.api.espn.com`, `site.web.api.espn.com`) | Scoreboards, schedules, gamelogs | NBA, UFC, soccer, cricket | `pipeline/providers/espn_provider.py`, `pipeline/ufc/build_schedule.py` | NBA fallback (`ENABLE_ESPN_FALLBACK` default on; `NBA_DATA_PROVIDER=espn_scoreboard` repo var); UFC dispatch-only | Active (fallback) |
| **stats.nba.com** (via `nba_api` pip) | NBA player stats / recent-form | NBA | `pipeline/providers/nba_api_provider.py`, `pipeline/attach_recent10.py` | `auto-refresh` (9×/day), `morning-projections` | Active — source of the offseason hang fixed this program |
| **Greco1899/scrape_ufc_stats** (GitHub raw CSV) | UFC fighter stats | UFC | `pipeline/ufc/providers/ufcstats_csv.py` | dispatch-only workflows | Dormant |
| **Image CDNs**: `img.mlbstatic.com`, `midfield.mlbstatic.com`, `cdn.nba.com`, `a.espncdn.com`, `media.api-sports.io` | Headshots/logos | all | `app/src/lib/player-headshots.ts`, `app/src/components/team-logo.tsx` | Browser runtime (`<img>` src) | Active, $0 |
| **Google Fonts** (`fonts.googleapis.com`) | Webfonts | n/a | `app/src/app/globals.css:10` | Browser runtime | Active, $0 |

## 3. Infrastructure / SaaS

| Service | Purpose | Evidence | Status | Billing evidence |
|---|---|---|---|---|
| **Vercel** | Hosting + build of the static export (`gametimepicks.yashwantbalaji.com`, `gametime-picks.vercel.app`) | Git integration on `main`; **builds every push** (proven: a scripts-only commit was built 24 s after push on 2026-07-31); no serverless functions, KV, Blob, or Vercel Analytics | ACTIVE_PRODUCTION | **UNKNOWN plan** (Hobby $0 vs Pro $20/mo) — founder evidence needed |
| **GitHub** | Repo (PUBLIC), Actions CI (~26 scheduled runs/day), artifact storage | `gh repo view`: public; standard `ubuntu-latest` runners | ACTIVE_PRODUCTION | **$0 verified for Actions minutes + artifact storage** (public repo). Account plan (Free vs Pro) unverified — founder |
| **Domain** | `gametimepicks.yashwantbalaji.com` is a subdomain of the founder's personal `yashwantbalaji.com` | `app/src/app/layout.tsx:24` | ACTIVE | Registrar renewal on the personal domain — founder evidence (redacted invoice) |
| **Buttondown** (`buttondown.email` embed-subscribe) | Newsletter signup form | `app/src/lib/newsletter.ts` — active only if `NEXT_PUBLIC_BUTTONDOWN_USERNAME` is set at build; otherwise renders honest "coming soon", no data captured | CONFIGURED-CONDITIONAL | **UNKNOWN** whether the Vercel env var is set / account exists — founder |
| **Ops webhook** (provider unknown by design) | Failure alerting via `OPS_WEBHOOK_URL` | `scripts/ops_alert.sh`; 5 workflows wired | ACTIVE (DELIVERY_PROVEN 2026-07-31) | Founder-owned endpoint; assumed free tier — founder confirms |
| **Analytics** | None active. First-party contract approved, endpoint pending | `app/src/lib/analytics/` (NOOP sink) | APPROVED_NOT_CONFIGURED | $0 (nothing provisioned) |
| **Database / object storage / queue / monitoring SaaS** | **None exist.** No boto3/psycopg/supabase/firebase/redis/Sentry/PostHog/GA anywhere; persistence is git-committed JSON | verified by dependency + import sweep | — | $0 verified |

## 4. Stubs and never-implemented providers

| Provider | State |
|---|---|
| OpticOdds (`OPTICODDS_API_KEY`, `ENABLE_OPTICODDS=false`) | Stub — provider raises "not implemented"; registered in `pipeline/providers/registry.py` |
| SportsData.io (`SPORTSDATA_API_KEY`, `ENABLE_SPORTSDATA=false`) | Stub — never implemented |
| `.env.example`-only placeholder keys (`HISTORICAL_DATA_PROVIDER_KEY`, `INJURIES_LINEUPS_KEY`, `ODDS_CONSENSUS_KEY`, `PLAYER_PROPS_PROVIDER_KEY`, `SOCCER_STATS_PROVIDER_KEY`, `SPORTS_DATA_PROVIDER_KEY`) | No code reads them |
| Beehiiv / Loops / Mailchimp | Doc-comment alternatives in `newsletter.ts`; not wired |

## 5. Findings carried to the waste register

- **Key-name drift:** `THE_ODDS_API_KEY` is a live fallback alias (`pipeline/config.py:122`) and the
  only name set by `lineup-aware-refresh.yml:93` — two names for one credential invites silent
  "key not set" skips.
- Root `.env` holds real keys locally; verified `.gitignore:35` covers it and it has **never been
  tracked** in git history.
- The paid surface is far smaller than the workflow count suggests: 13 of 22 workflows are
  dormant (dispatch-only), and repo-wide `ODDS_DRY_RUN=true` + unset `PREGAME_ARCHIVE_MARKETS`
  vars keep the high-frequency workflows credit-free.
