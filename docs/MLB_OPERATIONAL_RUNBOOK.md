# MLB Daily Production — Operational Runbook

How the daily MLB slate runs itself, how to read its health, and how to recover when a step fails. Money-independent throughout: nothing in this pipeline writes bankroll / portfolio / Bank Builder / Moonshot / official settlement. Portfolio md5 `affe6b21071f2b3be96bb2774eb347c3`.

See also: [MLB_DAILY_PIPELINE.md](MLB_DAILY_PIPELINE.md) (architecture), [SIMULATION_ENGINE_ROADMAP.md](SIMULATION_ENGINE_ROADMAP.md), [MLB_FEATURE_COVERAGE_ROADMAP.md](MLB_FEATURE_COVERAGE_ROADMAP.md).

---

## What happens every morning

| ~UTC | Workflow | Does | Cost |
|---|---|---|---|
| 13:30 | `morning-projections` | Generates the **board** (`boards/<date>.json`) + schedule + power from projections | paid (board odds) |
| 13:30→ | `mlb-daily-production` (chains via `workflow_run`) | board precheck → **team-markets** → **player-props** → **10k simulations** → completeness gate → `npm ci` + build → finalize buildStatus → path-scoped money-safe commit | paid ingests + free sim/build |
| 14:15 | `mlb-daily-production` (cron backstop) | Same, in case the chain was skipped | same |
| 11:00, 15:00–01:00 (several) | `mlb-pregame-capture` | Captures leakage-safe pregame research features → freeze → settlement join → ResearchObservation build → benchmark → readiness + progress | free StatsAPI (market capture is opt-in paid) |

Net effect by mid-morning ET: a complete public slate (`SLATE STATUS: READY`) rendered on /mlb, /today, /simulate, and per-game pages — with an honest health record written to `data/internal/mlb/pregame-archive/status/mlb-production-health.json` and a persisted daily copy under `data/internal/mlb/production-history/<date>.json`.

## Which steps spend credits (Odds API) vs are free

**Paid (Odds API, the-odds-api v4):**
- `morning-projections` board generation.
- `ingest-mlb-team-markets.mjs` — **1 bulk call**, ~3 credits/day (h2h + spreads + totals for all games).
- `ingest-mlb-slate.mjs` — **1 call per game**, ~40–50 credits/day (player-prop markets).
- `capture-mlb-pregame-markets.mjs` / `-player-props.mjs` — **opt-in** research market capture (gated by repo vars; off unless enabled).

**Free (no network cost / StatsAPI only):**
- `generate-mlb-game-simulations.mjs` — deterministic 10k sim, reads only the board.
- `mlb-slate-completeness-gate.mjs` — reads artifacts on disk.
- `npm ci` + `npm run build` — static export.
- All `capture-mlb-pregame-*` StatsAPI feature captures, settlement join, observation build, benchmark, readiness, research-progress.

**Credit guard:** both paid ingests run a FREE probe before any paid call and abort (honest no-op, nothing fabricated) below `ODDS_API_MIN_CREDITS_REMAINING` / `ODDS_CREDIT_FLOOR` (default **2000**). Current balance ≈ 14.5k → hundreds of days of runway. Each run records `creditsBefore / creditsAfter / creditsSpent` in the health file.

## Daily health monitor

`data/internal/mlb/pregame-archive/status/mlb-production-health.json` (and the committed `production-history/<date>.json`) — the founder's at-a-glance row:

```
date, workflowRunId,
boardGenerated, teamMarketsGenerated, playerPropsGenerated, simulationGenerated,
slateStatus, missingArtifacts, failureReason,
creditsBefore, creditsAfter, creditsSpent, creditsRemaining, buildStatus,
artifactCounts { boardGames, teamMarketGames, playerProps, simGames, simPicks }
```

`slateStatus` ∈ `NO_BOARD` (fail-closed, nothing published) · `NO_GAMES` · `SIMULATION_PENDING` · `AWAITING_MARKET_DATA` · `READY`. A board without a sim is **never** publishable; missing markets yield `AWAITING_MARKET_DATA`, never a fabricated ready state.

## How to diagnose failures

1. **Read the health file first.** `slateStatus` + `failureReason` name the problem; `buildStatus` tells you if the build compiled; `missingArtifacts` lists what's absent.
2. **Map the status to a cause:**
   - `NO_BOARD` → `morning-projections` didn't run or failed. The completion workflow correctly skipped (nothing published).
   - `SIMULATION_PENDING` → board present but the free sim step failed (rare — deterministic, no network). Check the sim step log.
   - `AWAITING_MARKET_DATA` → both paid ingests returned nothing: invalid/absent `ODDS_API_KEY` secret, credits below floor, or provider had no lines. Not fabricated.
   - `buildStatus: failure` → the static build broke (a data-shape or code issue). The slate data still committed; the public site rebuilds on the next deploy.
3. **Read the workflow run.** `gh run list --workflow mlb-daily-production.yml` → `gh run view <id> --log`. The paid steps are `continue-on-error` and print an honest "failed/blocked — nothing fabricated" line rather than aborting; read the step **output**, not just its conclusion.
4. **Credits:** if `creditsSpent` is 0 and markets are missing, the guard tripped — check `creditsBefore` vs the floor.

## How to recover

- **Re-run the whole day:** `gh workflow run mlb-daily-production.yml --ref main -f date=YYYY-MM-DD`. Idempotent — the ingests overwrite and the commit is path-scoped; re-running never double-counts.
- **Board missing:** re-run `morning-projections` first (it owns the board), then the completion workflow chains automatically.
- **Key/credits:** `ODDS_API_KEY` is a GitHub Actions secret (never local `.env` in CI). If invalid, ingests no-op honestly; rotate the secret, then re-run. Never commit a key.
- **Build failure:** reproduce locally with `cd app && npm ci && npm run build`; fix the source; the next run (or a manual re-run) flips `buildStatus` back to `success`.
- **Never** hand-edit public artifacts to force `READY`, and never force-push. Reconcile bot commits with `git pull --rebase`.

---

## Daily operator checklist (Phase 9)

Every day, confirm (all readable from the one health file):

1. **Board exists** — `boardGenerated: true` (else `morning-projections` is the blocker).
2. **Markets exist** — `teamMarketsGenerated: true` (Game Center moneyline).
3. **Props exist** — `playerPropsGenerated: true`.
4. **Simulation exists** — `simulationGenerated: true` (the sim-ready driver).
5. **Build succeeds** — `buildStatus: success`.
6. **Health = READY** — `slateStatus: "READY"`, `missingArtifacts: []`, `failureReason: null`.
7. **No money mutations** — portfolio md5 still `affe6b21071f2b3be96bb2774eb347c3`; record 19-14; open exposure $0. (The commit is grep-guarded against any money/BB/Moonshot path.)

One-liner:
```
node app/scripts/mlb-slate-completeness-gate.mjs --date $(TZ=America/New_York date +%F)
md5 -q app/public/data/mr-dub/portfolio.json   # expect affe6b21071f2b3be96bb2774eb347c3
```

Founder-only responsibilities: **monitor Odds credits** (floor 2000) and **approve future research models** once the 30-date/500-observation gate passes. Everything else is autonomous.
