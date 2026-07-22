# MLB Daily Pipeline (2026-07-22)

The end-to-end daily MLB slate pipeline: from schedule/markets to the public slate, now **fully automated**. Money-independent throughout — nothing here writes bankroll / portfolio / official settlement. Money md5 `affe6b21071f2b3be96bb2774eb347c3`.

## Flow

```
StatsAPI schedule + Odds API markets + StatsAPI research captures
        │
        ▼
1. BOARD ─────────► app/public/data/mlb/boards/<date>.json  (+ schedule, power)
        │            scripts/automation_projections.sh → python -m pipeline.mlb.generate_mlb_board
        │            workflow: morning-projections.yml  (cron 13:30 UTC)   ✅ automated
        ▼
2. PREGAME ARCHIVE ► data/internal/mlb/pregame-archive/…  (13 leakage-safe families — INTERNAL research)
        │            app/scripts/capture-mlb-pregame-*.mjs
        │            workflow: mlb-pregame-capture.yml   (8 crons/day)      ✅ automated (research, independent)
        ▼
3. TEAM MARKETS ───► app/public/data/mlb/team-markets/<date>.json  (de-vigged h2h/spreads/totals → Game Center)
        │            app/scripts/ingest-mlb-team-markets.mjs  (PAID Odds API)
        ▼
4. PLAYER PROPS ───► app/public/data/mlb/player-props/<date>.json  (+ home-run-props)  (prop lines)
        │            app/scripts/ingest-mlb-slate.mjs  (PAID Odds API)
        ▼
5. SIMULATIONS ────► app/public/data/mlb/game-simulations/<date>.json  (10k-run sim: picks, distributions)
        │            app/scripts/generate-mlb-game-simulations.mjs  (FREE, deterministic, reads the board only)
        ▼
6. VERIFY ─────────► data/internal/mlb/pregame-archive/status/mlb-production-health.json  (slate status)
        │            app/scripts/mlb-slate-completeness-gate.mjs
        ▼
7. PUBLIC SLATE ───► /mlb /today /simulate /games/<slug>  (the app reads the artifacts above)
```

## Scripts

| step | script | cost | writes |
|---|---|---|---|
| board | `pipeline.mlb.generate_mlb_board` (via `scripts/automation_projections.sh`) | paid | `mlb/boards`, `mlb/schedule`, `mlb/power` |
| archive (research) | `app/scripts/capture-mlb-pregame-*.mjs` | free | `data/internal/mlb/pregame-archive/…` |
| team markets | `app/scripts/ingest-mlb-team-markets.mjs` | paid | `mlb/team-markets/<date>.json` |
| player props | `app/scripts/ingest-mlb-slate.mjs` | paid | `mlb/player-props`, `mlb/home-run-props`, `mlb/schedule` |
| simulations | `app/scripts/generate-mlb-game-simulations.mjs` | free | `mlb/game-simulations/<date>.json` |
| verify / health | `app/scripts/mlb-slate-completeness-gate.mjs` | free | `status/mlb-production-health.json` |
| settlement (research) | `app/scripts/join-mlb-pregame-settlements.mjs` | free | `data/internal/…/settlement-joins/…` |
| build | `npm run build` (in `app/`) | free | `app/out/` |

## Automation

- **`morning-projections.yml`** (cron 13:30 UTC) → **board** (step 1). Already automated. Uses the CI `ODDS_API_KEY` secret.
- **`mlb-pregame-capture.yml`** (8 crons/day) → **research archive** (step 2) + research settlement. Independent of the public product.
- **`mlb-daily-production.yml`** (NEW — chains after morning-projections via `workflow_run`, + backstop cron 14:15 UTC, + `workflow_dispatch`) → **steps 3–6**: team markets → player props → simulations → verify → commit. **This closes the gap** that previously left the slate incomplete after board generation.

### The gap this closed (root cause)
Before: `morning-projections` produced the board, but steps 3–5 (`ingest-mlb-team-markets`, `ingest-mlb-slate`, `generate-mlb-game-simulations`) were **not wired into any daily cron** — the sim step was manual, and the prop ingest lived only in the **dormant** `mlb-daily.yml`. So the slate was board-only → `SIMULATION_PENDING` → the public "today's games" showed "not yet simulated". `mlb-daily-production.yml` now runs all three automatically after the board.

## Odds API
- Key comes ONLY from the GitHub Actions secret `ODDS_API_KEY` (never local `.env` in CI; never logged; never written into an artifact). The ingest scripts mask the key in errors. Both paid ingests read `process.env.ODDS_API_KEY` first (CI secret), falling back to repo-root `.env` only for local dev.
- Credit guard (fail-closed, on BOTH paid ingests): a FREE `/v4/sports` probe reads `x-requests-remaining` before any paid call and aborts (honest no-op) below the floor, so daily automation can never silently drain the budget. The floor is threaded under both names the scripts read — `ODDS_API_MIN_CREDITS_REMAINING` (props) and `ODDS_CREDIT_FLOOR` (team-markets) — from one CI var (default **2000**). An invalid/missing key yields a clear failure and an honest no-op (nothing fabricated).

### CI invocation contract (non-obvious, guarded by `mlb-daily-production-guards.test.mjs`)
- `ingest-mlb-team-markets.mjs` and `ingest-mlb-slate.mjs` **import `.ts`** (e.g. `projection-framework.ts`) → run via **`npx tsx`**, never bare `node` (bare node throws `ERR_UNKNOWN_FILE_EXTENSION`).
- `ingest-mlb-team-markets.mjs` **requires `--write`** (it refuses to run with only `--date`; `--dry-run` fetches without writing). `ingest-mlb-slate.mjs` writes by default.

## Completeness / honesty
`mlb-slate-completeness-gate.mjs` derives the slate status:
- **REQUIRED to publish:** board + game-simulations. A board with no sim ⇒ `SIMULATION_PENDING` (public "Simulation pending").
- **IF-AVAILABLE:** team-markets, player-props. Their absence ⇒ `AWAITING_MARKET_DATA` (public "Awaiting market data"), never a fabricated ready state.
- No games ⇒ `NO_GAMES` (honest empty). No board ⇒ `NO_BOARD` (fail-closed; the CI publish step aborts).

## Daily health monitor
`data/internal/mlb/pregame-archive/status/mlb-production-health.json` (`public:false`) is the founder's at-a-glance daily row. Flat fields:

| field | source |
|---|---|
| `date` | slate date |
| `boardGenerated` / `teamMarketsGenerated` / `playerPropsGenerated` / `simulationGenerated` | artifact presence on disk |
| `slateStatus` / `missingArtifacts` / `readyToPublish` / `publicLabel` | completeness gate |
| `creditsRemaining` | ingest sidecar `odds-credits.json` (props runs last ⇒ freshest post-ingest balance); `null` if not measured |
| `buildStatus` | `pending` at the gate step, finalized to the build step's `outcome` by the post-build pass |

Detailed per-artifact counts live under `artifacts.*` (games/picks/runCount/props). A per-date copy `mlb-production-health-<date>.json` is also written, and the report is uploaded as a CI diagnostics artifact every run.

## Research independence
The research warehouse (step 2 + settlement join + `ResearchObservation` assembler) is **separate** from the public product. Research models remain BLOCKED until 30 dates / 500 settled observations + founder approval. The public 10k sim is the existing approved product; it is not the blocked research model.
