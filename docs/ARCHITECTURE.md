# Architecture

## High level

```
ESPN / NHL / MLB Stats API / The Odds API   (public feeds; Odds API is paid)
        │
        ▼
pipeline/ (Python, run by GitHub Actions)   →  app/public/data/*.json (generated)
        │                                          │
        ▼                                          ▼
 settlement / grading / audit                Next.js static export (app/)
        │                                          │
        └──────────────► app/public/data ◄─────────┘
                                  │
                                  ▼
                         Vercel (static hosting)
                gametimepicks (gate)  +  gametime-picks (legacy)
```

The frontend is a **static export** — it reads pre-generated JSON from
`app/public/data/`. There are **no live network calls from the browser** for
picks/schedules; everything is baked by the pipeline.

## Frontend (`app/`)

- **Next.js** App Router, `output: "export"`, `trailingSlash: true`,
  `images.unoptimized: true`. Gold/vault theme (369 `--vault-*` / `--gtp-*`
  CSS variables in `globals.css`; Geist + JetBrains Mono).
- **Layout:** desktop Command Center left rail (`command-rail.tsx`) +
  persistent `slate-status-bar.tsx`; mobile top `nav.tsx` (< lg) +
  `mobile-bottom-nav.tsx`.
- **Key routes:** `/` (`app/page.tsx`), `/projections`, `/parlay-lab`,
  `/bank-builder`, `/results`, `/events`, `/world-cup`, `/nhl`, `/ipl`,
  `/about`.
- **Key components:** `parlay-lab-builder.tsx` (suggested/build/bankroll
  modes, filters, Build My Card), `risk-section-spread.tsx`,
  `parlay-ticket-card.tsx`, `sports-coverage-board.tsx`,
  `home-path-cards.tsx`, `home-sports-coverage.tsx`.
- **Key libs (`app/src/lib`):** `parlay-suggested.ts`,
  `parlay-risk-sections.ts`, `parlay-volume-discipline.ts` (PR #241),
  `leg-quality-gates.ts` (inert proposal), `parlay-decorrelation.ts` (inert
  proposal), `sports-coverage.ts`, `sport-capabilities.ts` (typed capability
  gates derived from `sports-coverage.ts` — `canShowProjections` /
  `canShowSuggestedParlays` / `canUseInBuildYourOwn` / `canGradeSport` + the
  mixed-sport rules; see `SPORTS_PROJECTIONS_EXPANSION_PLAN_2026-06-02.md`),
  `projection-availability.ts` (actionable-vs-prop-line + latest-actionable
  default date, PR 1), `build-a-parlay-config.ts` (Quick Generate / Manual
  Build switch + modeled-only sport scope, PR 3), `event-schedules.ts`,
  `data-parlays.ts`, `data-projections.ts`, `parlay-results.ts`,
  `public-parlay-era.ts`, `nav-active-route.ts`, `freshness.ts`.
- **Tests:** `app/src/lib/*.test.mjs` run via `npx tsx --test` (590 as of
  main `5a1777d`).
- **Offline analysis scripts (not bundled):** `app/scripts/*.mjs` —
  `shadow-audit-quality-gates.mjs`, `model-calibration-analysis.mjs`,
  `shadow-volume-discipline.mjs`.

## Backend / data pipeline (`pipeline/`)

- **Projection generation:** `generate_daily_board.py` (NBA),
  `mlb/generate_mlb_board.py` + `mlb/mlb_model.py` (MLB); recent-form via
  `attach_recent10`. Odds/lines via **The Odds API** (paid, credit-guarded
  by `pipeline/credit_guard.py`).
- **Optimizer:** `parlay_optimizer.py` builds risk-profile lanes +
  `generate_public_risk_sections`; `snapshot_optimizer.py` writes the
  optimizer snapshot.
- **Settlement / grading:** `settle_results.py` (NBA, ESPN + nba_api),
  `mlb/settle_mlb_results.py` (MLB Stats API), `grade_optimizer.py`,
  `grade_parlays.py`, `grade_curated.py`, `export_results.py`,
  `model_audit.py`.
- **Learning audit (observational):** `audit_daily.py`,
  `audit_signal_policy.py` → `app/public/data/audit/policy.json`. **Not
  consumed by the optimizer** (see `MODEL_AND_OPTIMIZER.md`).
- **Orchestrator:** `scripts/automation_settle.sh`.

## Generated data (`app/public/data/`)

- `boards/<date>.json` (NBA), `mlb/boards/<date>.json` (MLB) — projection
  boards.
- `parlays/optimizer/<date>.json` + `parlays/snapshots/<date>.json` — the
  active pregame optimizer snapshot (includes `publicRiskSections`).
- `parlays/graded/<date>.json` + `parlays/optimizer-graded/<date>.json` +
  `parlays/optimizer-summary.json` — settled/graded artifacts.
- `results/`, `mlb/results/`, `audit/daily/`, `audit/policy.json` — results
  + audit artifacts.
- Schedules: `world-cup/`, plus baked snapshots in `event-schedules.ts`.

## Automation (GitHub Actions)

| Workflow | Cron (UTC) | ET | Purpose |
|----------|-----------|----|---------|
| `nightly-settle.yml` | `0 7 * * *` | 3 AM | settle prior slate + grade + audit; commits data |
| `morning-projections.yml` | `30 13 * * *` | 9:30 AM | generate today's boards/optimizer (paid Odds API) |
| `auto-refresh` | periodic | — | props-only board refresh |

Settlement uses **free** public APIs (no secrets); morning projections
require `secrets.ODDS_API_KEY` and are credit-guarded.

## Deployment

- **Vercel**, two projects: `gametimepicks` (authoritative gate) +
  `gametime-picks` (legacy duplicate). Each PR builds both.
- **Merge gate:** real `Vercel – gametimepicks` SUCCESS **and**
  `mergeStateStatus = CLEAN`; squash-merge; sync `main` after every merge.
- Data commits from `nightly-settle`/`auto-refresh` land directly on `main`
  (`[skip ci]`); they are not PR-gated.

## Environment assumptions

- Repo path: `/Users/yashwantbalaji/Downloads/gametimepicks`.
- Python pipeline venv: `pipeline/.venv`.
- The sandbox/CI clock runs on the 2026 timeline; public ESPN/NHL/MLB feeds
  return matching 2026 data (this is why real schedule sourcing is possible
  and verifiable).
