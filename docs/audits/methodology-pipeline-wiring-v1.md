# Audit — Methodology Pipeline Wiring v1

_Branch `methodology-pipeline-wiring-v1` off main `9d497e0`. Follows "Methodology and process framework v1" (#506)._

## Objective
Wire the existing methodology framework (`app/src/lib/methodology/*`) into the **real** prediction
pipeline so it produces genuine `PredictionOutput` rows for a dated slate — **in dry-run only**, with
no slate published and no Bank Builder launched.

## Architecture reality (from inventory)
Predictions are generated in **Python** and written as JSON boards
(`app/public/data/mlb/boards/<date>.json`, `app/public/data/boards/<date>.json`). **TypeScript is the
presentation/validation layer** over those boards. The methodology framework is TypeScript. So the
correct wiring point is a **TS adapter** that consumes a generated board (the real model inputs) plus
a **tsx dry-run command** — not a rewrite of the Python models.

## What this PR adds
- `app/src/lib/methodology/adapter.ts` — maps a board lean → `PredictionSnapshotMetadata` +
  leakage-safe rolling windows, runs `validateLeakage()`, filters the sport registry to
  **implemented-only** live inputs (planned/not_available surfaced as missing/planned context),
  computes `computeConfidence()` + `computeRisk()`, and emits the canonical `PredictionOutput`.
  Supports `market_aware_model` vs `no_market_model`. MLB extractor (the active, populated sport)
  + generic core; NBA/WORLD_CUP extractors are a documented next step (NBA boards are empty in-season
  June; WC uses a separate data shape) — left honest, not fabricated.
- `app/scripts/methodology-dryrun.mjs` — reads an existing board **read-only**, runs the adapter, and
  prints leakage pass/fail, confidence, risk, and feature attribution. Optional `--out` writes to a
  **non-published** path; it refuses any path under the published board/parlay/optimizer/Bank-Builder
  directories.
- `app/src/lib/methodology/adapter.test.mjs` — proves the required invariants (below).
- `docs/runbooks/methodology_dryrun_workflow.md` + a pointer from the daily prediction runbook.

## Non-negotiables honored
- **No Bank Builder launched / no slate published** — the dry-run writes nothing to any published
  slate path; the command hard-refuses board/parlay/optimizer/BB output paths.
- **No historical/settled mutation** — board JSON is read-only input.
- **No fabrication** — only `implemented` registry features are live inputs; `planned`/`not_available`
  are excluded from scoring and surfaced as missing/planned context; absent board values become
  missing flags, never invented numbers.
- **Leakage-gated** — every accepted prediction passes `validateLeakage()`
  (`feature_timestamp ≤ prediction_time < event_start_time`; rolling windows exclude the target).

## Proven by tests
target-event data excluded · stale critical inputs lower confidence · missing critical inputs force
**No Bet** · planned/not_available features are not used as live inputs · market-aware and no-market
paths remain separable · dry-run output carries leakage/confidence/risk/factors/flags.

## Verification (recorded at PR time)
`npx tsc --noEmit` · `npx tsx --test` (all app tests) · dry-run executed on a real board · no BB
launch · no slate mutation. Results captured in the PR description.
