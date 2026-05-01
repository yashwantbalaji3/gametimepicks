# GametimePicks

> Educational sports prop analytics lab. Compares model projections against
> sportsbook lines for NBA player props, surfaces transparent model leans
> with explanations, and tracks every result publicly.

**Live demo:** [gametimepicks.yashwantbalaji.com](https://gametimepicks.yashwantbalaji.com)
*(Pending Vercel deployment.)*

> ⚠️ **Not betting advice. Educational analytics project. No guarantees.**
> Past performance does not predict future results. Use responsibly.

## Screenshots

```
visuals/
├── home.png            ← hero + KPI strip
├── board.png           ← Model Board with filter bar open
├── trends.png          ← Player Trends with sparklines
├── results.png         ← hit-rate breakdowns + calibration scatter
├── methodology.png     ← flow diagram + formulas
├── data-source.png     ← Data Source badge close-up
└── mobile-board.png    ← /board on mobile viewport
```

*(Screenshots will be added after deployment.)*

## What this project does

For each NBA player prop on the day's slate (Points, Rebounds, Assists), the
pipeline:

1. Pulls game logs and team stats from `nba_api` (the official NBA Stats endpoints)
2. Pulls live sportsbook odds and player-prop lines from The Odds API
3. Produces a projection by blending L5 / L10 / season averages plus a home/away adjustment
4. Computes implied probability from the de-vigged sportsbook odds
5. Quantifies edge as `model_probability − implied_probability`
6. Assigns a confidence tier (High / Medium / Low) based on edge magnitude AND data-quality sanity check
7. Writes everything to JSON files the frontend reads at build time

The frontend is a Next.js 14 App Router site that renders six routes —
Home, Model Board, Player Trends, Results, Methodology, Responsible Use —
with filters, sparklines, charts, and a persistent disclaimer banner.

## Why this exists

Sports betting analytics is a noisy space full of paid-tipster services
selling "locks" and certainty. There's plenty of money in selling certainty
even when there isn't any. GametimePicks goes the other way: it shows the
methodology, publishes every prediction with explanations, tracks every
outcome, and acknowledges every limitation.

It's a portfolio project that demonstrates end-to-end product engineering —
data pipeline, model, frontend, deployment — applied to a domain where
transparency matters more than performance claims.

## Architecture

```
┌──────────────────┐    JSON files    ┌──────────────────┐
│  Python pipeline │ ────────────────▶│  Next.js frontend│
│                  │                  │  (App Router)    │
│  • nba_api       │  app/public/data │  • TypeScript    │
│  • The Odds API  │  ─────────────▶  │  • Tailwind CSS  │
│  • providers/    │  • board.json    │  • static export │
│  • model         │  • trends.json   │                  │
│                  │  • meta.json     │  • six routes    │
│                  │  • etc.          │  • client filters│
└──────────────────┘                  └──────────────────┘
```

The pipeline runs offline (manually, or via a cron later), produces JSON files
into `app/public/data/`, and the static site is built from those files. This
keeps the deployment fast, cheap, and decouples data work from UI work.

## Data modes

The pipeline reports its mode in `meta.json` and the UI shows it via a Data
Source badge on the Model Board and Methodology pages.

| Mode | Trigger | What you see |
|---|---|---|
| **Demo** | No API keys configured, or `NBA_DATA_MODE=demo` and `ODDS_DATA_MODE=demo` | Bundled demo data — realistic numbers, not from tonight's slate |
| **Live** | `ODDS_API_KEY` set + `nba_api` reachable | Tonight's actual schedule, real game logs, real sportsbook odds |
| **Hybrid** | One source live, the other fell through to demo | Useful when NBA.com hiccups or the odds API is rate-limited |

The app **always renders something**. If every external provider fails, the
demo provider takes over and the UI shows "Demo" mode. Nothing breaks.

## Provider system

GametimePicks uses a pluggable multi-source provider architecture. Adding a
new source means writing one adapter file that implements the standard
interface; the registry handles failover automatically.

### NBA stats providers

| Provider | Tier | Status | Requires key |
|---|---|---|---|
| **nba_api** | 1 | ✅ Full | No |
| **demo** | 1 | ✅ Full | No |
| balldontlie | 2 | 🔧 Scaffold | Yes |
| sportsdata_nba | 2 | 🔧 Scaffold | Yes |
| espn | 3 | 🔧 Scaffold | No |

### Odds providers

| Provider | Tier | Status | Requires key |
|---|---|---|---|
| **the_odds_api** | 1 | ✅ Full | Yes |
| **demo** | 1 | ✅ Full | No |
| opticodds | 2 | 🔧 Scaffold | Yes |
| sportsdata_odds | 2 | 🔧 Scaffold | Yes |

Scaffolded providers exist as adapter shells with the correct interface and
env-var wiring; they raise `NotImplementedError` until you fill them in. This
documents the intended extensibility without committing to maintaining seven
live integrations.

### Compliance

- ✅ Official APIs only (`nba_api` library, `the-odds-api.com`, etc.)
- ✅ All keys via environment variables; nothing hardcoded
- ✅ Cache responses to be a good API citizen (12-hour file cache)
- ❌ No scraping of DraftKings, FanDuel, ESPN HTML, theScore app, or any sportsbook page
- ❌ No reverse-engineered mobile-app endpoints
- ❌ No unofficial APIs that require bypassing access controls

## Local setup

You need:
- **Python 3.10+** for the pipeline
- **Node.js 18+** for the frontend
- *(optional)* an Odds API key (free tier 500 req/mo)

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/gametimepicks
cd gametimepicks

# Frontend
cd app
npm install
cd ..

# Pipeline (creates a virtualenv on first run)
bash scripts/run_pipeline.sh
```

That's it. The pipeline runs in demo mode by default — no keys required —
and writes JSON into `app/public/data/`.

### 2. Run the dev server

```bash
cd app
npm run dev          # http://localhost:3000
```

You should see all six pages with demo data, a persistent disclaimer banner,
and a "Demo" badge in the Data Source widget.

### 3. Switch to live data

```bash
cp .env.example .env
# Edit .env: paste ODDS_API_KEY=<your-key> and unset NBA_DATA_MODE / ODDS_DATA_MODE
bash scripts/run_pipeline.sh
cd app && npm run build
```

The Data Source badge will now show "Live" or "Hybrid" depending on which
providers came through.

## Pipeline commands

```bash
# Run the full pipeline (default = today)
bash scripts/run_pipeline.sh

# Run for a specific date
bash scripts/run_pipeline.sh 2026-04-30

# Just the board generator (assumes venv exists)
python -m pipeline.generate_daily_board

# Settle yesterday's pending leans (no-op in demo mode)
python -m pipeline.settle_results

# Smoke test (verifies JSON outputs exist and are valid)
bash scripts/smoke_test.sh
```

## Frontend commands

```bash
cd app
npm run dev          # development server
npm run typecheck    # TypeScript strict check
npm run build        # static export → app/out/
npm run lint         # Next.js lint
npm start            # serves app/out/ via `npx serve` (after build)
```

## Deployment overview

GametimePicks is designed for Vercel (or any static host). Full instructions
in [`docs/deploy.md`](docs/deploy.md). Short version:

1. Push to GitHub
2. Import the repo in Vercel
3. Set root directory to `app`, build command `npm run build`
4. Add env vars (optional — site builds without them)
5. Deploy
6. Add `gametimepicks.yashwantbalaji.com` as a custom domain in Vercel
7. Add a CNAME record at your DNS provider pointing to Vercel's target

For data refresh in v1: run the pipeline locally, commit the updated JSON,
push. Vercel redeploys automatically.

## Limitations

This is a v1 portfolio project. Honest limitations:

- **No injury / minutes adjustment.** The model treats projected minutes as
  constant. Late scratches change inputs, but the board doesn't refresh
  intraday.
- **No back-to-back / rest adjustment.** Travel and fatigue impact production
  but aren't modeled.
- **Lines move.** The board reflects odds at pipeline time; by the time you
  read it, lines have shifted.
- **No causal claims.** A positive edge is correlation between recent stats
  and the line, not a guarantee the prop will hit.
- **No ROI shown.** Hit rate alone isn't profit (vig means break-even on -110
  is ~52.4%). ROI is intentionally omitted until the methodology supports it
  rigorously.
- **Settlement is a framework, not yet wired with `gameId`.** See
  `pipeline/settle_results.py`.

## Future work

In rough priority order:

- Wire `gameId` onto leans so `settle_results.py` can do real settlement
  against the official box score
- Implement BallDontLie or OpticOdds as a real Tier 2 fallback
- Daily refresh via GitHub Actions (cron + commit)
- Injury-aware projection adjustment
- Pace and rest-day features
- Optional ROI tracking once the methodology is robust enough
- WNBA support (same pipeline shape, different provider config)

## Recruiter / interviewer notes

This project is intentionally end-to-end:

- **Pipeline engineering** — Multi-source provider abstraction, registry-based
  failover, TTL caching, normalized data shapes via dataclasses,
  fail-gracefully orchestration.
- **Modeling** — Explainable projection model, normal-distribution
  probability over a sportsbook line, two-sided de-vigging, sample-size-gated
  confidence tiers. No black boxes.
- **Frontend product engineering** — Next.js App Router with strict
  TypeScript, static export deployment, server/client component split,
  filterable interactive board, custom SVG sparklines and calibration
  scatter, broadcast-style design system.
- **Production hygiene** — `.env`-driven configuration, no hardcoded secrets,
  comprehensive `.gitignore`, smoke test script, persistent disclaimer
  banner, responsible-use page, clearly labeled demo/live/hybrid data modes.

The model itself isn't novel; that's deliberate. The point is the surrounding
architecture and the discipline of building a transparent, honest
data-product instead of a black-box-with-marketing.

## Repo structure

```
gametimepicks/
├── README.md              ← you are here
├── LICENSE                ← MIT
├── .env.example           ← all environment variables documented
├── .gitignore
│
├── app/                   ← Next.js 14 App Router frontend
│   ├── package.json
│   ├── next.config.mjs    ← static export
│   ├── tsconfig.json      ← strict mode
│   ├── tailwind.config.ts ← broadcast palette
│   ├── public/data/       ← JSON files the pipeline writes
│   └── src/
│       ├── app/           ← page routes (6 routes)
│       ├── components/    ← 17 reusable UI components
│       └── lib/           ← types, data loaders, formatters
│
├── pipeline/              ← Python data pipeline
│   ├── config.py          ← single env-var entry point
│   ├── providers/         ← multi-source adapter system
│   │   ├── base.py        ← abstract interfaces + dataclasses
│   │   ├── registry.py    ← provider-chain selection
│   │   ├── demo_provider.py        ← Tier 1 (full)
│   │   ├── nba_api_provider.py     ← Tier 1 (full)
│   │   ├── odds_api_provider.py    ← Tier 1 (full)
│   │   ├── balldontlie_provider.py ← Tier 2 (scaffold)
│   │   ├── espn_provider.py        ← Tier 3 (scaffold)
│   │   ├── opticodds_provider.py   ← Tier 2 (scaffold)
│   │   └── sportsdata_provider.py  ← Tier 2 (scaffold)
│   ├── fetch_nba_schedule.py  ← orchestrators (failover)
│   ├── fetch_nba_data.py
│   ├── fetch_odds_data.py
│   ├── build_features.py      ← rolling avgs, splits, dispersion
│   ├── score_model.py         ← projection + probability + edge
│   ├── generate_daily_board.py ← main entry point
│   ├── settle_results.py      ← real settlement framework
│   └── demo_data/             ← bundled offline fallback (committed)
│
├── scripts/
│   ├── run_pipeline.sh    ← venv + install + generate + settle
│   └── smoke_test.sh      ← verifies pipeline + JSON outputs
│
├── docs/
│   ├── deploy.md
│   ├── project_brief.md
│   ├── portfolio_integration.md
│   ├── screenshots.md
│   └── social_templates.md
│
└── visuals/               ← screenshots (added post-deploy)
```

## License

MIT — see [LICENSE](./LICENSE).
