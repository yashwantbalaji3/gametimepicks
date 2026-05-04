# GametimePicks

> Educational sports prop analytics lab. A Python data pipeline + Next.js
> interface that compares model projections against sportsbook lines for NBA
> player props, surfaces transparent model leans with explanations, and
> tracks results in a public daily-board format.

**Live demo →** [gametimepicks.yashwantbalaji.com](https://gametimepicks.yashwantbalaji.com/)
**Source →** [github.com/yashwantbalaji3/gametimepicks](https://github.com/yashwantbalaji3/gametimepicks)
**Vercel fallback →** [gametime-picks.vercel.app](https://gametime-picks.vercel.app/)

> ⚠️ **Currently running in demo mode.** The pipeline architecture, model
> formulas, and provider system are real. The data flowing through them is
> bundled sample data — not tonight's NBA slate. **Not betting advice. No
> guarantees. Educational analytics only.**

## Status

| | |
|---|---|
| **Phase** | v1 live — public demo foundation |
| **Mode** | Demo (sample data, no live API keys configured) |
| **Live since** | May 2026 |
| **Next milestone** | Real NBA data pipeline validation + Odds API integration |

## What this project does

For each NBA player prop on a given slate (Points, Rebounds, Assists), the
pipeline:

1. Pulls game logs and team stats from `nba_api` (the official NBA Stats endpoints) — *real interface, demo data flowing through it for now*
2. Pulls sportsbook odds and player-prop lines from The Odds API — *same: real interface, demo data for now*
3. Produces a projection by blending L5 / L10 / season averages plus a home/away adjustment
4. Computes implied probability by stripping vig from the sportsbook odds
5. Quantifies edge as `model_probability − implied_probability`
6. Assigns a confidence tier (High / Medium / Low) based on edge magnitude AND data-quality sanity check
7. Writes everything to JSON files the frontend reads at build time

The frontend is a Next.js 14 App Router site that renders six routes —
Home, Model Board, Player Trends, Results, Methodology, Responsible Use —
with filters, sparklines, charts, and a persistent disclaimer banner.

## Architecture

```
┌──────────────────┐     JSON contract     ┌──────────────────┐
│  Python pipeline │ ────────────────────▶ │  Next.js frontend│
│                  │                       │                  │
│  • providers/    │   app/public/data/    │  • App Router    │
│  • model         │   ─────────────────▶  │  • TypeScript    │
│  • orchestration │   • board.json        │  • Tailwind      │
│                  │   • trends.json       │  • static export │
│                  │   • meta.json + 4 more│                  │
└──────────────────┘                       └──────────────────┘
```

The pipeline runs offline (manually for v1, scheduled later), produces JSON
files into `app/public/data/`, and the static site is built from those
files. This keeps the deployment fast, cheap, and decouples data work from
UI work.

## Data modes

The pipeline reports its mode in `meta.json` and the UI shows it via a Data
Source badge on the Model Board and Methodology pages.

| Mode | Trigger | What it shows |
|---|---|---|
| **Demo** *(current)* | No API keys, or `*_DATA_MODE=demo` | Bundled sample data — realistic numbers from a representative day |
| **Live** | `ODDS_API_KEY` set + `nba_api` reachable + modes set to `auto` | Tonight's actual schedule, real game logs, real sportsbook odds |
| **Hybrid** | One source live, the other fell through to demo | Useful when NBA.com hiccups or the odds API is rate-limited |

The site **always renders something**. If every external provider fails,
the demo provider takes over and the UI shows "Demo" mode honestly.

## Provider system

Pluggable multi-source provider architecture. Adding a new source means
writing one adapter file that implements the standard interface; the
registry handles failover.

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

Scaffolded providers exist as adapter shells with the correct interface
and env-var wiring; they raise `NotImplementedError` until you fill them
in. This documents the intended extensibility without committing to
maintaining seven live integrations.

### Compliance

- ✅ Official APIs only (`nba_api` library, `the-odds-api.com`)
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
git clone https://github.com/yashwantbalaji3/gametimepicks
cd gametimepicks

# Frontend
cd app
npm install
cd ..

# Pipeline (creates a virtualenv on first run)
bash scripts/run_pipeline.sh
```

### 2. Run the dev server

```bash
cd app
npm run dev          # http://localhost:3000
```

You'll see all six pages with demo data, a persistent disclaimer banner,
and a "Demo" badge in the Data Source widget.

### 3. Switch to live data (when ready)

```bash
cp .env.example .env
# Edit .env: paste ODDS_API_KEY=<your-key>, set NBA_DATA_MODE=auto, ODDS_DATA_MODE=auto
bash scripts/run_pipeline.sh
cd app && npm run build
```

## Pipeline commands

```bash
# Full pipeline (default = today)
bash scripts/run_pipeline.sh

# Specific date
bash scripts/run_pipeline.sh 2026-04-30

# Just the board generator
python -m pipeline.generate_daily_board

# Settle yesterday's pending leans (no-op in demo mode)
python -m pipeline.settle_results

# Smoke test
bash scripts/smoke_test.sh
```

## Frontend commands

```bash
cd app
npm run dev          # development server
npm run typecheck    # TypeScript strict check
npm run build        # static export → app/out/
npm run lint         # Next.js lint
```

## Deployment

GametimePicks is deployed on Vercel as a separate project. Source: this
repo. Custom domain: `gametimepicks.yashwantbalaji.com`. Build command:
`npm run build` from root directory `app`.

For data refresh in v1: run the pipeline locally, commit the updated
JSON, push. Vercel redeploys automatically. Full deploy guide at
[`docs/deploy.md`](docs/deploy.md).

## Roadmap

### Now (v1 — public demo foundation)

- ✅ Pipeline + provider architecture
- ✅ Model board interface
- ✅ Player trends + results + methodology pages
- ✅ Demo data foundation
- ✅ Public deployment + custom domain
- 🔧 Public polish + portfolio integration *(in progress)*

### Next

- Validate real NBA data feed via `nba_api` end-to-end
- Add Odds API key + verify live-mode pipeline
- Build live/hybrid mode in production
- Iterate on the projection model with real data
- Wire `gameId` onto leans + complete settlement logic

### Later

- Scheduled daily refresh via GitHub Actions or cron
- Automated result tracking
- Model backtesting on historical seasons
- WNBA / MLB / NFL expansion if the architecture proves out
- *(future)* automated launch posts when there's something concrete to share

## Limitations

This is a v1 portfolio project running on demo data. Honest limitations:

- **The model has not been validated against real NBA data yet.** The
  formulas are sound and the sample edges look reasonable, but real-data
  accuracy is the next milestone, not a claim being made today.
- **No injury / minutes adjustment.** Late scratches change inputs.
- **No back-to-back / rest adjustment.** Travel and fatigue impact production.
- **Lines move.** The board reflects odds at pipeline time.
- **No causal claims.** A positive edge is correlation between recent stats
  and the line, not a guarantee.
- **No ROI shown.** Hit rate alone isn't profit (vig means break-even on -110
  is ~52.4%). ROI is intentionally omitted until the methodology supports
  it rigorously.

## Recruiter / interviewer notes

This project is intentionally end-to-end:

- **Pipeline engineering** — Multi-source provider abstraction,
  registry-based failover, TTL caching, normalized data shapes via
  dataclasses, fail-gracefully orchestration.
- **Modeling** — Explainable projection model, normal-distribution
  probability over a sportsbook line, two-sided de-vigging,
  sample-size-gated confidence tiers. No black boxes.
- **Frontend product engineering** — Next.js App Router with strict
  TypeScript, static export deployment, server/client component split,
  filterable interactive board, custom SVG sparklines and calibration
  scatter, broadcast-style design system.
- **Production hygiene** — `.env`-driven configuration, no hardcoded
  secrets, comprehensive `.gitignore`, smoke test script, persistent
  disclaimer banner, responsible-use page, clearly-labeled demo / live
  / hybrid data modes.

The model itself isn't novel; that's deliberate. The point is the
surrounding architecture and the discipline of building a transparent,
honest data product instead of a black-box-with-marketing.

## Repo structure

```
gametimepicks/
├── README.md              ← you are here
├── LICENSE                ← MIT
├── .env.example
├── .gitignore
│
├── app/                   ← Next.js 14 App Router frontend
│   ├── package.json
│   ├── next.config.mjs    ← static export
│   ├── public/data/       ← JSON files the pipeline writes
│   └── src/
│       ├── app/           ← page routes (6 routes)
│       ├── components/    ← reusable UI
│       └── lib/           ← types, data loaders, formatters
│
├── pipeline/              ← Python data pipeline
│   ├── providers/         ← multi-source adapter system
│   ├── build_features.py
│   ├── score_model.py
│   ├── generate_daily_board.py
│   ├── settle_results.py
│   └── demo_data/         ← bundled offline fallback (committed)
│
├── scripts/
│   ├── run_pipeline.sh
│   └── smoke_test.sh
│
├── docs/
│   ├── deploy.md
│   ├── project_brief.md
│   ├── portfolio_integration.md
│   ├── roadmap.md
│   ├── screenshots.md
│   └── social_templates.md
│
└── visuals/               ← screenshots
```

## License

MIT — see [LICENSE](./LICENSE).
