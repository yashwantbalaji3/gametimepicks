# Runbook — Methodology Dry-Run Workflow

_Run the methodology framework over a generated board to produce candidate `PredictionOutput`s —
**without publishing a slate and without touching Bank Builder**._

## What it is
`app/scripts/methodology-dryrun.mjs` is the bridge between the Python prediction pipeline (which
writes board JSON) and the TypeScript methodology framework (`app/src/lib/methodology/*`). It reads a
generated board **read-only**, maps every lean through the leakage-safe adapter, and emits the
canonical `PredictionOutput` for each candidate — confidence, risk, missing/stale/sample flags, top
positive/negative factors, and the leakage pass/fail.

It is a **dry run**: it never writes a published slate, never writes into a board / parlay / optimizer
/ Bank-Builder directory (those paths are hard-refused), and never launches a Bank Builder run.

## Command
```
cd app
npx tsx scripts/methodology-dryrun.mjs [--date YYYY-MM-DD] [--sport MLB] \
    [--no-market] [--limit N] [--out <scratch-path>] [--json]
```
- `--date` — slate date; default = the latest available board for the sport.
- `--sport` — `MLB` (default). NBA boards are empty out of season; NBA/`WORLD_CUP` extractors are the
  next wiring step and are intentionally **not** fabricated.
- `--no-market` — use the `no_market_model` path (drops market-implied probability + edge; the model
  projection still drives the pick). Omit for the default `market_aware_model`.
- `--limit N` — number of example predictions to print (default 8).
- `--out P` — write the full `{meta, predictions, rejectedByLeakage}` JSON to `P`. Refused if `P` is
  under any published-slate path.
- `--json` — print the full JSON to stdout instead of writing a file.

## What the adapter enforces (per prediction)
1. **Leakage gate first** — `validateLeakage()` runs before a prediction is accepted
   (`feature_timestamp ≤ prediction_time < event_start_time`; rolling windows exclude the target).
   Failures are dropped into `rejectedByLeakage` and never used.
2. **Implemented-only live inputs** — only registry features with status `implemented` feed scoring.
   `planned` / `not_available` features are excluded from scoring and surfaced as missing/planned
   context. Absent board values become missing flags — never invented numbers.
3. **Confidence (≠ probability)** via `computeConfidence()`; a missing critical input forces **No Bet**.
4. **Risk / fragility** via `computeRisk()` (role uncertainty, stale/missing data, small sample,
   volatile market, fragile prop type, DNP/scratch risk).
5. **Data-quality grade** (A–D / unavailable) and **model mode** (`market_aware_model` /
   `no_market_model`).

## Reading the output
The summary prints: source board, prediction time, model mode, candidate count, leakage pass/fail,
the confidence + data-quality distributions, average risk, and example rows with their top
positive/negative factor and any planned/not-available context. A trailing banner restates that no
slate was published and no Bank Builder was launched.

## Where it does NOT go
This command does not generate a board, does not call any paid odds API, does not mutate settled
results, and does not write a slate. To **generate** a board, use the daily prediction workflow; this
command only analyzes one that already exists.
