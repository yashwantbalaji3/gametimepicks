# MLB Simulation Foundation + Daily Operations (2026-07-22)

Architecture, benchmarking, readiness monitoring, and daily cadence for the internal MLB research warehouse — the groundwork a future SimTheGame-style engine would use. **This is architecture + data plumbing only: NO model, NO training, NO prediction, NO probability is produced or surfaced. Modeling stays BLOCKED until the research gate passes (30 dates / 500 settled-eligible observations) AND the founder approves.** Money md5 `affe6b21071f2b3be96bb2774eb347c3` unchanged; no public output, no product change.

## SimulationFeatureContract (Phase 2 — architecture only)

`app/src/lib/mlb/simulation/simulation-feature-contract.ts` declares the SHAPES a future engine consumes, drawn from the leakage-safe `ResearchObservation`:

- **SimulationInput** — `game` (teams / venue / weather / park), `pitcher` (starter / rest / workload / recentForm), `batter` (splits / form / matchup / vsPitcher / lineupSlot / paOpportunity), `market` (sportsbook + no-vig probability).
- **OutcomeLabelKey** — strikeouts, outs, earned_runs, hits, total_bases, home_runs, rbi, runs, hits_runs_rbi, moneyline, run_line, team_total (the deterministic settleable labels).
- **SimulationResult** — `{ probabilityOver, probabilityUnder, expectedValue, confidence, uncertainty, featureCoverage, coverageScore, note }`. Every probability/EV/confidence field is **null** until a validated engine exists post-gate; only `coverageScore` (deterministic) is computed now.
- `featureCoverageOf(obs)` + `coverageScore(cov)` — pure, deterministic feature-coverage helpers (safe to run today). `SIMULATION_CONTRACT_GUARDRAILS` asserts `producesPredictions:false`, `producesProbabilities:false`, `public:false`.

Every materialized `ResearchObservation` now carries `featureCoverage { pitcherStatus, pitcherWorkload, lineup, bullpen, matchup, batterSplits, batterForm, batterVsPitcher, paOpportunity, park, environment, market }` + `coverageScore`.

## Benchmark framework (Phase 3 — does not run until settled data exists)

`app/src/lib/mlb/simulation/benchmark.ts` — pure `brierScore` / `logLoss` / `accuracy` / `calibrationBins` / `roiSim`, plus `BASELINES` (sportsbook implied, **de-vig market**, historical base rate, player average). `app/scripts/mlb-research-benchmark.mjs` scores the captured market baselines on the settled set → `status/benchmark.json`. **Current: INSUFFICIENT (0/500 settled).** A future model is "predictive" **only if it beats the de-vig market baseline OUT OF SAMPLE**, after the gate + approval.

## Readiness monitor (Phase 7 — never says "model ready")

`app/scripts/mlb-simulation-readiness.mjs` → `status/simulation-readiness.json`: dates X/30, settled X/500, feature/lineup/market coverage %, data-quality verdict, and a **SIMULATION READINESS %** bound by the settled-data constraint. Current: dates 2/30, settled **0/500**, readiness **0%**, modeling **BLOCKED**. High feature coverage never implies readiness.

## Data-quality hardening (Phase 4)

`app/scripts/monitor-mlb-research-quality.mjs` scans **9 feature families** + join rows with: duplicate rows, missing outcomes, impossible stats (market + split-rate + form bounds), timestamp/leakage violations (per family), stale odds, join failures, missing timestamps, duplicate features (per-game vs per-player dedup), sample-size flags. Current: **all PASS**.

## Daily operations cadence (Phase 6)

`.github/workflows/mlb-pregame-capture.yml` runs ~8×/day (approximate UTC crons). The cadence maps to pregame windows:

| window | steps |
|---|---|
| **T‑24h** | game archive (StatsAPI snapshot) · pitcher status · **pitcher workload/rest** |
| **T‑6h** | team markets + player props (paid, capped) · **batter splits / form / vs-pitcher / park** |
| **T‑3h → T‑30m** | **multi-cadence lineup** (window-tagged) · **matchup** + **PA-opportunity** fill as the lineup posts |
| **postgame** | **settlement join** (`--lookback 3`, official box scores) once games are final |
| **next runs** | **ResearchObservation** assembly · quality monitor · benchmark · readiness |

Every step is **non-blocking** (`continue-on-error`), free-StatsAPI where possible, and writes only the internal archive (path-scoped, size-guarded commit). GitHub cron is approximate — correctness relies on the per-record eligibility gate (`capturedAt < eventStartTime`), not exact firing.

## Feature families (leakage-safe, internal, no modeling)

pitcher_status · environment (weather+roof) · umpire · **pitcher_workload** · **confirmed_lineup (multi-cadence)** · **bullpen_availability** · **batter_matchup** · **batter_splits** · **batter_form** · **park_factors** · **batter_vs_pitcher** · **plate_appearance_opportunity**. Weather (temp/condition/wind) is captured via `environment`; precipitation/humidity are not provided by StatsAPI (documented gap). Numeric park factors remain **neutral placeholders** with a documented update policy (no trustworthy source loaded — never fabricated).

## Blockers before a simulation engine

1. **Settled volume — 0/500** (binding). 2. **≥30 dates** (currently 2). 3. Out-of-sample validation harness must show a model beating the de-vig market. 4. Founder approval. Until all four, this remains accumulation + quality-checking only.
